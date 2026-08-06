/**
 * BTI V1 domain model — one transformation cycle, Customer Goal → Measurement
 * Contract.
 *
 * Every type here implements a concept from the approved BTI constitution
 * (Methodology + Reasoning Framework + Learning Loop). Nothing is generic
 * framework: each shape is a step of the methodology or a field of the
 * Reasoning Ledger. Persistence, execution and UI are deliberately absent —
 * this is the reasoning spine only.
 */

// --- Confidence: the two-dimensional model (Learning Loop §4.2) -------------

/**
 * The provenance/quality axis, ordered strongest → weakest. This is the only
 * ranking BTI uses when it caps a recommendation "by its weakest load-bearing
 * input".
 */
export type QualityTier = "verified" | "observed" | "estimated" | "assumed" | "unknown";

/**
 * Health flags are orthogonal to the quality axis. Any tier can carry one, and
 * each degrades how the evidence may be used until it is resolved.
 */
export type HealthFlag = "conflicting" | "outdated" | "insufficient";

// --- The value chain BTI reasons over (Reasoning Framework §3.2) ------------

export type ValueChainLink =
  | "demand"
  | "capture"
  | "response"
  | "conversion"
  | "fulfillment"
  | "retention"
  | "margin";

export const VALUE_CHAIN: readonly ValueChainLink[] = [
  "demand",
  "capture",
  "response",
  "conversion",
  "fulfillment",
  "retention",
  "margin",
] as const;

// --- Stage 1: Customer Goal ------------------------------------------------

export interface CustomerGoal {
  /** The goal in the owner's own words, translated to a measurable target. */
  readonly statement: string;
  /** The metric the goal is accountable to (e.g. "net new jobs / month"). */
  readonly metric: string;
  /** The target value, if one was set. */
  readonly target?: number;
  readonly unit?: string;
  readonly deadline?: string;
  /** The "not at the cost of ___" clause. */
  readonly guardrail?: string;
  /** How the goal itself was obtained. An un-interviewed goal is `assumed`. */
  readonly confidence: QualityTier;
}

// --- Stages 2–3: Evidence --------------------------------------------------

/** A single sourced (or explicitly missing) fact about the business. */
export interface EvidenceItem {
  readonly id: string;
  /** What this evidence asserts, in plain language. */
  readonly fact: string;
  /** Which value-chain link it speaks to, or "context" for framing facts. */
  readonly link: ValueChainLink | "context";
  readonly quality: QualityTier;
  readonly flags?: readonly HealthFlag[];
  /** Sources. `verified` requires ≥2 independent sources (enforced downstream). */
  readonly sources?: readonly string[];
  /** ISO date the fact was captured; used with `validityWindowDays`. */
  readonly capturedAt?: string;
  /** After this many days the fact becomes `outdated` and must be refreshed. */
  readonly validityWindowDays?: number;
  /** Quantitative value, when the fact is a number. */
  readonly value?: number;
  readonly valueUnit?: string;
}

// --- Stages 4–5: Analysis & Constraint -------------------------------------

export type LinkStatus = "strength" | "gap" | "unknown";

export interface LinkAnalysis {
  readonly link: ValueChainLink;
  readonly status: LinkStatus;
  readonly rationale: string;
  readonly confidence: QualityTier;
  /** Sized monthly dollar gap, only when quantitative evidence supports it. */
  readonly dollarGapPerMonth?: number;
}

export type Feasibility = "feasible" | "infeasible" | "unknown";

export interface ConstraintResult {
  /** The confirmed binding constraint, or null when it cannot be confirmed. */
  readonly bindingLink: ValueChainLink | null;
  readonly rationale: string;
  readonly confidence: QualityTier;
  readonly feasibility: Feasibility;
  /** Ranked candidate links when the binding constraint cannot be confirmed. */
  readonly hypotheses: readonly ValueChainLink[];
}

// --- Stages 6–7: Options & Recommendation ----------------------------------

/** The class of effect a piece of evidence would have (Stability Framework). */
export type EvidenceEffect = "strengthen" | "weaken" | "invalidate" | "transform";

export interface TransformationOption {
  readonly id: string;
  /** A business OUTCOME, never a product. */
  readonly name: string;
  readonly targetsLink: ValueChainLink;
  readonly rationale: string;
  /**
   * The value score, or null when a required input is not known well enough to
   * score honestly. A null score is a truthful "cannot size", not a zero.
   */
  readonly score: number | null;
  /** The fact this option depends on, and whether it is already verified. */
  readonly precondition: string;
  readonly preconditionVerified: boolean;
  /** Set when the option was rejected, with the specific losing reason. */
  readonly rejectedReason?: string;
}

// --- Evidence Appetite (Learning Loop §4.1) --------------------------------

export type AcquisitionPath = "automatic" | "manual" | "unobtainable";

export interface EvidenceAppetiteItem {
  readonly fact: string;
  /** Which decision this fact could move. */
  readonly why: string;
  readonly effect: EvidenceEffect;
  readonly path: AcquisitionPath;
  /** Where BTI can get it automatically, or how HLD obtains it. */
  readonly source?: string;
  /** 1 (trivial) … 5 (very costly/intrusive) to acquire. */
  readonly acquisitionCost: number;
  /** Higher = pursue first. information value ÷ acquisition cost. */
  readonly priority: number;
}

// --- Measurement Contract (the end of this slice) --------------------------

export interface MeasurementContract {
  readonly metric: string;
  /** The baseline, captured before any change. May be honestly unknown. */
  readonly baseline: { readonly value: number | null; readonly tier: QualityTier };
  readonly window: string;
  readonly attributionMethod: string;
}

// --- The Living Ledger ------------------------------------------------------

/** Lifecycle states reachable within this reasoning-only slice. */
export type LifecycleState = "provisional" | "substantiated" | "confirmed";

/** The four permitted outputs of BTI reasoning (Reasoning Framework §3.7). */
export type PermittedOutput =
  "recommendation" | "revise_goal" | "collect_more_evidence" | "no_transformation";

export interface Assumption {
  readonly statement: string;
  readonly tier: QualityTier;
  readonly verifyBy: string;
}

export interface Stability {
  /** 0 (fragile) … 100 (robust): how hard it would be for evidence to flip it. */
  readonly score: number;
  readonly fragility: string;
}

/**
 * The Reasoning Ledger — the mandatory, complete output of every recommendation
 * (Reasoning Framework §3.6), extended into the Living Ledger (Learning Loop
 * §3.2) with lifecycle, evidence appetite, stability and prediction.
 */
export interface ReasoningLedger {
  readonly engagementId: string;
  readonly business: string;
  readonly goal: CustomerGoal;

  // The 11 mandatory fields.
  readonly discovered: string; // 1
  readonly evidence: readonly EvidenceItem[]; // 2
  readonly assumptions: readonly Assumption[]; // 3
  readonly confidence: QualityTier; // 4 — capped by weakest load-bearing input
  readonly rootCause: ConstraintResult; // 5
  readonly options: readonly TransformationOption[]; // 6
  readonly recommendation: { readonly optionId: string; readonly why: string } | null; // 7
  readonly rejected: readonly { readonly optionId: string; readonly reason: string }[]; // 8
  readonly validityConditions: readonly {
    readonly condition: string;
    readonly validityWindowDays?: number;
  }[]; // 9
  readonly evidenceThatWouldChange: readonly {
    readonly evidence: string;
    readonly effect: EvidenceEffect;
  }[]; // 10
  readonly measurementContract: MeasurementContract | null; // 11

  // Living Ledger extensions.
  readonly output: PermittedOutput;
  readonly provisionalLeadId: string | null;
  readonly lifecycle: LifecycleState;
  readonly stability: Stability;
  readonly appetite: readonly EvidenceAppetiteItem[];
}

/** The full input to one transformation cycle. */
export interface Engagement {
  readonly engagementId: string;
  readonly business: string;
  readonly goal: CustomerGoal;
  readonly evidence: readonly EvidenceItem[];
  /** The date the cycle is run "as of" — passed in so reasoning is deterministic. */
  readonly asOf: string;
}
