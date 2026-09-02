/**
 * The vocabulary of the video studio.
 *
 * Everything here is data. Nothing in this package draws, encodes, uploads or
 * calls anything: it decides WHAT should be on screen at a given millisecond,
 * and the host (a browser canvas, today) puts it there. That split is what
 * makes the whole plan unit-testable without a media toolchain.
 */

/** A decoded image, RGBA, 4 bytes per pixel, row-major, no padding. */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** length must be width * height * 4 */
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** An axis-aligned rectangle in source-image pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A run of consecutive rows or columns that separates content from content. */
export interface SeparatorBand {
  readonly start: number;
  /** Inclusive. */
  readonly end: number;
}

/** One detected panel of a composite image. */
export interface Panel {
  readonly id: string;
  /** Reading order: left to right, top to bottom, starting at 0. */
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly bounds: Rect;
}

/** How the panels in an image were arrived at. */
export type DetectionMethod = "grid" | "whole-image";

export interface PanelDetection {
  readonly panels: readonly Panel[];
  readonly rows: number;
  readonly columns: number;
  readonly method: DetectionMethod;
  /** Plain English, for the operator. Says what happened, including failure. */
  readonly note: string;
  readonly source: { readonly width: number; readonly height: number };
  readonly rowBands: readonly SeparatorBand[];
  readonly columnBands: readonly SeparatorBand[];
}

export type EasingName = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * What to do when the artwork and the video frame are different shapes.
 *
 * `fill` crops the artwork to the frame — punchier, but a near-square comic
 * panel loses its top and bottom, which is where the lettering usually is.
 * `contain` fits the whole panel in and pads the rest with the background, so
 * nothing the artist drew is thrown away.
 */
export type FitMode = "fill" | "contain";

/**
 * A camera move over a panel. These are the moves a documentary editor would
 * reach for; each one resolves to a start rectangle and an end rectangle.
 */
export type CameraMove =
  "hold" | "push-in" | "pull-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";

/** One shot: the camera travels from `from` to `to` over `durationMs`. */
export interface Shot {
  readonly id: string;
  /** What the viewer is looking at, e.g. "Panel 3" or "Full page". */
  readonly label: string;
  readonly from: Rect;
  readonly to: Rect;
  readonly durationMs: number;
  readonly easing: EasingName;
  /** Crossfade INTO this shot, in ms. 0 on the first shot. */
  readonly transitionInMs: number;
  /** Optional burned-in caption. Empty string means none. */
  readonly caption: string;
}

/** A complete, renderable plan. */
export interface Storyboard {
  /** Output frame size in pixels. */
  readonly width: number;
  readonly height: number;
  /** Size of the source image the shots are cut from. */
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly fps: number;
  /** CSS colour painted behind every frame, and into any padding. */
  readonly background: string;
  readonly fit: FitMode;
  readonly shots: readonly Shot[];
}

/** One image draw for a single output frame. */
export interface FrameLayer {
  readonly shotId: string;
  /** Region of the SOURCE image to take. */
  readonly source: Rect;
  /** Region of the OUTPUT frame to put it in. */
  readonly target: Rect;
  /** 0..1. Layers are drawn in array order, painter's algorithm. */
  readonly opacity: number;
  readonly caption: string;
}

/** Everything needed to paint one output frame. */
export interface Frame {
  readonly timeMs: number;
  readonly layers: readonly FrameLayer[];
}
