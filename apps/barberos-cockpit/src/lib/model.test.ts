import { describe, it, expect } from "vitest";

import {
  PRICING_DEFAULTS,
  STAGES,
  bundleStatus,
  capabilityBlocker,
  draftFromReport,
  evidenceNote,
  groupByStage,
  isWhollyInferred,
  missingPrerequisites,
  money,
  offerLineFor,
  offerableCapabilities,
  proposalProblems,
  rhythmNote,
  scoreDisplay,
  slugify,
  stageOf,
  when,
} from "./model";
import type {
  Capability,
  Catalog,
  EnabledCapability,
  PipelineEntry,
  PipelineRun,
  ProposalDocument,
  Report,
} from "./api";

// ── Fixtures mirroring the real seeded catalog ─────────────────────────────
// Two capabilities are 'available' in production and in supabase/migrations
// 0049: client_crm and owned_website. Everything else is 'planned' or, for
// payments, 'deferred'. The fixtures keep that ratio because the honesty rules
// under test are only interesting when most of the catalog has not shipped.

function cap(over: Partial<Capability> & { key: string }): Capability {
  const status = over.status ?? "planned";
  return {
    name: over.key,
    category: "core",
    description: "",
    is_default: false,
    version: 1,
    locked_config_keys: [],
    blocked_on: null,
    blocker_owner: null,
    requires: [],
    ...over,
    status,
    // Kept consistent with status on purpose: the app derives what may be
    // offered from these two together, and a fixture where they disagree would
    // test a state the database cannot produce.
    is_available: status === "available",
  };
}

const CATALOG: Catalog = {
  capabilities: [
    cap({ key: "client_crm", name: "Client CRM", status: "available" }),
    cap({
      key: "owned_website",
      name: "Owned Website",
      status: "available",
      category: "presence",
    }),
    cap({
      key: "booking",
      name: "Booking & Scheduling",
      status: "planned",
      blocked_on: "Engineering only.",
      blocker_owner: "engineering",
      requires: [
        { key: "client_crm", reason: "An appointment belongs to a client record." },
      ],
    }),
    cap({
      key: "review_engine",
      name: "Reputation Engine",
      status: "planned",
      blocked_on: "A way to send the request and the shop's Google review link.",
      blocker_owner: "ceo",
      locked_config_keys: ["ask_only_if_happy", "gate_by_sentiment"],
      requires: [
        { key: "client_crm", reason: "A review request goes to a known client." },
      ],
    }),
    cap({
      key: "local_seo",
      name: "Local SEO Engine",
      status: "planned",
      category: "presence",
      blocked_on: "A Search Console property.",
      blocker_owner: "ceo",
      requires: [
        {
          key: "owned_website",
          reason: "You cannot do the work on a page they do not own.",
        },
      ],
    }),
    cap({
      key: "payments",
      name: "Payments",
      status: "deferred",
      category: "commerce",
    }),
  ],
  bundles: [
    {
      key: "starter",
      name: "Starter",
      description: "",
      capabilities: ["client_crm", "booking", "review_engine"],
      shipped: 1,
      total: 3,
      deliverable_today: false,
      blocked_by: ["booking", "review_engine"],
    },
    {
      key: "hypothetical",
      name: "Hypothetical",
      description: "",
      capabilities: ["client_crm", "owned_website"],
      shipped: 2,
      total: 2,
      deliverable_today: true,
      blocked_by: [],
    },
  ],
};

function run(over: Partial<PipelineRun> = {}): PipelineRun {
  return {
    run_id: "r1",
    status: "completed",
    composite_score: 40,
    coverage: { scored: 2, possible: 2 },
    findings: 3,
    evidenced_findings: 1,
    has_outreach_hook: true,
    started_at: "2026-09-01T10:00:00Z",
    finished_at: "2026-09-01T10:05:00Z",
    ...over,
  };
}

function entry(over: Partial<PipelineEntry> = {}): PipelineEntry {
  return {
    prospect_id: "p1",
    business_name: "Clarence Barber Co",
    phone: null,
    locality: "Clarence",
    region: "NY",
    website_url: null,
    has_gbp: false,
    discovery: null,
    latest_run: null,
    runs: 0,
    latest_proposal: null,
    proposals: 0,
    onboarding: null,
    ...over,
  };
}

// ── Money ──────────────────────────────────────────────────────────────────

describe("money", () => {
  it("formats whole dollars without cents", () => {
    expect(money(150_000)).toBe("$1,500");
    expect(money(75_000)).toBe("$750");
  });

  it("shows cents only when there are any", () => {
    expect(money(149_999)).toBe("$1,499.99");
  });

  // An absent price is not a free service. "$0.00" would be a claim.
  it("renders an absent amount as a dash, never as zero dollars", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
  });

  it("still renders a real zero as zero", () => {
    expect(money(0)).toBe("$0");
  });
});

describe("PRICING_DEFAULTS", () => {
  // The point of the assertion is not the numbers; it is that they are data on
  // an object the proposal builder copies and the operator edits, so a pricing
  // change never needs a migration.
  it("is a plain, copyable object the builder can mutate per proposal", () => {
    const copy = { ...PRICING_DEFAULTS, monthly_cents: 99_900 };
    expect(copy.monthly_cents).toBe(99_900);
    expect(PRICING_DEFAULTS.monthly_cents).toBe(75_000);
  });
});

// ── Stages ─────────────────────────────────────────────────────────────────

describe("stageOf", () => {
  it("starts a freshly imported shop at new", () => {
    expect(stageOf(entry())).toBe("new");
  });

  it("advances to called only once a call was ANSWERED", () => {
    expect(stageOf(entry({ discovery: { answered_at: null } }))).toBe("new");
    expect(stageOf(entry({ discovery: { answered_at: "2026-09-02T00:00:00Z" } }))).toBe(
      "called",
    );
  });

  // A run in progress has established nothing. Advancing on it would put work
  // on the board that has not been done.
  it("does not advance on an audit that is still running", () => {
    expect(
      stageOf(
        entry({
          discovery: { answered_at: "2026-09-02T00:00:00Z" },
          latest_run: run({
            status: "running",
            composite_score: null,
            finished_at: null,
          }),
        }),
      ),
    ).toBe("called");
  });

  it("advances to audited on a finished run, including a partial one", () => {
    expect(stageOf(entry({ latest_run: run({ status: "partially_completed" }) }))).toBe(
      "audited",
    );
    expect(stageOf(entry({ latest_run: run({ status: "failed" }) }))).toBe("audited");
  });

  it("advances to proposed on a draft and stays there when declined", () => {
    for (const status of ["draft", "sent", "declined", "withdrawn"] as const) {
      expect(
        stageOf(
          entry({
            latest_proposal: {
              id: "x",
              status,
              created_at: "2026-09-03T00:00:00Z",
              sent_at: null,
              decided_at: null,
            },
          }),
        ),
      ).toBe("proposed");
    }
  });

  it("advances to sold only on an accepted proposal", () => {
    expect(
      stageOf(
        entry({
          latest_proposal: {
            id: "x",
            status: "accepted",
            created_at: "2026-09-03T00:00:00Z",
            sent_at: "2026-09-04T00:00:00Z",
            decided_at: "2026-09-05T00:00:00Z",
          },
        }),
      ),
    ).toBe("sold");
  });

  it("reports delivering once a shop record exists, whatever else is true", () => {
    expect(
      stageOf(
        entry({
          onboarding: {
            onboarded_at: "2026-09-06T00:00:00Z",
            shop_name: "Clarence Barber Co",
            client_tenant_id: "t2",
          },
        }),
      ),
    ).toBe("delivering");
  });

  it("groups every entry into exactly one stage, and the board has a column for each", () => {
    const grouped = groupByStage([
      entry({ prospect_id: "a" }),
      entry({ prospect_id: "b", discovery: { answered_at: "2026-09-02T00:00:00Z" } }),
      entry({ prospect_id: "c", latest_run: run() }),
    ]);
    expect(Object.values(grouped).flat()).toHaveLength(3);
    expect(Object.keys(grouped).sort()).toEqual(STAGES.map((s) => s.key).sort());
  });
});

// ── The score never travels without its coverage ───────────────────────────

describe("scoreDisplay", () => {
  it("says not audited rather than showing a zero", () => {
    expect(scoreDisplay(null)).toEqual({
      value: "—",
      qualifier: "Not audited",
      complete: false,
    });
  });

  // This is the production case: 5 of the 40 recorded runs look exactly like it.
  it("refuses to show a number when nothing was scored", () => {
    const d = scoreDisplay(
      run({ composite_score: null, coverage: { scored: 0, possible: 1 } }),
    );
    expect(d.value).toBe("—");
    expect(d.qualifier).toBe("Nothing scored — 0 of 1 dimensions assessed");
    expect(d.complete).toBe(false);
  });

  // And this is the other 35: a real 0, which must not read as a verdict on
  // the shop when only one of three dimensions was ever looked at.
  it("qualifies a score drawn from partial coverage", () => {
    const d = scoreDisplay(
      run({ composite_score: 0, coverage: { scored: 1, possible: 3 } }),
    );
    expect(d.value).toBe("0");
    expect(d.qualifier).toBe("From 1 of 3 dimensions only");
    expect(d.complete).toBe(false);
  });

  it("marks a fully covered score complete", () => {
    const d = scoreDisplay(
      run({ composite_score: 62, coverage: { scored: 3, possible: 3 } }),
    );
    expect(d).toEqual({
      value: "62",
      qualifier: "All 3 dimensions assessed",
      complete: true,
    });
  });

  it("names the real reason when the campaign weighted nothing", () => {
    expect(
      scoreDisplay(run({ composite_score: null, coverage: { scored: 0, possible: 0 } }))
        .qualifier,
    ).toBe("The campaign weighted no dimensions");
  });
});

describe("evidenceNote", () => {
  it("says so plainly when nothing is evidenced", () => {
    expect(evidenceNote(45, 0)).toContain(
      "None of the 45 findings carries an evidence URL",
    );
    expect(evidenceNote(45, 0)).toContain("do not present any of it to the shop");
  });

  it("counts both halves when some are evidenced", () => {
    expect(evidenceNote(3, 1)).toBe(
      "1 of 3 findings carry an evidence URL. The other 2 are inferred and must be described as such.",
    );
  });

  it("does not claim evidence for an empty run", () => {
    expect(evidenceNote(0, 0)).toBe("No findings were recorded.");
  });

  it("confirms a fully evidenced run", () => {
    expect(evidenceNote(2, 2)).toBe("All 2 findings carry an evidence URL.");
  });
});

describe("isWhollyInferred", () => {
  it("flags a run whose every finding is inference", () => {
    expect(isWhollyInferred(run({ findings: 4, evidenced_findings: 0 }))).toBe(true);
  });
  it("does not flag a run with some evidence, or with no findings at all", () => {
    expect(isWhollyInferred(run({ findings: 4, evidenced_findings: 1 }))).toBe(false);
    expect(isWhollyInferred(run({ findings: 0, evidenced_findings: 0 }))).toBe(false);
    expect(isWhollyInferred(null)).toBe(false);
  });
});

// ── Capabilities ───────────────────────────────────────────────────────────

describe("capabilityBlocker", () => {
  it("returns nothing for a capability that has shipped", () => {
    expect(capabilityBlocker(CATALOG.capabilities[0]!)).toBeNull();
  });

  it("names the business blocker and does not call it an engineering one", () => {
    const note = capabilityBlocker(CATALOG.capabilities[3]!)!;
    expect(note).toContain("Waiting on a business decision or an account");
    expect(note).toContain("Google review link");
  });

  it("names engineering where engineering owns it", () => {
    expect(capabilityBlocker(CATALOG.capabilities[2]!)).toContain(
      "Waiting on engineering",
    );
  });

  // 'deferred' is not "later". It is a decision not to build.
  it("says a deferred capability cannot be switched on or offered at all", () => {
    const note = capabilityBlocker(CATALOG.capabilities[5]!)!;
    expect(note).toContain("a decision not to build it");
    expect(note).toContain("must not appear in a proposal");
  });
});

describe("missingPrerequisites", () => {
  const enabled = (keys: string[]): EnabledCapability[] =>
    keys.map((k) => ({
      capability_key: k,
      name: k,
      status: "available",
      enabled_at: "2026-09-01T00:00:00Z",
      enabled_via: "individual",
      bundle_key: null,
      source_ref: null,
      config: {},
    }));

  it("reports the prerequisite a shop has not switched on", () => {
    const missing = missingPrerequisites(CATALOG.capabilities[4]!, enabled([]));
    expect(missing).toEqual([
      {
        key: "owned_website",
        reason: "You cannot do the work on a page they do not own.",
      },
    ]);
  });

  it("reports none once it is on, matching case-insensitively as citext does", () => {
    expect(
      missingPrerequisites(CATALOG.capabilities[4]!, enabled(["Owned_Website"])),
    ).toEqual([]);
  });
});

describe("bundleStatus", () => {
  // No seeded bundle passes today. The control must say why rather than be
  // offered and then refused.
  it("blocks a bundle containing anything unshipped, and names it", () => {
    const v = bundleStatus(CATALOG.bundles[0]!);
    expect(v.kind).toBe("blocked");
    expect(v.kind === "blocked" && v.note).toContain("1 of 3 have shipped");
    expect(v.kind === "blocked" && v.note).toContain("booking, review_engine");
    expect(v.kind === "blocked" && v.note).toContain("all at once or not at all");
  });

  it("clears a bundle whose every capability has shipped", () => {
    expect(bundleStatus(CATALOG.bundles[1]!)).toEqual({ kind: "ready" });
  });
});

// ── The proposal document ──────────────────────────────────────────────────

describe("offerLineFor / offerableCapabilities", () => {
  it("derives deliverable_today from the catalog instead of trusting the caller", () => {
    expect(offerLineFor(CATALOG.capabilities[0]!).deliverable_today).toBe(true);
    expect(offerLineFor(CATALOG.capabilities[2]!).deliverable_today).toBe(false);
  });

  it("never offers the deferred capability as selectable", () => {
    const keys = offerableCapabilities(CATALOG).map((c) => c.key);
    expect(keys).not.toContain("payments");
    expect(keys).toContain("booking");
  });
});

describe("proposalProblems", () => {
  const doc = (over: Partial<ProposalDocument> = {}): ProposalDocument => ({
    headline: "What we found",
    summary: "",
    pricing: { ...PRICING_DEFAULTS },
    offer: [offerLineFor(CATALOG.capabilities[0]!)],
    cited_findings: [],
    from_run: null,
    evidence: null,
    ...over,
  });

  it("passes a document offering only what has shipped", () => {
    expect(proposalProblems(doc(), CATALOG)).toEqual([]);
  });

  it("refuses an empty offer, which is what send_proposal also refuses", () => {
    expect(proposalProblems(doc({ offer: [] }), CATALOG)[0]).toContain(
      "offers nothing",
    );
  });

  it("refuses a capability that is not in the catalog", () => {
    const p = proposalProblems(
      doc({
        offer: [{ capability: "ai_receptionist", deliverable_today: true, note: "" }],
      }),
      CATALOG,
    );
    expect(p[0]).toContain("not in the BarberOS catalog");
    expect(p[0]).toContain("the vocabulary");
  });

  it("refuses the deferred capability in any form, deliverable or not", () => {
    for (const deliverable of [true, false]) {
      const p = proposalProblems(
        doc({
          offer: [{ capability: "payments", deliverable_today: deliverable, note: "" }],
        }),
        CATALOG,
      );
      expect(p.some((x) => x.includes("decision not to build it"))).toBe(true);
    }
  });

  // The rule that keeps the sales document honest: only what has shipped may
  // be sold as available.
  it("refuses a planned capability offered as deliverable today", () => {
    const p = proposalProblems(
      doc({ offer: [{ capability: "booking", deliverable_today: true, note: "" }] }),
      CATALOG,
    );
    expect(p[0]).toBe(
      "Booking & Scheduling is offered as deliverable today, but the catalog says it is planned.",
    );
  });

  it("allows a planned capability offered honestly as not deliverable today", () => {
    expect(
      proposalProblems(
        doc({ offer: [{ capability: "booking", deliverable_today: false, note: "" }] }),
        CATALOG,
      ),
    ).toEqual([]);
  });

  it("catches a duplicated line and an unnamed one", () => {
    const p = proposalProblems(
      doc({
        offer: [
          offerLineFor(CATALOG.capabilities[0]!),
          offerLineFor(CATALOG.capabilities[0]!),
          { capability: "  ", deliverable_today: false, note: "" },
        ],
      }),
      CATALOG,
    );
    expect(p.some((x) => x.includes("appears in the offer twice"))).toBe(true);
    expect(p.some((x) => x.includes("names no capability"))).toBe(true);
  });

  it("refuses a proposal that names no price at all, and a negative one", () => {
    expect(
      proposalProblems(
        doc({
          pricing: {
            currency: "USD",
            setup_cents: 0,
            monthly_cents: 0,
            term_months: null,
          },
        }),
        CATALOG,
      ).some((x) => x.includes("names no price")),
    ).toBe(true);
    expect(
      proposalProblems(
        doc({
          pricing: {
            currency: "USD",
            setup_cents: -1,
            monthly_cents: 0,
            term_months: null,
          },
        }),
        CATALOG,
      ).some((x) => x.includes("cannot be negative")),
    ).toBe(true);
  });

  it("accepts a setup-only or a monthly-only model", () => {
    for (const pricing of [
      { currency: "USD", setup_cents: 250_000, monthly_cents: 0, term_months: null },
      { currency: "USD", setup_cents: 0, monthly_cents: 75_000, term_months: 12 },
    ]) {
      expect(proposalProblems(doc({ pricing }), CATALOG)).toEqual([]);
    }
  });

  it("refuses a document with no headline", () => {
    expect(
      proposalProblems(doc({ headline: "   " }), CATALOG).some((x) =>
        x.includes("no headline"),
      ),
    ).toBe(true);
  });
});

describe("draftFromReport", () => {
  const report: Report = {
    run_id: "run-1",
    status: "partially_completed",
    shop: { business_name: "Clarence Barber Co", website_url: null, city: "Clarence" },
    weights: { website: 70, google_business: 30 },
    coverage: { scored: 1, possible: 2 },
    composite_score: 40,
    scorecard: [],
    unscored_dimensions: ["google_business"],
    findings: [
      {
        code: "no_booking_link",
        dimension: "website",
        statement: "The homepage offers no way to book online.",
        evidence_url: "https://clarencebarber.example/",
        confidence: "verified",
        severity: "critical",
        detector: "manual",
      },
      {
        code: "no_posts",
        dimension: "google_business",
        statement: "Nothing has been posted to the Google profile in a year.",
        evidence_url: null,
        confidence: "inferred",
        severity: "medium",
        detector: "manual",
      },
    ],
    recommendations: [
      {
        priority: "structural",
        rank: 1,
        title: "Put a page they own in front of the booking link",
        detail: "",
        capability_key: "owned_website",
        addresses_finding_id: 1,
      },
      {
        priority: "quick_win",
        rank: 1,
        title: "Start recording who comes in",
        detail: "",
        capability_key: "client_crm",
        addresses_finding_id: null,
      },
      {
        priority: "quick_win",
        rank: 2,
        title: "Same capability again",
        detail: "",
        capability_key: "owned_website",
        addresses_finding_id: null,
      },
      {
        priority: "quick_win",
        rank: 3,
        title: "Take card payments",
        detail: "",
        capability_key: "payments",
        addresses_finding_id: null,
      },
      {
        priority: "quick_win",
        rank: 4,
        title: "Answer the phone differently",
        detail: "",
        capability_key: null,
        addresses_finding_id: null,
      },
    ],
    outreach_hook: "You have no way to book online.",
  };

  const draft = draftFromReport({ report, catalog: CATALOG });

  it("offers each recommended capability once, in the report's own order", () => {
    expect(draft.offer.map((l) => l.capability)).toEqual([
      "owned_website",
      "client_crm",
    ]);
  });

  // The deferred one and the one with no capability behind it are both dropped
  // rather than carried into a document the database would reject.
  it("drops the deferred capability and the advice that names none", () => {
    expect(draft.offer.map((l) => l.capability)).not.toContain("payments");
    expect(draft.offer).toHaveLength(2);
  });

  it("produces a document the honesty rules accept", () => {
    expect(proposalProblems(draft, CATALOG)).toEqual([]);
  });

  it("carries every finding across WITH its confidence and evidence url", () => {
    expect(draft.cited_findings).toHaveLength(2);
    expect(draft.cited_findings[0]).toMatchObject({
      confidence: "verified",
      evidence_url: "https://clarencebarber.example/",
    });
    expect(draft.cited_findings[1]).toMatchObject({
      confidence: "inferred",
      evidence_url: null,
    });
  });

  it("records the evidence base of the quote and where the document came from", () => {
    expect(draft.evidence).toEqual({ findings: 2, evidenced: 1 });
    expect(draft.from_run).toBe("run-1");
  });

  it("starts from the default pricing but takes an override", () => {
    expect(draft.pricing.monthly_cents).toBe(75_000);
    const custom = draftFromReport({
      report,
      catalog: CATALOG,
      pricing: {
        currency: "USD",
        setup_cents: 250_000,
        monthly_cents: 120_000,
        term_months: 12,
      },
    });
    expect(custom.pricing.monthly_cents).toBe(120_000);
  });

  it("does not mutate the shared defaults when the draft's pricing is edited", () => {
    draft.pricing.monthly_cents = 1;
    expect(PRICING_DEFAULTS.monthly_cents).toBe(75_000);
  });
});

// ── Small helpers ──────────────────────────────────────────────────────────

describe("slugify", () => {
  it("makes a plausible tenant slug", () => {
    expect(slugify("Clarence Barber Co.")).toBe("clarence-barber-co");
    expect(slugify("  Tony's  Cuts & Shaves!  ")).toBe("tony-s-cuts-shaves");
  });
  it("does not produce leading or trailing separators", () => {
    expect(slugify("---Fade---")).toBe("fade");
  });
  it("returns an empty string rather than guessing when there is nothing to use", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("when", () => {
  it("renders a date", () => {
    expect(when("2026-09-17T12:00:00Z")).toMatch(/2026/);
  });
  it("renders absent and unparseable values as a dash, not as today", () => {
    expect(when(null)).toBe("—");
    expect(when("")).toBe("—");
    expect(when("not a date")).toBe("—");
  });
});

describe("rhythmNote", () => {
  it("says never visited rather than computing anything", () => {
    expect(
      rhythmNote({
        visits: 0,
        typical_days: null,
        overdue_by_days: null,
        basis: "never visited",
      }),
    ).toBe("Never visited.");
  });

  // Under three visits there is no rhythm. A number here would be invented.
  it("refuses to state a rhythm from too few visits", () => {
    expect(
      rhythmNote({
        visits: 2,
        typical_days: null,
        overdue_by_days: null,
        basis: "not enough visits to know a rhythm",
      }),
    ).toBe("2 visits — not enough to know a rhythm yet.");
    expect(
      rhythmNote({
        visits: 1,
        typical_days: null,
        overdue_by_days: null,
        basis: "not enough visits to know a rhythm",
      }),
    ).toBe("1 visit — not enough to know a rhythm yet.");
  });

  it("states the rhythm, and whether they are behind it", () => {
    expect(
      rhythmNote({
        visits: 6,
        typical_days: 28,
        overdue_by_days: 0,
        basis: "average of the last gaps",
      }),
    ).toBe("Comes in about every 28 days, and is on time.");
    expect(
      rhythmNote({
        visits: 6,
        typical_days: 28,
        overdue_by_days: 11,
        basis: "average of the last gaps",
      }),
    ).toBe("Comes in about every 28 days, and is 11 days overdue.");
  });
});
