/**
 * Smart camera crop for vertical and square output (brief section 20).
 *
 * THE MISTAKE THIS AVOIDS. The obvious implementation centres the 9:16 window
 * on the tracked athlete. It produces an unwatchable clip. A receiver runs a
 * 15-yard out; the crop pins him dead centre, the defender and the football are
 * off-screen, and the viewer sees a man running in front of some grass. The
 * catch — the reason the clip exists — happens outside the frame.
 *
 * So the crop follows a weighted target: mostly the athlete, pulled toward the
 * football when the football is known and near. The athlete is guaranteed to
 * stay inside a safe margin; within that guarantee the window drifts toward the
 * action.
 *
 * SMOOTHING IS NOT COSMETIC. Detection boxes jitter by a few pixels every frame.
 * Feeding that straight to a crop produces a shaking image that looks like a
 * fault in the export. An exponential moving average plus a per-frame velocity
 * clamp gives a result that reads as a camera operator rather than a servo.
 */

import type { AspectRatio, BoundingBox, Point } from "./types";
import { boxCenter } from "./types";

export const ASPECT_VALUES: Readonly<Record<AspectRatio, number>> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
};

export interface CropKeyframe {
  readonly frame: number;
  /** Crop window in normalised source coordinates. */
  readonly window: BoundingBox;
}

export interface CropInput {
  readonly frame: number;
  /** The athlete's box this frame, or null when he was not detected. */
  readonly player: BoundingBox | null;
  /** The football's box this frame, when known. */
  readonly ball: BoundingBox | null;
}

export interface CropOptions {
  readonly target: AspectRatio;
  /** Source aspect, e.g. 16/9 for a standard game file. */
  readonly sourceAspect: number;
  /**
   * How strongly the window is pulled toward the ball, 0..1. 0.35 keeps the
   * athlete unmistakably the subject while admitting the context that makes the
   * play legible.
   */
  readonly ballPull?: number;
  /** EMA factor. Lower is smoother and lags more. */
  readonly smoothing?: number;
  /** Max normalised movement of the crop centre per frame. The servo clamp. */
  readonly maxPanPerFrame?: number;
  /** Fraction of the crop window kept clear of the athlete at the edges. */
  readonly safeMargin?: number;
}

const CROP_DEFAULTS = {
  ballPull: 0.35,
  smoothing: 0.18,
  maxPanPerFrame: 0.012,
  safeMargin: 0.15,
};

/**
 * The largest window of `target` aspect that fits inside a normalised source
 * frame of `sourceAspect`.
 *
 * Normalised coordinates hide the fact that x and y are not the same physical
 * length, so the source aspect has to be reintroduced here or every crop comes
 * out the wrong shape.
 */
export function cropWindowSize(
  target: AspectRatio,
  sourceAspect: number,
): { w: number; h: number } {
  const targetAspect = ASPECT_VALUES[target];
  // Window aspect in normalised units = (w * sourceAspect) / h.
  // Solve for the largest w,h <= 1 satisfying that ratio.
  const hIfFullWidth = sourceAspect / targetAspect;
  if (hIfFullWidth <= 1) return { w: 1, h: hIfFullWidth };
  return { w: targetAspect / sourceAspect, h: 1 };
}

/**
 * Plan the crop path for one clip.
 *
 * Frames where the athlete was not detected do not freeze the camera and do not
 * jump it: the window keeps its last velocity briefly, the way an operator
 * would carry through a pan when a player disappears behind another. Holding
 * dead still during an occlusion is what makes an auto-crop look broken.
 */
export function planCropPath(
  inputs: readonly CropInput[],
  opts: CropOptions,
): CropKeyframe[] {
  const o = { ...CROP_DEFAULTS, ...opts };
  const size = cropWindowSize(o.target, o.sourceAspect);
  if (inputs.length === 0) return [];

  const halfW = size.w / 2;
  const halfH = size.h / 2;
  const clampCenter = (c: Point): Point => ({
    x: Math.min(1 - halfW, Math.max(halfW, c.x)),
    y: Math.min(1 - halfH, Math.max(halfH, c.y)),
  });

  let center: Point | null = null;
  let velocity: Point = { x: 0, y: 0 };
  const out: CropKeyframe[] = [];

  for (const input of inputs) {
    let desired: Point | null = null;

    if (input.player !== null) {
      const p = boxCenter(input.player);
      if (input.ball !== null) {
        const b = boxCenter(input.ball);
        const separation = Math.hypot(b.x - p.x, b.y - p.y);
        // Pull toward the ball only while it is plausibly part of THIS athlete's
        // play. A ball 70% of the frame away is a different part of the field,
        // and chasing it would abandon the subject.
        const relevance =
          separation < halfW * 1.8
            ? 1
            : Math.max(0, 1 - (separation - halfW * 1.8) * 2);
        const pull = o.ballPull * relevance;
        desired = {
          x: p.x * (1 - pull) + b.x * pull,
          y: p.y * (1 - pull) + b.y * pull,
        };
      } else {
        desired = p;
      }
    }

    if (center === null) {
      // First frame: snap to the subject rather than easing in from the middle
      // of the screen, which would open every vertical clip on a slow drift.
      center = clampCenter(desired ?? { x: 0.5, y: 0.5 });
      out.push({ frame: input.frame, window: windowAt(center, size) });
      continue;
    }

    let next: Point;
    if (desired === null) {
      // Occluded: carry the existing motion, decaying, instead of stopping dead.
      next = { x: center.x + velocity.x * 0.6, y: center.y + velocity.y * 0.6 };
    } else {
      next = {
        x: center.x + (desired.x - center.x) * o.smoothing,
        y: center.y + (desired.y - center.y) * o.smoothing,
      };
    }

    // Velocity clamp: this is what turns a tracking box into a camera move.
    const dx = Math.max(
      -o.maxPanPerFrame,
      Math.min(o.maxPanPerFrame, next.x - center.x),
    );
    const dy = Math.max(
      -o.maxPanPerFrame,
      Math.min(o.maxPanPerFrame, next.y - center.y),
    );
    let candidate = clampCenter({ x: center.x + dx, y: center.y + dy });

    // The guarantee: whatever the smoothing wanted, the athlete stays inside the
    // safe area. When the clamp and the subject conflict, the subject wins —
    // a smooth crop that loses the player has failed at its only job.
    if (input.player !== null) {
      candidate = clampCenter(
        enforceSafeArea(candidate, input.player, size, o.safeMargin),
      );
    }

    velocity = { x: candidate.x - center.x, y: candidate.y - center.y };
    center = candidate;
    out.push({ frame: input.frame, window: windowAt(center, size) });
  }

  return out;
}

function windowAt(center: Point, size: { w: number; h: number }): BoundingBox {
  return { x: center.x - size.w / 2, y: center.y - size.h / 2, w: size.w, h: size.h };
}

/** Push the window the minimum distance needed to bring the athlete back
 *  inside the safe area. Minimum, so the correction is invisible. */
function enforceSafeArea(
  center: Point,
  player: BoundingBox,
  size: { w: number; h: number },
  margin: number,
): Point {
  const mx = size.w * margin;
  const my = size.h * margin;
  const left = center.x - size.w / 2 + mx;
  const right = center.x + size.w / 2 - mx;
  const top = center.y - size.h / 2 + my;
  const bottom = center.y + size.h / 2 - my;

  let x = center.x;
  let y = center.y;
  if (player.x < left) x -= left - player.x;
  else if (player.x + player.w > right) x += player.x + player.w - right;
  if (player.y < top) y -= top - player.y;
  else if (player.y + player.h > bottom) y += player.y + player.h - bottom;
  return { x, y };
}

/** True when the athlete's box is fully inside the crop window. Used by the
 *  tests to assert the guarantee rather than trusting the implementation. */
export function containsBox(window: BoundingBox, box: BoundingBox): boolean {
  return (
    box.x >= window.x - 1e-9 &&
    box.y >= window.y - 1e-9 &&
    box.x + box.w <= window.x + window.w + 1e-9 &&
    box.y + box.h <= window.y + window.h + 1e-9
  );
}
