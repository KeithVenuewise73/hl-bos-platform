/**
 * Small number helpers for the loudness and motion series. Pure.
 *
 * Both cameras hear and see the same game but at different strengths, so each
 * series is turned into "how unusual is this moment for THIS camera" before
 * anything is compared. The median and the median absolute deviation are used,
 * not the mean and standard deviation, because a game is mostly quiet with a few
 * loud moments, and those loud moments must not hide themselves by raising the
 * average.
 */

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The value below which `fraction` (0..1) of the values fall. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(fraction * (s.length - 1))));
  return s[i]!;
}

/**
 * How many "typical wobbles" above normal each point is, never below 0.
 *
 * Two cases need care. A series that is flat apart from a few spikes (a camera
 * on a tripod watching a still rink, then a rush) has a typical wobble of
 * almost nothing, so the usual measure would call everything a wild outlier or,
 * if it divided by zero, nothing at all. The wobble is therefore never allowed
 * to be smaller than a twentieth of the distance to the highest point.
 * `minSpread` says how far the highest point must rise above normal for there
 * to be any action at all (in the series' own units): below it, noise is noise
 * and every point scores 0.
 */
export function robustScores(values: readonly number[], minSpread = 0): number[] {
  if (values.length === 0) return [];
  const mid = median(values);
  let top = -Infinity;
  for (const v of values) top = Math.max(top, v);
  if (top - mid < Math.max(minSpread, 1e-9)) return values.map(() => 0);
  const mad = median(values.map((v) => Math.abs(v - mid)));
  const scale = Math.max(mad * 1.4826, (top - mid) / 20);
  return values.map((v) => Math.max(0, (v - mid) / scale));
}

/** The largest value in each block of `size` points: a short loud peak must survive shrinking. */
export function shrinkByMax(values: readonly number[], size: number): number[] {
  if (size <= 1) return [...values];
  const out: number[] = [];
  for (let i = 0; i < values.length; i += size) {
    let m = -Infinity;
    for (let j = i; j < Math.min(values.length, i + size); j += 1)
      m = Math.max(m, values[j]!);
    out.push(m);
  }
  return out;
}

/** Remove the slow background (crowd, wind) so only quick changes are left: x minus its own moving average. */
export function removeSlowTrend(
  values: readonly number[],
  windowPoints: number,
): number[] {
  const n = values.length;
  const half = Math.max(1, windowPoints >> 1);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i]! + values[i]!;
  return values.map((v, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    return v - (prefix[hi]! - prefix[lo]!) / (hi - lo);
  });
}
