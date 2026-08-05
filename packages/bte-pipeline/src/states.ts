/**
 * The BTE processing state machine.
 *
 * Truthful by construction: a state is only ever entered through an ALLOWED
 * transition, every transition is recorded on the timeline (see pipeline.ts),
 * and the two sink states (`failed`, `archived`) never silently drop the work —
 * a failed engagement stays visible in BTIC with a `nextAction`.
 */

import type { ProcessingState } from "./types.ts";

export const PROCESSING_STATES: readonly ProcessingState[] = [
  "received",
  "evidence_collection_pending",
  "evidence_collection_running",
  "analysis_pending",
  "analysis_running",
  "report_generation_running",
  "hld_review_required",
  "clarification_required",
  "approved",
  "client_ready",
  "failed",
  "archived",
] as const;

/**
 * The happy-path order the automated pipeline walks, ending at
 * `hld_review_required` — V1 stops there and waits for a human. `approved` and
 * `client_ready` are reached only by later, CEO-gated review, never by this
 * pipeline.
 */
export const HAPPY_PATH: readonly ProcessingState[] = [
  "received",
  "evidence_collection_pending",
  "evidence_collection_running",
  "analysis_pending",
  "analysis_running",
  "report_generation_running",
  "hld_review_required",
] as const;

const TRANSITIONS: Record<ProcessingState, readonly ProcessingState[]> = {
  received: [
    "evidence_collection_pending",
    "clarification_required",
    "failed",
    "archived",
  ],
  evidence_collection_pending: ["evidence_collection_running", "failed", "archived"],
  evidence_collection_running: ["analysis_pending", "failed", "archived"],
  analysis_pending: ["analysis_running", "failed", "archived"],
  analysis_running: ["report_generation_running", "failed", "archived"],
  report_generation_running: [
    "hld_review_required",
    "clarification_required",
    "failed",
    "archived",
  ],
  // Terminal-for-V1 human gates. A failed job can re-enter the pipeline for retry.
  hld_review_required: ["approved", "clarification_required", "archived"],
  clarification_required: [
    "evidence_collection_pending",
    "analysis_pending",
    "archived",
  ],
  approved: ["client_ready", "archived"],
  client_ready: ["archived"],
  // `failed` is recoverable: an operator/worker may retry from the point of
  // failure. It is never a silent dead end.
  failed: [
    "evidence_collection_pending",
    "analysis_pending",
    "report_generation_running",
    "archived",
  ],
  archived: [],
};

/** Whether a direct transition from `from` to `to` is allowed. */
export function canTransition(from: ProcessingState, to: ProcessingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFailure(state: ProcessingState): boolean {
  return state === "failed";
}

/** A state from which the automated pipeline will do no further automatic work. */
export function isTerminalForPipeline(state: ProcessingState): boolean {
  return (
    state === "hld_review_required" ||
    state === "clarification_required" ||
    state === "failed" ||
    state === "archived" ||
    state === "approved" ||
    state === "client_ready"
  );
}

/** The plain-language next action for any state — shown in BTIC. */
export function nextActionFor(state: ProcessingState): string {
  switch (state) {
    case "received":
      return "Queue automated evidence collection.";
    case "evidence_collection_pending":
      return "Evidence collection is queued; the worker will start it.";
    case "evidence_collection_running":
      return "Collecting public website evidence.";
    case "analysis_pending":
      return "Analysis is queued.";
    case "analysis_running":
      return "Analyzing intake and collected evidence.";
    case "report_generation_running":
      return "Generating the initial draft report.";
    case "hld_review_required":
      return "HLD must review the draft report before it becomes client-ready.";
    case "clarification_required":
      return "Owner confirmation is required before analysis can continue.";
    case "approved":
      return "Report approved by HLD; prepare a client-ready package (separate step).";
    case "client_ready":
      return "Client-ready package prepared (never auto-sent in V1).";
    case "failed":
      return "Automated processing failed; retry from the recorded point or review in BTIC.";
    case "archived":
      return "Engagement archived; no further action.";
  }
}
