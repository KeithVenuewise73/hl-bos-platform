/**
 * Herman Legacy Digital Transformation Pipeline — domain model.
 *
 * The pipeline is the WORKFLOW around BTI: BTI (reused, not rebuilt) produces the
 * analysis; the pipeline turns that analysis into a client transformation made of
 * executable implementation tasks mapped to Herman Legacy Digital capabilities.
 *
 * It plans; it does not execute. No task is run, nothing is deployed. The
 * transformation — not the report — is the product, so every recommendation must
 * become an executable task here.
 */

import type {
  StartupLedger,
  StartupOutput,
  StartupMeasurementContract,
} from "@hl-bos/bti-venuewise";

export type { StartupLedger, StartupOutput, StartupMeasurementContract };

/** The eleven pipeline stages, in order. */
export const PIPELINE_STAGES = [
  "business_discovery",
  "evidence_collection",
  "bti_analysis",
  "executive_transformation_report",
  "executive_review",
  "transformation_plan",
  "capability_mapping",
  "implementation_roadmap",
  "progress_tracking",
  "success_measurement",
  "continuous_transformation",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// --- Stage 5: Executive Review ---------------------------------------------

/**
 * The CEO's decision on the BTI output. For COLLECT_MORE_EVIDENCE the honest
 * decision is to approve the evidence-collection + provisional-lead work, not to
 * approve a full transformation that has not been justified yet.
 */
export type ExecutiveDecision =
  "approve_transformation" | "approve_evidence_collection" | "defer" | "decline";

export interface ExecutiveReview {
  readonly output: StartupOutput;
  readonly decision: ExecutiveDecision;
  readonly rationale: string;
  /** True when a full implementation roadmap is justified (a firm recommendation). */
  readonly fullRoadmapUnlocked: boolean;
}

// --- Stage 7: Capability mapping (HLD execution mechanisms) -----------------

export type CapabilityId =
  | "consulting_strategy"
  | "market_validation"
  | "sales_enablement"
  | "onboarding_ops"
  | "crm"
  | "automation"
  | "marketing"
  | "analytics_measurement"
  | "pricing_finance";

export interface Capability {
  readonly id: CapabilityId;
  readonly name: string;
  /** What this capability EXECUTES — a mechanism, never a recommendation. */
  readonly executes: string;
}

// --- Stage 6/8: Implementation tasks & roadmap -----------------------------

export type TaskSource = "evidence" | "transformation" | "measurement";
export type TaskStatus = "not_started" | "in_progress" | "blocked" | "done";

/** The atomic unit the whole pipeline exists to produce: an executable task. */
export interface ImplementationTask {
  readonly id: string;
  readonly title: string;
  readonly source: TaskSource;
  /** The HLD capability that would execute it (mapping is post-analysis only). */
  readonly capability: CapabilityId;
  readonly objective: string;
  readonly acceptanceCriteria: string;
  readonly dependsOn: readonly string[];
  readonly status: TaskStatus;
  /** True when completing this task produces evidence that feeds the next BTI run. */
  readonly feedsReanalysis: boolean;
}

export interface RoadmapPhase {
  readonly key: string;
  readonly title: string;
  readonly intent: string;
  readonly taskIds: readonly string[];
  /** Gated phases are not planned in detail until BTI reruns to a firm rec. */
  readonly gated: boolean;
  readonly unlockCondition?: string;
}

// --- Stage 9: Progress tracking --------------------------------------------

export interface ProgressRollup {
  readonly total: number;
  readonly notStarted: number;
  readonly inProgress: number;
  readonly blocked: number;
  readonly done: number;
  /** Deterministic completion percentage over ungated tasks. */
  readonly percentComplete: number;
}

// --- Stage 10: Success measurement -----------------------------------------

export interface SuccessMeasurement {
  readonly contract: StartupMeasurementContract | null;
  /** Actual outcome once measured; honest null until real data exists. */
  readonly actual: number | null;
  readonly verdict: "not_yet_measured" | "on_track" | "off_track";
  readonly note: string;
}

// --- Stage 11: Continuous transformation -----------------------------------

export interface ContinuousPlan {
  readonly rerunWhen: string;
  readonly whatWouldUnlockNext: string;
}

// --- The full pipeline state ------------------------------------------------

export interface PipelineState {
  readonly client: string;
  readonly stagesRun: readonly PipelineStage[];
  readonly ledger: StartupLedger; // stages 1–4
  readonly report: string; // stage 4 artifact
  readonly review: ExecutiveReview; // stage 5
  readonly tasks: readonly ImplementationTask[]; // stage 6
  readonly capabilityMap: readonly {
    readonly taskId: string;
    readonly capability: Capability;
  }[]; // stage 7
  readonly roadmap: readonly RoadmapPhase[]; // stage 8
  readonly progress: ProgressRollup; // stage 9
  readonly measurement: SuccessMeasurement; // stage 10
  readonly continuous: ContinuousPlan; // stage 11
}
