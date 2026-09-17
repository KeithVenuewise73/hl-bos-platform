// ---------------------------------------------------------------------------
// The cockpit's pure logic.
//
// No React, no network, no `getSupabase()`. Everything here is a function of
// its arguments, which is why it is the part of the app that can be tested
// exhaustively — and it is deliberately where every honesty rule that the UI
// depends on lives, rather than being spread through the screens.
//
// Three of these functions mirror a rule the database also enforces
// (proposalProblems, offerLineFor, bundleStatus). That duplication is
// intentional and is NOT a second implementation of the rule: the database
// remains the authority and will refuse regardless. These exist so an operator
// sees "the review engine has not shipped" while filling the form instead of a
// raw 23514 after submitting it. Where the two could ever disagree, the
// database wins and the screen shows its message verbatim.
// ---------------------------------------------------------------------------

import type {
  Capability,
  Catalog,
  Confidence,
  EnabledCapability,
  OfferLine,
  PipelineEntry,
  PipelineRun,
  Pricing,
  ProposalDocument,
  Report,
} from "./api";

// ── Pricing ────────────────────────────────────────────────────────────────

/**
 * The STARTING values for a new proposal, not the price of anything.
 *
 * Pricing is data: it is stored inside the proposal document, so it is per
 * proposal, editable before sending, and changeable without a migration or a
 * deploy. These numbers are the current managed-service model under test
 * ($1,500 setup + $750/month) and the builder shows them in editable fields —
 * what gets stored is whatever the operator confirmed, never a constant read
 * back at render time.
 */
export const PRICING_DEFAULTS: Pricing = {
  currency: "USD",
  setup_cents: 150_000,
  monthly_cents: 75_000,
  term_months: null,
};

/** Cents to a displayable amount. Returns a dash for absent, never "$0.00". */
export function money(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// ── Pipeline stages ────────────────────────────────────────────────────────

export type Stage = "new" | "called" | "audited" | "proposed" | "sold" | "delivering";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: "Imported. Nothing has happened yet." },
  { key: "called", label: "Called", hint: "A discovery call was answered." },
  { key: "audited", label: "Audited", hint: "An audit run has finished." },
  {
    key: "proposed",
    label: "Proposed",
    hint: "A proposal exists and is not yet accepted.",
  },
  { key: "sold", label: "Sold", hint: "Proposal accepted. Not onboarded yet." },
  {
    key: "delivering",
    label: "Delivering",
    hint: "Has its own tenant and shop record.",
  },
];

/**
 * Where a prospect actually is. Read from facts in the database, in reverse
 * order so the furthest one reached wins — a shop that was onboarded is
 * "delivering" whatever else is also true of it.
 *
 * A run still `running` does NOT advance the stage: an audit in progress has
 * established nothing yet, and the board would otherwise claim work that has
 * not been done.
 */
export function stageOf(e: PipelineEntry): Stage {
  if (e.onboarding) return "delivering";
  if (e.latest_proposal?.status === "accepted") return "sold";
  if (e.latest_proposal) return "proposed";
  if (e.latest_run && e.latest_run.status !== "running") return "audited";
  if (e.discovery?.answered_at) return "called";
  return "new";
}

export function groupByStage(entries: PipelineEntry[]): Record<Stage, PipelineEntry[]> {
  const out: Record<Stage, PipelineEntry[]> = {
    new: [],
    called: [],
    audited: [],
    proposed: [],
    sold: [],
    delivering: [],
  };
  for (const e of entries) out[stageOf(e)].push(e);
  return out;
}

// ── Scores, coverage and evidence ──────────────────────────────────────────

/**
 * How to render a composite score WITHOUT lying about it.
 *
 * A bare 0 is ambiguous in a way that matters commercially: it can mean "we
 * looked and the shop scored nothing" or "nothing ever reached this
 * dimension". Production makes that concrete — 35 of the 40 recorded runs read
 * completed at 1 of 1 with a composite of 0, and 5 read partially_completed at
 * 0 of 1 with no score at all. So a score is only a number when its coverage
 * is complete; otherwise the caller gets the number AND the shortfall, or no
 * number at all.
 */
export function scoreDisplay(run: PipelineRun | null): {
  value: string;
  qualifier: string | null;
  complete: boolean;
} {
  if (!run) return { value: "—", qualifier: "Not audited", complete: false };
  const { scored, possible } = run.coverage;
  if (run.composite_score === null) {
    return {
      value: "—",
      qualifier:
        possible === 0
          ? "The campaign weighted no dimensions"
          : `Nothing scored — 0 of ${possible} dimensions assessed`,
      complete: false,
    };
  }
  if (scored < possible) {
    return {
      value: String(run.composite_score),
      qualifier: `From ${scored} of ${possible} dimensions only`,
      complete: false,
    };
  }
  return {
    value: String(run.composite_score),
    qualifier: `All ${possible} dimensions assessed`,
    complete: true,
  };
}

export function evidenceWord(c: Confidence): string {
  if (c === "verified") return "Verified";
  if (c === "inferred") return "Inferred";
  return "Unknown";
}

/**
 * The sentence shown above any set of findings before they are quoted to a
 * shop. In production all 45 recorded findings are `inferred` with no evidence
 * URL, so this is the common case, not the edge case.
 */
export function evidenceNote(findings: number, evidenced: number): string {
  if (findings === 0) return "No findings were recorded.";
  if (evidenced === 0)
    return `None of the ${findings} findings carries an evidence URL. Every one of them is inferred — do not present any of it to the shop as something we checked.`;
  if (evidenced < findings)
    return `${evidenced} of ${findings} findings carry an evidence URL. The other ${findings - evidenced} are inferred and must be described as such.`;
  return `All ${findings} findings carry an evidence URL.`;
}

/** True when nothing in this run may be quoted as verified fact. */
export function isWhollyInferred(run: PipelineRun | null): boolean {
  return !!run && run.findings > 0 && run.evidenced_findings === 0;
}

// ── Capabilities ───────────────────────────────────────────────────────────

/** Why a capability cannot be switched on, in the operator's words. Null when it can. */
export function capabilityBlocker(c: Capability): string | null {
  if (c.status === "available") return null;
  if (c.status === "deferred")
    return "Deferred — a decision not to build it. It cannot be switched on and must not appear in a proposal in any form.";
  const who =
    c.blocker_owner === "ceo"
      ? "Waiting on a business decision or an account"
      : c.blocker_owner === "engineering"
        ? "Waiting on engineering"
        : "Blocked";
  return c.blocked_on ? `${who}: ${c.blocked_on}` : who;
}

/**
 * Prerequisites this shop has not switched on yet. The database refuses the
 * enable outright; this is so the button can say what is missing first.
 */
export function missingPrerequisites(
  c: Capability,
  enabled: EnabledCapability[],
): { key: string; reason: string }[] {
  const on = new Set(enabled.map((e) => e.capability_key.toLowerCase()));
  return c.requires.filter((r) => !on.has(r.key.toLowerCase()));
}

export type BundleVerdict = { kind: "ready" } | { kind: "blocked"; note: string };

/**
 * apply_bundle() is all-or-nothing: it refuses the first capability in the
 * bundle that has not shipped, and nothing is enabled. Today no seeded bundle
 * passes that test, so the Apply control must be disabled with the reason
 * beside it rather than offered and then refused.
 */
export function bundleStatus(b: {
  shipped: number;
  total: number;
  deliverable_today: boolean;
  blocked_by: string[];
}): BundleVerdict {
  if (b.deliverable_today) return { kind: "ready" };
  const names = b.blocked_by.join(", ");
  return {
    kind: "blocked",
    note: `${b.shipped} of ${b.total} have shipped. Applying this bundle is refused until ${names || "the rest"} ship, because it is applied all at once or not at all.`,
  };
}

// ── The proposal document ──────────────────────────────────────────────────

/**
 * One offer line, with deliverable_today DERIVED from the catalog rather than
 * chosen. enforce_proposal_honesty() rejects a document that claims a
 * capability is deliverable when the catalog says otherwise, so letting an
 * operator set this by hand would only produce a refusal they cannot fix.
 */
export function offerLineFor(c: Capability, note = ""): OfferLine {
  return {
    capability: c.key,
    deliverable_today: c.status === "available",
    note,
  };
}

/** Capabilities that may appear in a proposal at all. `deferred` may not, in any form. */
export function offerableCapabilities(cat: Catalog): Capability[] {
  return cat.capabilities.filter((c) => c.status !== "deferred");
}

/**
 * The problems the database would raise, found before it is asked.
 *
 * Mirrors enforce_proposal_honesty() (a capability must be in the catalog;
 * `deferred` must not appear; deliverable_today only where the catalog says
 * 'available') plus send_proposal()'s refusal of an empty offer. The database
 * is still the authority: this exists so the form can show the reason next to
 * the field instead of after the submit.
 */
export function proposalProblems(doc: ProposalDocument, cat: Catalog): string[] {
  const byKey = new Map(cat.capabilities.map((c) => [c.key.toLowerCase(), c]));
  const problems: string[] = [];

  if (doc.offer.length === 0)
    problems.push(
      "The proposal offers nothing. A document with an empty offer cannot be sent.",
    );

  const seen = new Set<string>();
  for (const line of doc.offer) {
    const key = line.capability.trim().toLowerCase();
    if (!key) {
      problems.push("An offer line names no capability.");
      continue;
    }
    if (seen.has(key)) problems.push(`${line.capability} appears in the offer twice.`);
    seen.add(key);

    const c = byKey.get(key);
    if (!c) {
      problems.push(
        `${line.capability} is not in the BarberOS catalog, so it cannot be offered. The catalog is the vocabulary.`,
      );
      continue;
    }
    if (c.status === "deferred")
      problems.push(
        `${c.name} is deferred — a decision not to build it — and must not appear in a proposal in any form.`,
      );
    else if (line.deliverable_today && c.status !== "available")
      problems.push(
        `${c.name} is offered as deliverable today, but the catalog says it is ${c.status}.`,
      );
  }

  if (doc.pricing.setup_cents < 0 || doc.pricing.monthly_cents < 0)
    problems.push("A price cannot be negative.");
  if (doc.pricing.setup_cents === 0 && doc.pricing.monthly_cents === 0)
    problems.push(
      "The proposal names no price. Set the setup fee, the monthly fee, or both.",
    );
  if (!doc.headline.trim())
    problems.push(
      "The proposal has no headline, so there is nothing for the shop to read first.",
    );

  return problems;
}

/**
 * Build a first draft from a finished audit.
 *
 * Findings are carried across WITH their confidence and evidence URL, never
 * flattened into claims. Recommendations become offer lines only where the
 * recommendation actually named a capability — a recommendation with no
 * capability behind it is advice, not something to sell.
 */
export function draftFromReport(args: {
  report: Report;
  catalog: Catalog;
  pricing?: Pricing;
}): ProposalDocument {
  const { report, catalog: cat } = args;
  const byKey = new Map(cat.capabilities.map((c) => [c.key.toLowerCase(), c]));

  const offer: OfferLine[] = [];
  const used = new Set<string>();
  for (const rec of report.recommendations) {
    if (!rec.capability_key) continue;
    const key = rec.capability_key.toLowerCase();
    if (used.has(key)) continue;
    const c = byKey.get(key);
    // A deferred capability is excluded here rather than offered and rejected.
    if (!c || c.status === "deferred") continue;
    used.add(key);
    offer.push(offerLineFor(c, rec.title));
  }

  const evidenced = report.findings.filter((f) => f.evidence_url !== null).length;

  return {
    headline: `What we found at ${report.shop.business_name}`,
    summary: "",
    pricing: args.pricing ?? { ...PRICING_DEFAULTS },
    offer,
    cited_findings: report.findings.map((f) => ({
      code: f.code,
      statement: f.statement,
      confidence: f.confidence,
      evidence_url: f.evidence_url,
    })),
    from_run: report.run_id,
    evidence: { findings: report.findings.length, evidenced },
  };
}

// ── Small helpers ──────────────────────────────────────────────────────────

/**
 * A tenant slug from a shop name. platform.tenants enforces its own format, so
 * this only has to produce something plausible — the operator can edit it, and
 * a collision comes back as 23505 with the reason.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A date, or a plain statement that there is not one. Never a fabricated placeholder. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The retention sentence for one client. Deliberately refuses to produce a
 * number where client_rhythm() refused to: fewer than three visits is not a
 * rhythm, and "0 days overdue" from an unknown rhythm would read as "on time".
 */
export function rhythmNote(r: {
  visits: number;
  typical_days: number | null;
  overdue_by_days: number | null;
  basis: string;
}): string {
  if (r.visits === 0) return "Never visited.";
  if (r.typical_days === null)
    return `${r.visits} visit${r.visits === 1 ? "" : "s"} — not enough to know a rhythm yet.`;
  if (r.overdue_by_days === null) return `Comes in about every ${r.typical_days} days.`;
  if (r.overdue_by_days <= 0)
    return `Comes in about every ${r.typical_days} days, and is on time.`;
  return `Comes in about every ${r.typical_days} days, and is ${r.overdue_by_days} days overdue.`;
}
