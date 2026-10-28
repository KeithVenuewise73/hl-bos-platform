/**
 * @hl-bos/hld-transformation-pipeline — the workflow around BTI.
 *
 * Eleven stages that take a client from first assessment through implementation
 * planning, reusing @hl-bos/bti-venuewise (Client #1) and @hl-bos/bti-cycle.
 * The pipeline plans; it does not execute. No dashboards, no UI, no persistence.
 */

export * from "./types.ts";
export { PIPELINE_STAGES } from "./types.ts";
export {
  CAPABILITIES,
  capabilityForOutcome,
  capabilitiesForOutcome,
} from "./capabilities.ts";
export { buildTasks } from "./plan.ts";
export {
  buildReview,
  buildRoadmap,
  rollup,
  buildMeasurement,
  buildContinuous,
} from "./stages.ts";
export { runPipeline, reanalyze } from "./pipeline.ts";
export { renderPipeline } from "./report.ts";
export { VENUEWISE_CLIENT } from "./client-venuewise.ts";
