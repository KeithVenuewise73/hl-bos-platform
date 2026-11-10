/**
 * Lining up two cameras. Pure.
 *
 * Two phones filmed the same game and were started at slightly different
 * moments. Both heard the same whistles, horns and crowd, so how loud each one
 * was, moment to moment, rises and falls in the same pattern. Sliding one
 * pattern along the other until they best match gives the difference in start
 * times to a fraction of a second.
 *
 * Convention used everywhere: the GAME TIMELINE is camera A's own clock.
 * `offsetSeconds` is how many seconds after A started that B started, so B's
 * clock reads (game time - offset). A negative offset means B started first.
 */

import { removeSlowTrend } from "./series.ts";

export interface SyncResult {
  /** B started this many seconds after A (negative: before). */
  readonly offsetSeconds: number;
  /** 0..1: how clearly one alignment beats the rest. Below about 0.3, do not trust it. */
  readonly confidence: number;
}

function zNormalize(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;
  let ss = 0;
  for (const v of values) ss += (v - mean) ** 2;
  const sd = Math.sqrt(ss / n) || 1;
  return values.map((v) => (v - mean) / sd);
}

/**
 * @param loudnessA, loudnessB  loudness per step (dB or any monotone unit), starting at each camera's own time 0
 * @param stepSeconds           seconds between points (both series use the same step)
 * @param centerSeconds         the best guess of B's start after A's (from the files' own timestamps), or 0
 * @param searchSeconds         how far either side of the guess to look
 */
export function findOffset(
  loudnessA: readonly number[],
  loudnessB: readonly number[],
  stepSeconds: number,
  centerSeconds: number,
  searchSeconds: number,
): SyncResult {
  // Quick changes only: whistles, hits, cheers. The steady crowd hum matches
  // everywhere and would make every alignment look alike.
  const trendWindow = Math.round(20 / stepSeconds);
  const a = zNormalize(removeSlowTrend(loudnessA, trendWindow));
  const b = zNormalize(removeSlowTrend(loudnessB, trendWindow));
  const center = Math.round(centerSeconds / stepSeconds);
  const reach = Math.round(searchSeconds / stepSeconds);

  const scores: { lag: number; score: number }[] = [];
  for (let lag = center - reach; lag <= center + reach; lag += 1) {
    // B at its time j is the game at j + lag, which is A's time i = j + lag.
    let sum = 0;
    let count = 0;
    const jStart = Math.max(0, -lag);
    const jEnd = Math.min(b.length, a.length - lag);
    for (let j = jStart; j < jEnd; j += 1) {
      sum += a[j + lag]! * b[j]!;
      count += 1;
    }
    // Needs a real overlap, or two short tails will "match" by luck.
    if (count < Math.min(a.length, b.length) * 0.3) continue;
    // Divided by the length of the whole recording, not by the overlap: a small
    // overlap then scores proportionally lower, and cannot beat a full one by luck.
    scores.push({ lag, score: sum / Math.min(a.length, b.length) });
  }
  if (scores.length === 0) return { offsetSeconds: centerSeconds, confidence: 0 };

  let best = scores[0]!;
  for (const s of scores) if (s.score > best.score) best = s;
  // The best DIFFERENT alignment (more than 2 s away, so the same peak does not count twice).
  let second = 0;
  for (const s of scores) {
    if (Math.abs(s.lag - best.lag) > Math.round(2 / stepSeconds))
      second = Math.max(second, s.score);
  }
  // Sure when the best clearly beats every rival, and is a real match at all.
  const clearly = best.score > 0 ? (best.score - second) / best.score : 0;
  const real = Math.min(1, Math.max(0, best.score) / 0.1);
  const confidence = Math.max(0, Math.min(1, clearly)) * real;
  return { offsetSeconds: best.lag * stepSeconds, confidence };
}
