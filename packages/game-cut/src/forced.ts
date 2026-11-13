/**
 * Moments a person is sure about, slotted into a plan that already exists. Pure.
 *
 * Planning a long game takes the better part of an hour. When one moment was
 * missed (a hit by a particular player), the answer is not to plan again: it is
 * to say "this moment matters" and have it put in, from the camera nearer to it,
 * over whatever the plan had there, including time the plan had cut out.
 */

import type { Moment } from "./moments.ts";

/** Which video's clock a person's time was read from. */
export type ClockBasis = "first" | "second" | "finished";

export interface ClockContext {
  /** B started this many seconds after A (negative: before). Game time is A's clock. */
  readonly offsetSeconds: number;
  /** The pieces of the finished video the person watched, in order. */
  readonly moments: readonly Moment[];
}

/**
 * A time read off one of three players, as seconds on the game timeline (the first
 * video's clock). Null when the time is past the end of what it was read from.
 *
 *   first     the first video's own clock: already game time
 *   second    the second video's own clock: B time + offset = game time
 *   finished  the finished video: only the pieces are in it, so walk the pieces
 */
export function toGameSeconds(
  seconds: number,
  basis: ClockBasis,
  ctx: ClockContext,
): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (basis === "first") return seconds;
  if (basis === "second") return seconds + ctx.offsetSeconds;
  let passed = 0;
  for (const m of ctx.moments) {
    const length = m.endSeconds - m.startSeconds;
    if (seconds < passed + length) return m.startSeconds + (seconds - passed);
    passed += length;
  }
  return null;
}

/** Slivers shorter than this are dropped when a forced moment is cut out of a piece. */
const MIN_KEEP_SECONDS = 1;
const EPS = 1e-6;

/**
 * `forced` pieces replace whatever the plan had over the same stretch. What is left of the
 * plan's pieces is trimmed around them (each keeping the right place in its own file),
 * slivers under a second are dropped, and neighbours that are really one continuous
 * stretch of one camera are joined again. The result is in game order.
 */
export function applyForced(
  moments: readonly Moment[],
  forced: readonly Moment[],
): Moment[] {
  const cuts = [...forced]
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((f) => [f.startSeconds, f.endSeconds] as const);

  const kept: Moment[] = [];
  for (const m of moments) {
    let from = m.startSeconds;
    const pieces: [number, number][] = [];
    for (const [cs, ce] of cuts) {
      if (ce <= from + EPS || cs >= m.endSeconds - EPS) continue;
      if (cs > from) pieces.push([from, Math.min(cs, m.endSeconds)]);
      from = Math.max(from, ce);
      if (from >= m.endSeconds - EPS) break;
    }
    if (from < m.endSeconds - EPS) pieces.push([from, m.endSeconds]);
    for (const [s, e] of pieces) {
      if (e - s < MIN_KEEP_SECONDS) continue;
      kept.push({
        ...m,
        startSeconds: s,
        endSeconds: e,
        clipStartSeconds: m.clipStartSeconds + (s - m.startSeconds),
      });
    }
  }

  const all = [...kept, ...forced].sort((a, b) => a.startSeconds - b.startSeconds);
  const out: Moment[] = [];
  for (const m of all) {
    const last = out[out.length - 1];
    const contiguous =
      last !== undefined &&
      last.camera === m.camera &&
      Math.abs(last.endSeconds - m.startSeconds) < EPS &&
      Math.abs(
        last.clipStartSeconds +
          (last.endSeconds - last.startSeconds) -
          m.clipStartSeconds,
      ) < EPS &&
      last.label === undefined &&
      m.label === undefined;
    if (contiguous && last !== undefined) {
      out[out.length - 1] = {
        ...last,
        endSeconds: m.endSeconds,
        peak: Math.max(last.peak, m.peak),
      };
    } else {
      out.push(m);
    }
  }
  return out;
}
