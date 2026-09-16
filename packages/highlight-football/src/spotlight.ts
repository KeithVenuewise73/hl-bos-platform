/**
 * Player spotlight and overlay planning (brief section 19).
 *
 * THE CONSTRAINT THAT SHAPES THIS FILE: "Do not obscure the actual play."
 *
 * It is easy to write an overlay that makes the athlete unmissable and the
 * football invisible. A filled highlight shape, a large name tag anchored under
 * the player, an arrow pointing down into the action — each of them hides the
 * thing the clip exists to show. So the marker is an OUTLINE, never a fill, and
 * the label is placed on the side of the athlete AWAY from the football, moving
 * when the ball moves.
 *
 * The freeze-frame identification happens BEFORE the snap, in dead time where
 * nothing is being hidden, and then gets out of the way.
 *
 * This module plans; it does not draw. It emits a description the renderer
 * executes, so the same plan can be drawn by FFmpeg for an export and by the
 * browser for a live preview, and the two cannot drift.
 */

import type { BoundingBox, ClipWindow, Point, SpotlightStyle } from "./types";
import { boxCenter } from "./types";

export interface SpotlightMarker {
  readonly frame: number;
  readonly style: Exclude<SpotlightStyle, "freeze_frame" | "none">;
  /** Where to draw, in normalised source coordinates. */
  readonly box: BoundingBox;
  /** 0..1, so the marker can fade in and out rather than popping. */
  readonly opacity: number;
}

export interface SpotlightLabel {
  readonly text: string;
  readonly anchor: Point;
  /** Which side of the athlete the label sits on, chosen away from the ball. */
  readonly side: "left" | "right" | "above" | "below";
}

export interface FreezeCard {
  /** Source time the frame is frozen on. */
  readonly atSeconds: number;
  readonly holdSeconds: number;
  readonly headline: string;
  readonly subhead: string;
  readonly marker: SpotlightMarker;
  readonly label: SpotlightLabel;
}

export interface SpotlightPlan {
  readonly style: SpotlightStyle;
  /** null when the clip has no usable pre-snap dead time to freeze in. */
  readonly freeze: FreezeCard | null;
  readonly markers: readonly SpotlightMarker[];
}

export interface SpotlightInput {
  readonly frame: number;
  readonly seconds: number;
  readonly player: BoundingBox | null;
  readonly ball: BoundingBox | null;
}

export interface SpotlightOptions {
  readonly style?: SpotlightStyle;
  /** Seconds before the snap to hold the identification card. */
  readonly freezeBeforeSnapSeconds?: number;
  readonly freezeHoldSeconds?: number;
  /** Seconds the tracking marker stays on after the snap. */
  readonly markerSeconds?: number;
  /** Fade duration at each end of the marker's life. */
  readonly fadeSeconds?: number;
  /** Grows the marker beyond the detection box so it frames rather than covers. */
  readonly markerPadding?: number;
}

const SPOT_DEFAULTS = {
  style: "circle" as SpotlightStyle,
  freezeBeforeSnapSeconds: 1,
  freezeHoldSeconds: 1,
  markerSeconds: 3,
  fadeSeconds: 0.4,
  markerPadding: 0.25,
};

export interface SpotlightSubject {
  readonly name: string;
  readonly number: string;
  readonly team: string;
}

/**
 * Plan the spotlight for one clip.
 *
 * `snapSeconds` is the anchor for everything: the freeze lands a second before
 * it, and the tracking marker runs from the snap through the first seconds of
 * the play, then fades. Leaving the marker on for the whole clip is what turns
 * a highlight into a coaching diagram.
 */
export function planSpotlight(
  clip: ClipWindow,
  snapSeconds: number,
  frames: readonly SpotlightInput[],
  subject: SpotlightSubject,
  opts: SpotlightOptions = {},
): SpotlightPlan {
  const o = { ...SPOT_DEFAULTS, ...opts };
  if (o.style === "none") return { style: "none", freeze: null, markers: [] };

  const markerStyle: Exclude<SpotlightStyle, "freeze_frame" | "none"> =
    o.style === "freeze_frame" ? "circle" : o.style;

  // --- Freeze card ---------------------------------------------------------
  const freezeAt = snapSeconds - o.freezeBeforeSnapSeconds;
  let freeze: FreezeCard | null = null;
  // Only freeze if the moment is genuinely inside the clip's lead-in. Freezing
  // on the first frame of the clip reads as a stutter, not a title.
  if (freezeAt > clip.startSeconds + 0.2 && freezeAt < snapSeconds) {
    const at = nearest(frames, freezeAt);
    if (at !== null && at.player !== null) {
      const box = padBox(at.player, o.markerPadding);
      freeze = {
        atSeconds: freezeAt,
        holdSeconds: o.freezeHoldSeconds,
        headline: `#${subject.number} ${subject.name.toUpperCase()}`,
        subhead: subject.team,
        marker: { frame: at.frame, style: markerStyle, box, opacity: 1 },
        label: labelFor(at.player, at.ball, `#${subject.number} ${subject.name}`),
      };
    }
  }

  // --- Tracking markers ----------------------------------------------------
  const markerEnd = snapSeconds + o.markerSeconds;
  const markers: SpotlightMarker[] = [];
  for (const f of frames) {
    if (f.player === null) continue;
    if (f.seconds < snapSeconds - o.fadeSeconds || f.seconds > markerEnd) continue;
    markers.push({
      frame: f.frame,
      style: markerStyle,
      box: padBox(f.player, o.markerPadding),
      opacity: fadeOpacity(
        f.seconds,
        snapSeconds - o.fadeSeconds,
        markerEnd,
        o.fadeSeconds,
      ),
    });
  }

  return { style: o.style, freeze, markers };
}

/**
 * Put the label on the side of the athlete the football is NOT on.
 *
 * This is the whole "do not obscure the play" rule, implemented. When the ball
 * is unknown the label goes above the player, where there is sky on a sideline
 * camera and nothing worth seeing on an end-zone one.
 */
export function labelFor(
  player: BoundingBox,
  ball: BoundingBox | null,
  text: string,
): SpotlightLabel {
  const p = boxCenter(player);
  if (ball === null) {
    return { text, anchor: { x: p.x, y: Math.max(0, player.y - 0.04) }, side: "above" };
  }
  const b = boxCenter(ball);
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const side = dx >= 0 ? "left" : "right";
    const x =
      side === "left"
        ? Math.max(0, player.x - 0.02)
        : Math.min(1, player.x + player.w + 0.02);
    return { text, anchor: { x, y: p.y }, side };
  }
  const side = dy >= 0 ? "above" : "below";
  const y =
    side === "above"
      ? Math.max(0, player.y - 0.04)
      : Math.min(1, player.y + player.h + 0.04);
  return { text, anchor: { x: p.x, y }, side };
}

function padBox(box: BoundingBox, padding: number): BoundingBox {
  const px = box.w * padding;
  const py = box.h * padding;
  return { x: box.x - px, y: box.y - py, w: box.w + px * 2, h: box.h + py * 2 };
}

function fadeOpacity(t: number, start: number, end: number, fade: number): number {
  if (fade <= 0) return 1;
  const inOpacity = Math.min(1, Math.max(0, (t - start) / fade));
  const outOpacity = Math.min(1, Math.max(0, (end - t) / fade));
  return Math.min(1, Math.max(0, Math.min(inOpacity, outOpacity)));
}

function nearest(
  frames: readonly SpotlightInput[],
  seconds: number,
): SpotlightInput | null {
  let best: SpotlightInput | null = null;
  let bestD = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.seconds - seconds);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}
