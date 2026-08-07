/**
 * Venuewise startup-analysis domain.
 *
 * This is an ADAPTATION of the BTI reasoning contract to a startup, not a new
 * engine: the confidence machine, the quality tiers, the health flags, the
 * evidence-effect classes and the four permitted outputs are all reused from
 * @hl-bos/bti-cycle. What changes is the value chain — a startup is analysed
 * across Problem → … → Margin instead of Demand → … → Margin — and the outcome
 * library, which speaks in startup transformations.
 */

import type {
  AcquisitionPath,
  ConfidenceInput,
  EvidenceEffect,
  HealthFlag,
  QualityTier,
} from "@hl-bos/bti-cycle";

export type { QualityTier, HealthFlag, EvidenceEffect, AcquisitionPath };

// --- The startup value chain -----------------------------------------------

export type StartupLink =
  | "problem"
  | "customer"
  | "solution"
  | "product"
  | "activation"
  | "value_delivery"
  | "retention"
  | "revenue"
  | "acquisition"
  | "sales"
  | "fulfillment"
  | "scale"
  | "margin";

export const STARTUP_CHAIN: readonly StartupLink[] = [
  "problem",
  "customer",
  "solution",
  "product",
  "activation",
  "value_delivery",
  "retention",
  "revenue",
  "acquisition",
  "sales",
  "fulfillment",
  "scale",
  "margin",
] as const;

/**
 * The commercial half of the chain. A startup can have every link to the left
 * of `revenue` strong and still be failing, because the binding constraint sits
 * here. BTI must never confuse a strong product with a working business.
 */
export const COMMERCIAL_LINKS: readonly StartupLink[] = [
  "customer",
  "activation",
  "value_delivery",
  "retention",
  "revenue",
  "acquisition",
  "sales",
  "fulfillment",
  "scale",
  "margin",
] as const;

// --- Asset classification (Step 1 inventory) -------------------------------

export type AssetClass =
  | "verified_working"
  | "verified_present_unproven"
  | "partial"
  | "documented_only"
  | "duplicate"
  | "deprecated"
  | "unknown";

// --- Evidence (reuses the BTI confidence fields via ConfidenceInput) --------

/** A single sourced (or explicitly missing) fact about the startup. Extends the
 * BTI confidence input so it can be fed to the reused confidence machine. */
export interface StartupEvidence extends ConfidenceInput {
  readonly id: string;
  readonly fact: string;
  readonly link: StartupLink | "context";
  /** Inventory classification, when this fact concerns an asset. */
  readonly asset?: AssetClass;
  /** A quantitative datum, when present (e.g. subscriptions = 1). */
  readonly value?: number;
  readonly valueUnit?: string;
}

// --- Startup goal -----------------------------------------------------------

export interface StartupGoal {
  readonly statement: string;
  readonly metric: string;
  readonly guardrail?: string;
  /** How the goal was obtained. An un-interviewed goal is `assumed`. */
  readonly confidence: QualityTier;
}

// --- Analysis & constraint --------------------------------------------------

export type LinkStatus = "strength" | "gap" | "unknown";

export interface StartupLinkAnalysis {
  readonly link: StartupLink;
  readonly status: LinkStatus;
  readonly rationale: string;
  readonly confidence: QualityTier;
}

export interface StartupConstraint {
  /** The confirmed binding constraint, or null when it cannot be confirmed. */
  readonly bindingLink: StartupLink | null;
  readonly rationale: string;
  readonly confidence: QualityTier;
  /** Ranked candidate links when the binding constraint cannot be confirmed. */
  readonly hypotheses: readonly StartupLink[];
}

// --- Transformation options (business outcomes, never products) -------------

export interface StartupOption {
  readonly id: string;
  readonly name: string;
  readonly targetsLink: StartupLink;
  readonly objective: string;
  readonly dependencies: readonly string[];
  readonly risks: readonly string[];
  readonly timeToEvidence: string;
  readonly implementationBurden: string;
  readonly mustRemainTrue: string;
  readonly invalidatedBy: string;
  readonly successMeasure: string;
  /** The precondition this option rests on, and whether it is already verified. */
  readonly precondition: string;
  readonly preconditionVerified: boolean;
  /** No fabricated financials: value is never a manufactured number. */
  readonly rejectedReason?: string;
}

// --- Evidence appetite ------------------------------------------------------

export interface StartupAppetiteItem {
  readonly fact: string;
  readonly why: string;
  readonly effect: EvidenceEffect;
  readonly path: AcquisitionPath;
  readonly source?: string;
  readonly acquisitionCost: number;
  readonly priority: number;
}

// --- Measurement contract ---------------------------------------------------

export interface StartupMeasurementContract {
  readonly targetOutcome: string;
  readonly baseline: {
    readonly value: number | null;
    readonly tier: QualityTier;
    readonly note: string;
  };
  readonly window: string;
  readonly successIndicators: readonly string[];
  readonly failureIndicators: readonly string[];
  readonly dataSource: string;
  readonly attribution: string;
  readonly strengthenIf: string;
  readonly invalidateIf: string;
  readonly rerunWhen: string;
}

// --- The Living Ledger + permitted outputs ---------------------------------

export type StartupOutput =
  | "RECOMMEND_TRANSFORMATION"
  | "REVISE_GOAL"
  | "COLLECT_MORE_EVIDENCE"
  | "NO_TRANSFORMATION_NOW";

export interface StartupAssumption {
  readonly statement: string;
  readonly tier: QualityTier;
  readonly verifyBy: string;
}

export interface StartupStability {
  readonly score: number;
  readonly fragility: string;
}

export interface StartupEngagement {
  readonly engagementId: string;
  readonly business: string;
  readonly goal: StartupGoal;
  readonly evidence: readonly StartupEvidence[];
  /** Deterministic "as of" date — no wall clock is ever read. */
  readonly asOf: string;
  /** CEO discovery questions whose answers would materially change the analysis. */
  readonly discoveryQuestions: readonly string[];
}

/** The complete Living Ledger for a startup engagement (the CEO's 16 fields). */
export interface StartupLedger {
  readonly engagementId: string;
  readonly business: string;
  readonly goal: StartupGoal; // 1
  readonly discovered: string; // 2
  readonly evidence: readonly StartupEvidence[]; // 3 (each carries provenance)
  readonly assumptions: readonly StartupAssumption[]; // 4
  readonly confidence: QualityTier; // 5
  readonly chain: readonly StartupLinkAnalysis[]; // 6
  readonly rootCause: StartupConstraint; // 7
  readonly options: readonly StartupOption[]; // 8
  readonly recommendation: { readonly optionId: string; readonly why: string } | null; // 9 + 10
  readonly rejected: readonly { readonly optionId: string; readonly reason: string }[]; // 11
  readonly validityConditions: readonly string[]; // 12
  readonly evidenceThatWouldChange: readonly {
    readonly evidence: string;
    readonly effect: EvidenceEffect;
  }[]; // 13
  readonly appetite: readonly StartupAppetiteItem[]; // 14
  readonly stability: StartupStability; // 15
  readonly measurementContract: StartupMeasurementContract | null; // 16
  // Output selection.
  readonly output: StartupOutput;
  readonly provisionalLeadId: string | null;
}
