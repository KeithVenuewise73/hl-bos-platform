import { ease } from "./easing";
import { cropToAspect, lerpRect } from "./geometry";
import type { Frame, FrameLayer, Rect, Storyboard } from "./types";

export interface ShotTiming {
  readonly shotId: string;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
  /** The crossfade actually used, after clamping against both neighbours. */
  readonly transitionInMs: number;
}

/**
 * Lay the shots out on a clock.
 *
 * A crossfade is an OVERLAP, not a gap: shot N+1 starts before shot N ends, so
 * the running time is the sum of the durations minus the transitions. A
 * transition is clamped so it can never be longer than either shot it joins —
 * otherwise a long fade between two short shots produces negative time.
 */
export function shotTimings(storyboard: Storyboard): ShotTiming[] {
  const timings: ShotTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < storyboard.shots.length; i += 1) {
    const shot = storyboard.shots[i];
    if (!shot) continue;
    const previous = storyboard.shots[i - 1];
    const requested = i === 0 ? 0 : Math.max(0, shot.transitionInMs);
    const transition = previous
      ? Math.min(requested, previous.durationMs, shot.durationMs)
      : 0;
    const start = i === 0 ? 0 : cursor - transition;
    timings.push({
      shotId: shot.id,
      label: shot.label,
      startMs: start,
      endMs: start + shot.durationMs,
      transitionInMs: transition,
    });
    cursor = start + shot.durationMs;
  }
  return timings;
}

export function totalDurationMs(storyboard: Storyboard): number {
  const timings = shotTimings(storyboard);
  const last = timings[timings.length - 1];
  return last ? last.endMs : 0;
}

export function frameCount(storyboard: Storyboard): number {
  return Math.max(1, Math.round((totalDurationMs(storyboard) / 1000) * storyboard.fps));
}

export function timeForFrame(index: number, fps: number): number {
  return (index * 1000) / fps;
}

/**
 * Clip a source rectangle to the image and shrink the target to match.
 *
 * The establishing shot deliberately frames wider than the artwork so the whole
 * page fits a 16:9 frame. Rather than hand the renderer a source rectangle that
 * hangs off the edge of the image and hope its drawing call does something
 * sensible, the overhang is resolved here, where it is testable.
 */
export function clipToSource(
  source: Rect,
  target: Rect,
  sourceWidth: number,
  sourceHeight: number,
): { source: Rect; target: Rect } | null {
  const left = Math.max(source.x, 0);
  const top = Math.max(source.y, 0);
  const right = Math.min(source.x + source.width, sourceWidth);
  const bottom = Math.min(source.y + source.height, sourceHeight);
  if (right <= left || bottom <= top) return null;

  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  return {
    source: { x: left, y: top, width: right - left, height: bottom - top },
    target: {
      x: target.x + (left - source.x) * scaleX,
      y: target.y + (top - source.y) * scaleY,
      width: (right - left) * scaleX,
      height: (bottom - top) * scaleY,
    },
  };
}

/**
 * Where in the output frame a piece of source artwork lands.
 *
 * `fill` uses the whole frame — the camera rectangle was already cut to the
 * frame's shape. `contain` centres the artwork at its own shape and leaves the
 * background showing on the other two sides.
 */
export function targetFor(storyboard: Storyboard, source: Rect): Rect {
  const frame: Rect = {
    x: 0,
    y: 0,
    width: storyboard.width,
    height: storyboard.height,
  };
  if (storyboard.fit === "fill") return frame;
  return cropToAspect(frame, source.width / source.height);
}

/**
 * What is on screen at `timeMs`.
 *
 * Layers come back in painter's order: the outgoing shot first at full opacity,
 * the incoming shot over it at the crossfade's alpha. Draw them in order onto
 * the background and the frame is correct.
 */
export function composeFrame(storyboard: Storyboard, timeMs: number): Frame {
  const timings = shotTimings(storyboard);
  const total = totalDurationMs(storyboard);
  const t = Math.min(Math.max(timeMs, 0), total);
  const layers: FrameLayer[] = [];

  for (let i = 0; i < timings.length; i += 1) {
    const timing = timings[i];
    const shot = storyboard.shots[i];
    if (!timing || !shot) continue;

    // The final frame belongs to the last shot, which has already ended by <.
    const isLast = i === timings.length - 1;
    const active =
      t >= timing.startMs && (t < timing.endMs || (isLast && t <= timing.endMs));
    if (!active) continue;

    const span = Math.max(1, timing.endMs - timing.startMs);
    const progress = ease(shot.easing, (t - timing.startMs) / span);
    const rect = lerpRect(shot.from, shot.to, progress);
    const opacity =
      timing.transitionInMs > 0
        ? Math.min(1, (t - timing.startMs) / timing.transitionInMs)
        : 1;

    const clipped = clipToSource(
      rect,
      targetFor(storyboard, rect),
      storyboard.sourceWidth,
      storyboard.sourceHeight,
    );
    if (!clipped) continue;

    layers.push({
      shotId: shot.id,
      source: clipped.source,
      target: clipped.target,
      opacity,
      caption: shot.caption,
    });
  }

  return { timeMs: t, layers };
}
