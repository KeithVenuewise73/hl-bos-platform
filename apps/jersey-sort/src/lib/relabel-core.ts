/**
 * Spotting where one game ends and the next begins, from when photos were taken.
 * A long quiet gap between two photos usually means a different game. This only
 * SUGGESTS the split; a person chooses which photos go where. Pure.
 */

export interface Timed {
  readonly id: string;
  /** Local time like 2026-10-24T18:05:00 (as stored). */
  readonly capturedAt: string;
}

/** A pause this long between photos is suggested as a break between games. */
export const GAP_MINUTES = 30;

const ms = (t: string): number => {
  const v = Date.parse(t);
  return Number.isNaN(v) ? 0 : v;
};

/**
 * Photos in time order, cut into runs wherever the quiet gap is at least
 * `gapMinutes`. The input need not be sorted.
 */
export function clusterByGap<T extends Timed>(
  photos: readonly T[],
  gapMinutes = GAP_MINUTES,
): T[][] {
  const sorted = [...photos].sort(
    (a, b) => ms(a.capturedAt) - ms(b.capturedAt) || a.id.localeCompare(b.id),
  );
  const runs: T[][] = [];
  for (const p of sorted) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && ms(p.capturedAt) - ms(prev.capturedAt) < gapMinutes * 60_000) {
      last.push(p);
    } else runs.push([p]);
  }
  return runs;
}
