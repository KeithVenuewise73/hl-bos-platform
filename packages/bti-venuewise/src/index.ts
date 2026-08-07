/**
 * @hl-bos/bti-venuewise — Venuewise through the BTI startup-analysis pipeline.
 *
 * Reuses @hl-bos/bti-cycle's confidence machine, evidence model and four
 * permitted outputs; adapts the value chain to a startup (Problem → … →
 * Margin). Reasoning spine only — no persistence, execution, or UI.
 */

export * from "./types.ts";
export { STARTUP_CHAIN, COMMERCIAL_LINKS } from "./types.ts";
export { LINK_OUTCOMES, analyzeChain, analyzeLink } from "./chain.ts";
export {
  runStartupCycle,
  identifyConstraint,
  generateOptions,
  decide,
  buildAppetite,
  assessStability,
  buildMeasurementContract,
} from "./reasoning.ts";
export { renderReport } from "./report.ts";
export { VENUEWISE_ENGAGEMENT } from "./venuewise.ts";
