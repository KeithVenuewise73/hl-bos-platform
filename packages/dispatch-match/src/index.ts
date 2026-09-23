// DispatchOS Match — backhaul load-matching engine.
//
// Equipment-agnostic and tenant-scoped. Demo data lives in "./demo" and is
// deliberately NOT re-exported here, so production code cannot pick it up by
// accident.

export * from "./types";
export * from "./equipment";
export * from "./geo";
export * from "./config";
export * from "./score";
export * from "./lane-history";
export * from "./sources";
export * from "./match";
// National place resolution is a separate entry point, "@hl-bos/dispatch-match/places":
// it loads ~5 MB of ZIP data and must stay out of browser bundles.
