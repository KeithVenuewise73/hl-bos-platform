/**
 * @hl-bos/highlight-football — the football intelligence behind HighlightAI.
 *
 * Pure and deterministic. Given the same detections it reaches the same
 * conclusions, forever. It never touches the network, never loads a model and
 * never decodes a frame: the computer-vision worker produces observations, this
 * package decides what they mean, and the renderer executes the plan it emits.
 *
 * That split is what makes the product's judgement testable. Every decision the
 * user sees — that this track is their child, that this play is worth watching,
 * that this clip starts here and ends there — is made by a function in this
 * package and covered by a test that does not need a video card.
 */

export * from "./types";
export * from "./color";
export * from "./jersey";
export * from "./reid";
export * from "./segmentation";
export * from "./tracking";
export * from "./involvement";
export * from "./highlight";
export * from "./crop";
export * from "./spotlight";
export * from "./reel";
export * from "./pipeline";
export * from "./metrics";
export * from "./adapters";
export * from "./analyze";
