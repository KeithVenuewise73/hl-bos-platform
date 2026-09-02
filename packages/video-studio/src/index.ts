/**
 * @hl-bos/video-studio — still image in, video plan out.
 *
 * Pure and deterministic. Given the same image and options it produces the same
 * shot list and the same frame at the same millisecond, forever. It never
 * touches the network and it does not draw: the host renders the frames this
 * package describes.
 */
export * from "./types";
export {
  clamp,
  containRect,
  coverToAspect,
  cropToAspect,
  lerpRect,
  rect,
  scaleRect,
} from "./geometry";
export { EASINGS, ease } from "./easing";
export {
  DEFAULT_PANEL_OPTIONS,
  contentStrips,
  detectPanels,
  separatorBands,
  uniformityProfile,
} from "./panels";
export type { PanelDetectionOptions } from "./panels";
export {
  DEFAULT_STORYBOARD_OPTIONS,
  buildStoryboard,
  cameraAspect,
  resolveMove,
} from "./storyboard";
export type { StoryboardOptions } from "./storyboard";
export {
  clipToSource,
  composeFrame,
  frameCount,
  shotTimings,
  targetFor,
  timeForFrame,
  totalDurationMs,
} from "./timeline";
export type { ShotTiming } from "./timeline";
export { CAMERA_PROVIDER, hasWorkingProvider, listProviders } from "./providers";
export type { ProviderKind, ProviderStatus, VideoProvider } from "./providers";
