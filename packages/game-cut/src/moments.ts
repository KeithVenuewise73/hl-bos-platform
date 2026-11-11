/**
 * Choosing the action. Pure.
 *
 * Input: for each camera, a score per half second saying how unusual that
 * moment was (loud, or lots of movement). Output: the stretches of the game to
 * keep, each with the camera that saw it best. Everything not chosen is left
 * out: warm-ups, breaks, quiet stretches.
 */

export interface CameraScores {
  /** Score per step, starting at this camera's own time 0. */
  readonly scores: readonly number[];
  /** Seconds of video this camera has. */
  readonly durationSeconds: number;
}

export interface MomentOptions {
  readonly stepSeconds: number;
  /** B started this many seconds after A (the game timeline is A's clock). */
  readonly offsetSeconds: number;
  /** Seconds kept before and after the peak of each moment. */
  readonly beforeSeconds: number;
  readonly afterSeconds: number;
  /** Moments closer together than this are joined into one. */
  readonly joinGapSeconds: number;
  /** A moment shorter than this is dropped. */
  readonly minSeconds: number;
  /** A joined stretch is not allowed to grow past this. */
  readonly maxSeconds: number;
  /** The result keeps at most this fraction of the game. */
  readonly maxShare: number;
  /** Lowest score that counts as action. Raised automatically if too much would be kept. */
  readonly startThreshold: number;
}

export const DEFAULT_MOMENT_OPTIONS: MomentOptions = {
  stepSeconds: 0.5,
  offsetSeconds: 0,
  beforeSeconds: 6,
  afterSeconds: 4,
  joinGapSeconds: 3,
  minSeconds: 4,
  maxSeconds: 40,
  maxShare: 0.3,
  startThreshold: 3,
};

export interface Moment {
  /** On the game timeline (camera A's clock). */
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly camera: "A" | "B";
  /** Where to cut in that camera's own file. */
  readonly clipStartSeconds: number;
  /** The strongest score inside, for ranking and review. */
  readonly peak: number;
  readonly scoreA: number;
  readonly scoreB: number;
}

function valueAt(cam: CameraScores, clipSeconds: number, step: number): number {
  if (clipSeconds < 0 || clipSeconds >= cam.durationSeconds) return 0;
  return cam.scores[Math.floor(clipSeconds / step)] ?? 0;
}

function buildMoments(
  a: CameraScores,
  b: CameraScores,
  gameSeconds: number,
  o: MomentOptions,
  threshold: number,
): Moment[] {
  const step = o.stepSeconds;
  const points = Math.ceil(gameSeconds / step);
  const best: number[] = new Array<number>(points);
  for (let i = 0; i < points; i += 1) {
    const t = i * step;
    best[i] = Math.max(valueAt(a, t, step), valueAt(b, t - o.offsetSeconds, step));
  }

  // Seeds: every point at or above the threshold, widened a little each side.
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < points; i += 1) {
    if (best[i]! < threshold) continue;
    const t = i * step;
    const start = Math.max(0, t - o.beforeSeconds);
    const end = Math.min(gameSeconds, t + step + o.afterSeconds);
    const last = ranges[ranges.length - 1];
    if (
      last &&
      start <= last.end + o.joinGapSeconds &&
      end - last.start <= o.maxSeconds
    ) {
      last.end = Math.max(last.end, end);
    } else if (last && start <= last.end + o.joinGapSeconds) {
      // Joining would run past the cap: close the long one, start a new one.
      ranges.push({ start: Math.max(start, last.end), end: Math.max(end, last.end) });
    } else {
      ranges.push({ start, end });
    }
  }

  const out: Moment[] = [];
  for (const r of ranges) {
    if (r.end - r.start < o.minSeconds) continue;
    let sumA = 0;
    let sumB = 0;
    let peak = 0;
    let n = 0;
    for (let t = r.start; t < r.end; t += step) {
      const sa = valueAt(a, t, step);
      const sb = valueAt(b, t - o.offsetSeconds, step);
      sumA += sa;
      sumB += sb;
      peak = Math.max(peak, sa, sb);
      n += 1;
    }
    const scoreA = n === 0 ? 0 : sumA / n;
    const scoreB = n === 0 ? 0 : sumB / n;
    // Only a camera that actually has footage for the whole stretch may be chosen.
    const aCovers = r.start >= 0 && r.end <= a.durationSeconds;
    const bCovers =
      r.start - o.offsetSeconds >= 0 && r.end - o.offsetSeconds <= b.durationSeconds;
    let camera: "A" | "B" = scoreB > scoreA ? "B" : "A";
    if (camera === "A" && !aCovers && bCovers) camera = "B";
    if (camera === "B" && !bCovers && aCovers) camera = "A";
    out.push({
      startSeconds: r.start,
      endSeconds: r.end,
      camera,
      clipStartSeconds: camera === "A" ? r.start : r.start - o.offsetSeconds,
      peak,
      scoreA,
      scoreB,
    });
  }
  return out;
}

export function totalSeconds(moments: readonly Moment[]): number {
  return moments.reduce((t, m) => t + (m.endSeconds - m.startSeconds), 0);
}

/**
 * The moments to keep, in game order. If the first pass keeps more than
 * `maxShare` of the game, the bar is raised until it does not, and if raising it
 * would leave nothing, the weakest moments are dropped one by one instead. The
 * strongest moments are what survive, never an arbitrary cut-off in time, and
 * a game with any action in it never comes back empty.
 */
export function chooseMoments(
  a: CameraScores,
  b: CameraScores,
  options: Partial<MomentOptions> = {},
): { moments: Moment[]; threshold: number; gameSeconds: number } {
  const o: MomentOptions = { ...DEFAULT_MOMENT_OPTIONS, ...options };
  const gameSeconds = Math.max(a.durationSeconds, b.durationSeconds + o.offsetSeconds);
  const cap = o.maxShare * gameSeconds;
  let threshold = o.startThreshold;
  let moments = buildMoments(a, b, gameSeconds, o, threshold);
  for (let guard = 0; guard < 400 && totalSeconds(moments) > cap; guard += 1) {
    const next = buildMoments(a, b, gameSeconds, o, threshold + 0.25);
    if (next.length === 0) break; // a higher bar would leave nothing
    threshold += 0.25;
    moments = next;
  }
  if (totalSeconds(moments) > cap && moments.length > 1) {
    // Still too much even at the highest bar that keeps anything: keep the strongest.
    const byStrength = [...moments].sort((x, y) => y.peak - x.peak);
    const kept: Moment[] = [];
    let used = 0;
    for (const m of byStrength) {
      const len = m.endSeconds - m.startSeconds;
      if (kept.length > 0 && used + len > cap) continue;
      kept.push(m);
      used += len;
    }
    moments = kept.sort((x, y) => x.startSeconds - y.startSeconds);
  }
  return { moments, threshold, gameSeconds };
}

// ---------------------------------------------------------------------------
// Broadcast: the whole game, following the play from one end of the ice to the
// other.
// ---------------------------------------------------------------------------

export interface BroadcastOptions {
  readonly stepSeconds: number;
  /** B started this many seconds after A (the game timeline is A's clock). */
  readonly offsetSeconds: number;
  /** Activity is averaged over this long, so one bump does not move the picture. */
  readonly smoothSeconds: number;
  /** Once a camera is on screen it stays at least this long. */
  readonly minHoldSeconds: number;
  /** The other camera must be this much busier before the picture switches to it. */
  readonly switchMargin: number;
  /** Activity below this is "nothing happening". */
  readonly quietLevel: number;
  /** A stretch with nothing happening for this long (an intermission) is left out. */
  readonly quietCutSeconds: number;
}

export const DEFAULT_BROADCAST_OPTIONS: BroadcastOptions = {
  stepSeconds: 0.5,
  offsetSeconds: 0,
  smoothSeconds: 4,
  minHoldSeconds: 4,
  switchMargin: 1,
  quietLevel: 0.8,
  quietCutSeconds: 90,
};

function smooth(values: readonly number[], points: number): number[] {
  const n = values.length;
  const half = Math.max(0, Math.floor(points / 2));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i]! + values[i]!;
  return values.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    return (prefix[hi]! - prefix[lo]!) / (hi - lo);
  });
}

/**
 * The whole game as one video that follows the play. At every moment the
 * camera whose end of the ice is busier is on screen, holding each choice for a
 * few seconds so the picture does not jump, staying on the last camera through
 * a quiet spell, and leaving out the long dead stretches (intermissions, the
 * time before the game).
 */
export function chooseBroadcast(
  a: CameraScores,
  b: CameraScores,
  options: Partial<BroadcastOptions> = {},
): { moments: Moment[]; gameSeconds: number } {
  const o: BroadcastOptions = { ...DEFAULT_BROADCAST_OPTIONS, ...options };
  const step = o.stepSeconds;
  const gameSeconds = Math.max(a.durationSeconds, b.durationSeconds + o.offsetSeconds);
  const n = Math.ceil(gameSeconds / step);

  const rawA: number[] = [];
  const rawB: number[] = [];
  const hasA: boolean[] = [];
  const hasB: boolean[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i * step;
    hasA.push(t >= 0 && t + step <= a.durationSeconds + 1e-9);
    hasB.push(
      t - o.offsetSeconds >= 0 &&
        t - o.offsetSeconds + step <= b.durationSeconds + 1e-9,
    );
    rawA.push(valueAt(a, t, step));
    rawB.push(valueAt(b, t - o.offsetSeconds, step));
  }
  const points = Math.round(o.smoothSeconds / step);
  const zoneA = smooth(rawA, points);
  const zoneB = smooth(rawB, points);

  // Which steps are part of a long quiet spell? Those are left out.
  const quiet: boolean[] = new Array<boolean>(n).fill(false);
  const minQuiet = Math.round(o.quietCutSeconds / step);
  let runStart = -1;
  for (let i = 0; i <= n; i += 1) {
    const isQuiet = i < n && Math.max(zoneA[i]!, zoneB[i]!) < o.quietLevel;
    if (isQuiet && runStart === -1) runStart = i;
    if (!isQuiet && runStart !== -1) {
      if (i - runStart >= minQuiet)
        for (let k = runStart; k < i; k += 1) quiet[k] = true;
      runStart = -1;
    }
  }

  // Walk the game, choosing the camera for each kept step.
  const minHold = Math.round(o.minHoldSeconds / step);
  const pick: ("A" | "B" | null)[] = new Array<"A" | "B" | null>(n).fill(null);
  let current = null as "A" | "B" | null;
  let held = 0;
  for (let i = 0; i < n; i += 1) {
    if (quiet[i]) {
      current = null;
      continue;
    }
    const canA = hasA[i]!;
    const canB = hasB[i]!;
    if (!canA && !canB) {
      current = null;
      continue;
    }
    if (current === null || (current === "A" && !canA) || (current === "B" && !canB)) {
      current = !canB ? "A" : !canA ? "B" : zoneB[i]! > zoneA[i]! ? "B" : "A";
      held = 0;
    } else if (held >= minHold) {
      const onA: boolean = current === "A";
      const canOther = onA ? canB : canA;
      const mine = onA ? zoneA[i]! : zoneB[i]!;
      const theirs = onA ? zoneB[i]! : zoneA[i]!;
      if (canOther && theirs > mine + o.switchMargin) {
        current = onA ? "B" : "A";
        held = 0;
      }
    }
    pick[i] = current;
    held += 1;
  }

  // Runs of the same camera become pieces.
  const moments: Moment[] = [];
  let i = 0;
  while (i < n) {
    const cam = pick[i];
    if (cam === null || cam === undefined) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && pick[j] === cam) j += 1;
    const start = i * step;
    const end = Math.min(gameSeconds, j * step);
    if (end - start >= 1) {
      let sumA = 0;
      let sumB = 0;
      let peak = 0;
      for (let k = i; k < j; k += 1) {
        sumA += rawA[k]!;
        sumB += rawB[k]!;
        peak = Math.max(peak, rawA[k]!, rawB[k]!);
      }
      const len = j - i;
      moments.push({
        startSeconds: start,
        endSeconds: end,
        camera: cam,
        clipStartSeconds: cam === "A" ? start : start - o.offsetSeconds,
        peak,
        scoreA: sumA / len,
        scoreB: sumB / len,
      });
    }
    i = j;
  }
  return { moments, gameSeconds };
}
