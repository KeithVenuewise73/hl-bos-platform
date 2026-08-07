/**
 * @hl-bos/bti-cycle — BTI V1, one transformation cycle.
 *
 * Public surface: the domain types, the confidence state machine, the value
 * chain, the reasoning engine (runCycle), the plain-language renderer, and the
 * real Saffer engagement seed. Persistence, execution and UI are out of scope
 * for this slice — this is the reasoning spine, Customer Goal → Measurement
 * Contract.
 */

export * from "./types.ts";
export {
  atLeast,
  weaker,
  degrade,
  isOutdated,
  effectiveTier,
  capByWeakest,
} from "./confidence.ts";
export type { ConfidenceInput } from "./confidence.ts";
export { VALUE_CHAIN } from "./types.ts";
export {
  LINK_OUTCOMES,
  analyzeChain,
  analyzeLink,
  evidenceForLink,
} from "./valuechain.ts";
export {
  runCycle,
  identifyConstraint,
  generateOptions,
  decide,
  buildAppetite,
  assessStability,
  buildMeasurementContract,
} from "./reasoning.ts";
export { renderLedger } from "./render.ts";
export { SAFFER_ENGAGEMENT } from "./saffer.ts";
