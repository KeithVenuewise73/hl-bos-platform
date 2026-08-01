/**
 * Herman Legacy Venture Studio (HLVS V2) — core domain types.
 *
 * Pure types + reference vocabularies. No I/O. These mirror the `vstudio.*`
 * database enums exactly (single source of truth for both the app and the DB
 * layer) and encode the honesty doctrine: every quantitative claim is an
 * `Estimate` carrying a measured/estimated/unknown status, a methodology and a
 * confidence — a bare number is not representable.
 */

// --- Opportunity lifecycle --------------------------------------------------

export const OPPORTUNITY_STATUSES = [
  "inbox",
  "researching",
  "evaluated",
  "watch",
  "approved",
  "rejected",
  "archived",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_TYPES = [
  "greenfield_product",
  "feature_expansion",
  "acquisition_target",
  "partnership",
  "open_source_leverage",
  "research_to_product",
  "market_gap",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

// --- Evidence ---------------------------------------------------------------

export const EVIDENCE_TYPES = [
  "verified_fact",
  "external_claim",
  "estimate",
  "inference",
  "ceo_note",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const RELIABILITY = ["high", "medium", "low", "unverified"] as const;
export type Reliability = (typeof RELIABILITY)[number];

export const RELEVANCE = ["direct", "supporting", "tangential"] as const;
export type Relevance = (typeof RELEVANCE)[number];

// --- Notes ------------------------------------------------------------------

export const NOTE_TYPES = [
  "observation",
  "hypothesis",
  "risk",
  "decision_input",
  "follow_up",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_VISIBILITY = ["private", "executive", "team"] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITY)[number];

// --- Advisory recommendation (AI-assisted, never authoritative) -------------

export const RECOMMENDATIONS = ["build", "buy", "partner", "watch", "ignore"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

// --- CEO decision (the single authoritative act) ----------------------------

export const DECISIONS = [
  "build",
  "buy",
  "partner",
  "watch",
  "ignore",
  "defer",
] as const;
export type Decision = (typeof DECISIONS)[number];

// --- Honesty primitives -----------------------------------------------------

/** How trustworthy a quantitative claim is. Mirrors the platform doctrine. */
export const METRIC_STATUS = ["measured", "estimated", "unknown"] as const;
export type MetricStatus = (typeof METRIC_STATUS)[number];

export type Confidence = "high" | "medium" | "low";

/**
 * A quantitative claim that can never be a bare number. If `status` is
 * `"unknown"` the value is null and the UI shows "no data", not a zero.
 */
export interface Estimate {
  value: number | null;
  unit: string;
  status: MetricStatus;
  /** Plain-language description of how the number was derived. */
  methodology: string;
  confidence: Confidence;
  /** Optional stated assumptions behind an estimate. */
  assumptions?: string[];
}

export function unknownEstimate(unit: string, why: string): Estimate {
  return {
    value: null,
    unit,
    status: "unknown",
    methodology: why,
    confidence: "low",
  };
}
