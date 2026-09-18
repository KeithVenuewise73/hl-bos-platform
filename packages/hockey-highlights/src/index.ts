/**
 * HighlightAI Hockey — the engine.
 *
 * Pure, deterministic and dependency-free. It takes tracks produced by a vision
 * service and decides what they mean: which of them is the athlete, which
 * stretches are worth watching, what the clips should be, and how the reel is
 * assembled once a person has approved them.
 *
 * It does not decode video, run a model, or talk to a network. Those live in
 * services/hockey-vision behind the `VisionProvider` interface, so replacing
 * the detector is a new file rather than a rewrite.
 */

export * from "./types.ts";
export * from "./jobs.ts";
export * from "./jersey.ts";
export * from "./identity.ts";
export * from "./events.ts";
export * from "./clips.ts";
export * from "./review.ts";
export * from "./reel.ts";
export * from "./vision/index.ts";
export * from "./pipeline.ts";
