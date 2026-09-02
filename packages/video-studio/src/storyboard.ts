import { containRect, coverToAspect, cropToAspect, scaleRect } from "./geometry";
import type {
  CameraMove,
  FitMode,
  PanelDetection,
  Rect,
  Shot,
  Storyboard,
} from "./types";

export interface StoryboardOptions {
  /** Output frame size. Defaults to 1920 x 1080. */
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly background: string;
  /**
   * `fill` crops each panel to the output shape; `contain` fits the whole panel
   * inside it and pads the rest. `contain` is the default because cropping a
   * comic panel to 16:9 silently deletes its caption bar, and losing what the
   * artist drew is a worse failure than a black bar.
   */
  readonly fit: FitMode;
  /** Milliseconds each panel is on screen. */
  readonly shotDurationMs: number;
  /** Crossfade between shots. */
  readonly transitionMs: number;
  /** Open on the whole image so the viewer sees the layout before the tour. */
  readonly openWithEstablishingShot: boolean;
  /** Close on the whole image again. */
  readonly closeWithEstablishingShot: boolean;
  readonly establishingDurationMs: number;
  /** How far a push-in travels. 0.84 = ends at 84% of the starting frame. */
  readonly zoom: number;
  /** Cycled through, in order, one per panel. */
  readonly moves: readonly CameraMove[];
}

export const DEFAULT_STORYBOARD_OPTIONS: StoryboardOptions = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#000000",
  fit: "contain",
  shotDurationMs: 2600,
  transitionMs: 420,
  openWithEstablishingShot: true,
  closeWithEstablishingShot: true,
  establishingDurationMs: 2000,
  zoom: 0.84,
  // Alternating so a six-panel page does not feel like six identical zooms.
  moves: ["push-in", "pan-right", "pull-out", "pan-left", "push-in", "pan-up"],
};

/**
 * The aspect ratio the camera should frame a panel at.
 *
 * Exported because the Control Center re-frames a shot when the operator picks
 * a different camera move, and a second copy of this rule that drifted would
 * crop panels only on the overridden shots -- a bug nobody would look for.
 */
export function cameraAspect(fit: FitMode, frameAspect: number, panel: Rect): number {
  return fit === "fill" ? frameAspect : panel.width / panel.height;
}

/**
 * Turn a camera move over a panel into a start and end rectangle.
 *
 * Both rectangles carry the output aspect ratio and stay inside the panel, so
 * the shot never drifts into the neighbouring panel mid-move.
 */
export function resolveMove(
  move: CameraMove,
  panel: Rect,
  aspect: number,
  zoom: number,
): { from: Rect; to: Rect } {
  const base = cropToAspect(panel, aspect);
  const tight = scaleRect(base, zoom);
  const inside = (r: Rect): Rect => containRect(r, panel);

  const atX = (x: number): Rect => inside({ ...tight, x });
  const atY = (y: number): Rect => inside({ ...tight, y });
  const left = atX(panel.x);
  const right = atX(panel.x + panel.width - tight.width);
  const top = atY(panel.y);
  const bottom = atY(panel.y + panel.height - tight.height);

  switch (move) {
    case "hold":
      return { from: base, to: base };
    case "push-in":
      return { from: base, to: inside(tight) };
    case "pull-out":
      return { from: inside(tight), to: base };
    case "pan-left":
      return { from: right, to: left };
    case "pan-right":
      return { from: left, to: right };
    case "pan-up":
      return { from: bottom, to: top };
    case "pan-down":
      return { from: top, to: bottom };
  }
}

/**
 * Build a shot list from detected panels.
 *
 * Captions are deliberately empty. Many source images already carry their own
 * lettering, and inventing a line of narration the artwork does not say would
 * be putting words in someone's mouth. The operator types captions if they
 * want them.
 */
export function buildStoryboard(
  detection: PanelDetection,
  options: Partial<StoryboardOptions> = {},
): Storyboard {
  const o: StoryboardOptions = { ...DEFAULT_STORYBOARD_OPTIONS, ...options };
  const frameAspect = o.width / o.height;
  const full: Rect = {
    x: 0,
    y: 0,
    width: detection.source.width,
    height: detection.source.height,
  };
  // In `contain` the camera keeps the ARTWORK's shape and the renderer pads the
  // frame; in `fill` the camera is cut to the frame's shape up front.
  const establishing = o.fit === "fill" ? coverToAspect(full, frameAspect) : full;
  const shots: Shot[] = [];

  const push = (shot: Omit<Shot, "transitionInMs">): void => {
    shots.push({ ...shot, transitionInMs: shots.length === 0 ? 0 : o.transitionMs });
  };

  const singlePanel = detection.panels.length === 1;

  if (o.openWithEstablishingShot && !singlePanel) {
    push({
      id: "shot-open",
      label: "Full page",
      from: establishing,
      to: scaleRect(establishing, 0.94),
      durationMs: o.establishingDurationMs,
      easing: "ease-out",
      caption: "",
    });
  }

  for (const panel of detection.panels) {
    const move = o.moves[panel.index % o.moves.length] ?? "push-in";
    const aspect = cameraAspect(o.fit, frameAspect, panel.bounds);
    const { from, to } = resolveMove(move, panel.bounds, aspect, o.zoom);
    push({
      id: `shot-${panel.id}`,
      label: singlePanel ? "Full image" : `Panel ${panel.index + 1}`,
      from,
      to,
      durationMs: o.shotDurationMs,
      easing: "ease-in-out",
      caption: "",
    });
  }

  if (o.closeWithEstablishingShot && !singlePanel) {
    push({
      id: "shot-close",
      label: "Full page",
      from: scaleRect(establishing, 0.94),
      to: establishing,
      durationMs: o.establishingDurationMs,
      easing: "ease-in",
      caption: "",
    });
  }

  return {
    width: o.width,
    height: o.height,
    sourceWidth: detection.source.width,
    sourceHeight: detection.source.height,
    fps: o.fps,
    background: o.background,
    fit: o.fit,
    shots,
  };
}
