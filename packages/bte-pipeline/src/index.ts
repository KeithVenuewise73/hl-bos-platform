// @hl-bos/bte-pipeline — the Business Transformation Engine automated intake
// pipeline core. DB-agnostic, deterministic, testable. Persistence,
// notification and delivery bind through the ports in `adapters.ts`.

export * from "./types.ts";
export * from "./states.ts";
export * from "./confidence.ts";
export * from "./evidence.ts";
export * from "./report.ts";
export * from "./versioning.ts";
export * from "./adapters.ts";
export * from "./pipeline.ts";
export * from "./sample.ts";

export const BTE_PIPELINE_VERSION = "bte-pipeline-0.1.0";
