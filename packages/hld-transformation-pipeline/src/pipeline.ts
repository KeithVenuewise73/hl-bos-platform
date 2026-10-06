/**
 * The Herman Legacy Digital Transformation Pipeline orchestrator.
 *
 * Walks all eleven stages for one client. Stages 1–4 REUSE @hl-bos/bti-venuewise
 * (which reuses @hl-bos/bti-cycle) — nothing about BTI is rebuilt here. Stages
 * 5–11 turn that analysis into an executable client transformation.
 *
 * Deterministic and side-effect-free: it plans, it does not execute a task,
 * deploy anything, or touch a database.
 */

import { runStartupCycle, renderReport } from "@hl-bos/bti-venuewise";
import type {
  StartupEngagement,
  StartupEvidence,
  StartupLedger,
} from "@hl-bos/bti-venuewise";
import { CAPABILITIES } from "./capabilities.ts";
import { buildTasks } from "./plan.ts";
import {
  buildContinuous,
  buildMeasurement,
  buildReview,
  buildRoadmap,
  rollup,
} from "./stages.ts";
import type { ExecutiveDecision, PipelineState } from "./types.ts";
import { PIPELINE_STAGES } from "./types.ts";

export function runPipeline(
  engagement: StartupEngagement,
  decision?: ExecutiveDecision,
): PipelineState {
  // Stages 1–4: Business Discovery, Evidence Collection, BTI Analysis, Report.
  const ledger: StartupLedger = runStartupCycle(engagement);
  const report = renderReport(ledger);

  // Stage 5: Executive Review.
  const review = buildReview(ledger, decision);

  // Stage 6: Transformation Plan (executable tasks).
  const tasks = buildTasks(ledger, review);

  // Stage 7: Capability Mapping (post-analysis; never influences BTI).
  const capabilityMap = tasks.map((t) => ({
    taskId: t.id,
    capability: CAPABILITIES[t.capability],
  }));

  // Stage 8: Implementation Roadmap.
  const roadmap = buildRoadmap(tasks, review);

  // Stage 9: Progress Tracking.
  const progress = rollup(tasks);

  // Stage 10: Success Measurement.
  const measurement = buildMeasurement(ledger);

  // Stage 11: Continuous Transformation.
  const continuous = buildContinuous(ledger);

  return {
    client: engagement.business,
    stagesRun: PIPELINE_STAGES,
    ledger,
    report,
    review,
    tasks,
    capabilityMap,
    roadmap,
    progress,
    measurement,
    continuous,
  };
}

/**
 * Continuous transformation, stage 11: fold newly-collected evidence back into
 * the engagement and rerun BTI. When the new evidence confirms the binding
 * constraint, the output moves off COLLECT_MORE_EVIDENCE and the full roadmap
 * unlocks — proving the loop closes.
 */
export function reanalyze(
  engagement: StartupEngagement,
  newEvidence: readonly StartupEvidence[],
  decision?: ExecutiveDecision,
): PipelineState {
  return runPipeline(
    { ...engagement, evidence: [...engagement.evidence, ...newEvidence] },
    decision,
  );
}
