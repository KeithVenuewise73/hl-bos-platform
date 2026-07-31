/**
 * @hl-bos/transformation-intelligence — HL-BTI v2.
 *
 * The reusable Business Transformation Intelligence engine: a composition layer
 * over @hl-bos/bti-engine (scoring, findings, consulting) and @hl-bos/catalog
 * (Software Factory). It turns a scored assessment into executive recommendations
 * that answer — for every finding — what happened, why, what to do, the estimated
 * business impact, and what approval is required. Configurable scoring, no
 * hardcoded industries, nothing fabricated.
 *
 * Entry point: `runTransformationIntelligence(assessment, configOverrides?)`.
 */

export * from "./config";
export * from "./framework";
export * from "./impact";
export * from "./factory";
export * from "./approval";
export * from "./recommendations";
export * from "./hlvs";
export * from "./government";
export * from "./pipeline";
export * from "./customer-lifecycle";
export * from "./visibility-ai";
export * from "./crm";
export * from "./ceo-operations";
export * from "./customer-manufacturing";
export * from "./marketing";
export * from "./marketing-studio";
export * from "./content-manufacturing";
export * from "./campaigns";
export * from "./growth-dashboard";
export * from "./reference-implementation";
