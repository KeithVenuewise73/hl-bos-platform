// Opportunity reviews: the AI Digital Review (HLD) and the Transportation
// Opportunity Review (HSCS).
//
// A review keeps three kinds of statement in three separate fields, and the
// validator refuses a review that mixes them up:
//
//   observed      — what we saw, with source, time and evidence.
//   assumptions   — what we are taking as given and have not checked.
//   opportunities — what we ESTIMATE HLG could help with, citing the observed
//                   facts that justify it. An estimate, never a promise.
//
// Built on the existing Presence Scanner: its findings ARE the observed facts,
// and its BTI-mapped suggested services become offers of the right line. This
// file adds no second scanner and no second recommendation engine.
//
// HSCS: we can observe what a transportation business says publicly (a DOT
// number on its site, the services it lists). We cannot observe its fleet size,
// costs, on-time rate or revenue — so a fact in those categories is refused
// unless the customer gave it to us.

import {
  COMPONENT_TO_BTI,
  type Finding,
  type Prospect,
} from "@hl-bos/presence-scanner";

import { OFFERS, type Offer } from "./business-lines.ts";
import type { BusinessLine } from "./types.ts";

export type FactSource =
  | "google_places"
  | "website"
  | "import"
  | "reviewer"
  | "public_record"
  | "customer_provided";

export interface ObservedFact {
  key: string;
  label: string;
  /** What was seen, or authoritatively seen to be absent. */
  status: "present" | "missing" | "not_found";
  source: FactSource;
  observedAt: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface Assumption {
  statement: string;
  /** How to confirm or refute it. */
  howToVerify: string;
}

export interface EstimatedOpportunity {
  offerKey: string;
  offerName: string;
  priority: "critical" | "high" | "medium" | "low";
  rationale: string;
  /** Keys of observed facts that justify this. Never empty. */
  basedOn: string[];
}

export interface OpportunityReview {
  line: BusinessLine;
  leadId: string;
  businessName: string;
  generatedAt: string;
  /** "rules" — deterministic, from the scanner. "ai" — an AI draft a person must review. */
  method: "rules" | "ai";
  observed: ObservedFact[];
  /** Facts we could not see or did not look for. Not scored, not claimed. */
  notChecked: string[];
  /** Things seen whose truth cannot be judged from a web page. */
  needsVerification: string[];
  assumptions: Assumption[];
  opportunities: EstimatedOpportunity[];
  /**
   * Whether the website was seen in a real browser (packages/visual-review).
   * "not_run" when no visual review exists. Only "complete" and "partial" allow
   * any statement about design, navigation or how booking works.
   */
  visualCoverage?:
    "complete" | "partial" | "blocked" | "failed" | "not_available" | "not_run";
}

/** Offers whose case rests on how the existing site looks and works. */
export const DESIGN_OFFERS: ReadonlySet<string> = new Set(["hld.website"]);

/** Facts showing there is no working site of its own -- a rebuild needs no visual review then. */
const NO_WORKING_SITE: Record<string, readonly string[]> = {
  "website.exists": ["missing", "not_found"],
  "website.social_only": ["present"],
  "website.link_in_bio": ["present"],
  "website.retired_google_site": ["present"],
  "website.reachable": ["missing"],
};

/** Words that describe how a site looks or works. Allowed only on visual evidence. */
const DESIGN_CLAIM =
  /\b(design|layout|navigation|look(s|ing)? (dated|old|outdated|modern|cluttered)|user experience|mobile experience|hard to (use|navigate)|confusing|booking (flow|process|path)|registration (flow|process|path)|checkout)\b/i;

const visualKeys = (facts: readonly ObservedFact[]) =>
  facts.filter((f) => f.key.startsWith("visual.")).map((f) => f.key);

/**
 * Operational facts no public source can show. A review may hold them only
 * when the customer supplied them.
 */
export const PRIVATE_OPERATIONAL_KEYS = [
  "fleet_size",
  "driver_count",
  "annual_revenue",
  "cost_per_mile",
  "on_time_rate",
  "driver_turnover",
  "accident_rate",
  "fuel_spend",
  "margin",
  "utilization",
] as const;

function isPrivateKey(key: string): boolean {
  return (PRIVATE_OPERATIONAL_KEYS as readonly string[]).some(
    (k) => key === k || key.startsWith(`${k}.`) || key.endsWith(`.${k}`),
  );
}

function factFromFinding(f: Finding): ObservedFact | undefined {
  if (f.status !== "present" && f.status !== "missing" && f.status !== "not_found")
    return undefined;
  return {
    key: f.key,
    label: f.label,
    status: f.status,
    source: f.source,
    observedAt: f.observedAt,
    evidence: f.evidence,
    confidence: f.confidence,
  };
}

function offerForService(line: BusinessLine, service: string): Offer | undefined {
  return OFFERS.find((o) => o.line === line && o.answersBtiServices.includes(service));
}

/** Public, observable operating indicators for an HSCS review. */
export interface PublicIndicator {
  key: string;
  label: string;
  evidence: string;
  source: "website" | "public_record";
  observedAt: string;
  /** HSCS offers this indicator suggests. */
  suggests: string[];
}

export interface ReviewOptions {
  line: BusinessLine;
  now: Date;
  /** HSCS: indicators a person or a scan observed publicly. */
  publicIndicators?: PublicIndicator[];
  /** HSCS: figures the customer gave us (assessment intake). */
  customerProvided?: ObservedFact[];
}

/**
 * Build a review from a Presence Scanner lead. Deterministic: the same lead
 * gives the same review. An AI-written narrative may be layered on top later,
 * but it is held to `validateReview` exactly like this one.
 */
export function buildReview(p: Prospect, opts: ReviewOptions): OpportunityReview {
  const observed: ObservedFact[] = [];
  const notChecked: string[] = [];
  const needsVerification: string[] = [];
  for (const f of p.findings) {
    const fact = factFromFinding(f);
    if (fact) observed.push(fact);
    else if (f.status === "needs_verification")
      needsVerification.push(`${f.label}: ${f.evidence}`);
    else notChecked.push(`${f.label}: ${f.evidence}`);
  }

  const visualCoverage: NonNullable<OpportunityReview["visualCoverage"]> =
    p.visual?.coverage ?? "not_run";
  const visualSeen = visualCoverage === "complete" || visualCoverage === "partial";
  const visualNote = p.visual
    ? `visual review ${visualCoverage}: ${p.visual.coverageReason}`
    : "no visual review has been run";
  const opportunities: EstimatedOpportunity[] = [];
  const seen = new Set<string>();
  if (opts.line === "hld") {
    for (const s of p.services) {
      const o = offerForService("hld", s.service);
      if (!o || seen.has(o.key)) continue;
      let basedOn = evidenceFor(p, s.dimension, observed);
      if (basedOn.length === 0) continue; // no observed gap behind it: not offered
      if (DESIGN_OFFERS.has(o.key) && !citesNoWorkingSite(basedOn, observed)) {
        // A working site's design is judged only on what a browser showed.
        const seenInBrowser = visualSeen ? visualKeys(observed) : [];
        if (seenInBrowser.length === 0) {
          if (!seen.has(o.key))
            notChecked.push(
              `${o.name}: not assessed. The existing website was not viewed in a browser (${visualNote}), so nothing is said about its design or how it works.`,
            );
          seen.add(o.key);
          continue;
        }
        basedOn = [...new Set([...basedOn, ...seenInBrowser])];
      }
      seen.add(o.key);
      opportunities.push({
        offerKey: o.key,
        offerName: o.name,
        priority: s.priority,
        rationale: s.rationale,
        basedOn,
      });
    }
  } else {
    for (const ind of opts.publicIndicators ?? []) {
      observed.push({
        key: ind.key,
        label: ind.label,
        status: "present",
        source: ind.source,
        observedAt: ind.observedAt,
        evidence: ind.evidence,
        confidence: "medium",
      });
      for (const key of ind.suggests) {
        const o = OFFERS.find((x) => x.key === key && x.line === "hscs");
        if (!o || seen.has(o.key)) continue;
        seen.add(o.key);
        opportunities.push({
          offerKey: o.key,
          offerName: o.name,
          priority: "medium",
          rationale: `Publicly observed: ${ind.label}.`,
          basedOn: [ind.key],
        });
      }
    }
    observed.push(...(opts.customerProvided ?? []));
    // Every HSCS engagement starts with an assessment of the customer's own data.
    if (!seen.has("hscs.assessment")) {
      opportunities.unshift({
        offerKey: "hscs.assessment",
        offerName: "Operational assessment",
        priority: "high",
        rationale:
          "Operational performance cannot be judged from public information; an assessment of the customer's own figures comes first.",
        basedOn: observed.length > 0 ? [observed[0]!.key] : [],
      });
    }
  }

  const assumptions: Assumption[] = [
    {
      statement: "The business is still operating at the listed address.",
      howToVerify: "Confirm on the first call.",
    },
  ];
  if (opts.line === "hscs") {
    assumptions.push({
      statement:
        "Nothing is known about this company's fleet size, costs, on-time performance or revenue.",
      howToVerify: "Ask for these figures in the operational assessment.",
    });
  }
  if (!visualSeen) {
    assumptions.push({
      statement: `The website's design, navigation, mobile experience and booking or registration paths were not seen in a browser (${visualNote}). Nothing is claimed about them.`,
      howToVerify: "Run the visual review from the console.",
    });
  } else if (visualCoverage === "partial") {
    assumptions.push({
      statement: `The website was only partly seen in a browser (${p.visual?.coverageReason ?? ""}). Statements about it cover the pages viewed only.`,
      howToVerify: "Open the visual review to see which pages were viewed.",
    });
  }
  if (notChecked.length > 0) {
    assumptions.push({
      statement: `${notChecked.length} item(s) could not be checked and are not counted for or against the business.`,
      howToVerify: "Re-run the scan, or check by hand.",
    });
  }

  return {
    line: opts.line,
    leadId: p.id,
    businessName: p.name,
    generatedAt: opts.now.toISOString(),
    method: "rules",
    observed,
    notChecked,
    needsVerification,
    assumptions,
    visualCoverage,
    opportunities: opportunities.sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    ),
  };
}

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

/**
 * The observed facts behind a suggested service: the findings the Presence
 * Scanner's own score cited for the component that maps to this BTI dimension.
 * Uses the scanner's evidence links rather than guessing from key names.
 */
function citesNoWorkingSite(
  basedOn: readonly string[],
  facts: readonly ObservedFact[],
): boolean {
  return facts.some(
    (f) => basedOn.includes(f.key) && NO_WORKING_SITE[f.key]?.includes(f.status),
  );
}

function evidenceFor(
  p: Prospect,
  dimension: string,
  observed: ObservedFact[],
): string[] {
  const keys = new Set(observed.map((f) => f.key));
  const out = new Set<string>();
  for (const c of p.score.components) {
    if (COMPONENT_TO_BTI[c.component] !== dimension) continue;
    for (const contribution of c.contributions)
      for (const k of contribution.findingKeys) if (keys.has(k)) out.add(k);
  }
  return [...out];
}

/** Words that turn an estimate into a promise. */
const PROMISE_PATTERNS: RegExp[] = [
  /\bguarantee/i,
  /\b#?1\s+(on|in)\s+google\b/i,
  /\bfirst page\b/i,
  /\brank(ing)?\s+(first|top|#1)\b/i,
  /\bwill (save|increase|double|triple)\b/i,
  /\b\d+(\.\d+)?\s*%\s*(more|increase|savings?|growth|roi)\b/i,
  /\$\s?\d[\d,]*\s*(saved|savings|in savings|more revenue|additional revenue)/i,
];

export function findPromises(text: string): string[] {
  return PROMISE_PATTERNS.filter((r) => r.test(text)).map((r) => r.source);
}

/** Returns plain-English problems. An empty list means the review is honest. */
export function validateReview(r: OpportunityReview): string[] {
  const problems: string[] = [];
  const keys = new Set(r.observed.map((f) => f.key));
  for (const f of r.observed) {
    if (!f.evidence.trim()) problems.push(`Fact "${f.label}" has no evidence.`);
    if (!f.observedAt) problems.push(`Fact "${f.label}" has no observation time.`);
    if (isPrivateKey(f.key) && f.source !== "customer_provided") {
      problems.push(
        `Fact "${f.label}" is private operating data and can only come from the customer, not from ${f.source}.`,
      );
    }
  }
  for (const o of r.opportunities) {
    const off = OFFERS.find((x) => x.key === o.offerKey);
    if (!off) problems.push(`Opportunity "${o.offerName}" is not an HLG offer.`);
    else if (off.line !== r.line)
      problems.push(`Opportunity "${o.offerName}" belongs to the other business line.`);
    if (o.basedOn.length === 0)
      problems.push(`Opportunity "${o.offerName}" is not based on any observed fact.`);
    for (const k of o.basedOn)
      if (!keys.has(k))
        problems.push(
          `Opportunity "${o.offerName}" cites "${k}", which was not observed.`,
        );
    for (const p of findPromises(o.rationale))
      problems.push(`Opportunity "${o.offerName}" makes a promise (${p}).`);
  }
  const visualOk = r.visualCoverage === "complete" || r.visualCoverage === "partial";
  for (const o of r.opportunities) {
    const cites = o.basedOn.filter((k) => k.startsWith("visual."));
    if (
      DESIGN_OFFERS.has(o.offerKey) &&
      !citesNoWorkingSite(o.basedOn, r.observed) &&
      (!visualOk || cites.length === 0)
    )
      problems.push(
        `Opportunity "${o.offerName}" judges an existing website without having seen it in a browser (visual coverage: ${r.visualCoverage ?? "unknown"}).`,
      );
    if (DESIGN_CLAIM.test(o.rationale) && (!visualOk || cites.length === 0))
      problems.push(
        `Opportunity "${o.offerName}" describes design or functionality without a visual-review fact.`,
      );
  }
  const visualFacts = visualKeys(r.observed).filter((k) => k !== "visual.coverage");
  if (visualFacts.length > 0 && !visualOk)
    problems.push(
      "The review cites visual-review facts, but the visual review did not see the site.",
    );
  if (r.assumptions.length === 0) problems.push("A review must state its assumptions.");
  return problems;
}
