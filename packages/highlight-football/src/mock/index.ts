/**
 * Demo-mode entry point.
 *
 * Everything exported here produces SYNTHETIC football. It is labelled as such
 * by the adapters' `kind: "demo"` and must be labelled as such everywhere it
 * reaches a human. See ../adapters.ts for why that rule is absolute.
 */

export * from "./synthetic";
export * from "./fixtures";
export * from "./adapters";
