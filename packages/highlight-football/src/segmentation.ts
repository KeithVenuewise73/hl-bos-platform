/**
 * Play segmentation and snap detection (brief sections 10 and 11).
 *
 * A football game video is mostly nothing. Two hours of file contains maybe
 * twelve minutes of football, in roughly 120 bursts of five to eight seconds
 * separated by huddles, substitutions and officials moving the chains. Finding
 * those bursts is the single highest-leverage thing this engine does: every
 * later stage is scoped to a play, and a clip that starts in the wrong place
 * is useless no matter how good the tracking was.
 *
 * NO SCOREBOARD OCR. The brief is explicit that basic operation must not
 * require it, and it is right to be: a youth game filmed on a phone has no
 * scoreboard in frame, and a Veo camera crops it out. Segmentation here runs on
 * motion alone, with the scoreboard-derived fields (quarter, down, distance)
 * left null rather than guessed.
 *
 * CAMERA MOTION IS SUBTRACTED, NOT IGNORED (section 8). A sideline operator
 * panning to follow a huddle produces a large global motion signal while
 * nothing is happening. Feeding that in raw makes the segmenter call the pan a
 * play. The worker estimates global camera motion per frame and this module
 * works on the residual — what moved that the camera did not.
 *
 * ADAPTIVE, NOT FIXED, THRESHOLDS. The absolute magnitude of "motion" depends
 * entirely on camera distance: an end-zone camera at 60 yards produces a tenth
 * of the pixel motion of a phone on the sideline. A constant threshold would
 * have to be retuned per camera type, so thresholds are derived from each
 * video's own distribution using the median and MAD, which are robust to the
 * long tail that the plays themselves create.
 */

import type { Play, VideoTimestamp } from "./types";
import { timestamp } from "./types";

/** One frame's worth of aggregate signal, produced by the vision worker. */
export interface FrameSignal {
  readonly frame: number;
  /** Total player displacement this frame, normalised screen units. */
  readonly motion: number;
  /** Estimated global camera motion, same units. Subtracted from `motion`. */
  readonly cameraMotion?: number;
  /** Spread of players across the frame. Collapses in a huddle. */
  readonly dispersion?: number;
  readonly playerCount?: number;
  /** Normalised audio energy, when the file has usable audio. */
  readonly audio?: number;
}

export interface SegmentationOptions {
  readonly frameRate: number;
  /** Shortest thing that can be a play. Below this it is a substitution. */
  readonly minPlaySeconds?: number;
  /** Longest single play before we assume the segmenter ran on. */
  readonly maxPlaySeconds?: number;
  /** Quiet time required to declare a play over. */
  readonly minDeadSeconds?: number;
  /** Smoothing window. Long enough to reject a single blurred frame. */
  readonly smoothingSeconds?: number;
  /** Multiples of MAD above the median at which motion counts as live. */
  readonly enterSigma?: number;
  /** Lower bar for STAYING live; the hysteresis that stops flicker. */
  readonly exitSigma?: number;
  /** How far before the live burst to look for the snap. */
  readonly snapSearchSeconds?: number;
}

const SEG_DEFAULTS: Required<Omit<SegmentationOptions, "frameRate">> = {
  minPlaySeconds: 1.6,
  maxPlaySeconds: 22,
  minDeadSeconds: 1.2,
  smoothingSeconds: 0.3,
  enterSigma: 2.2,
  exitSigma: 1.0,
  snapSearchSeconds: 1.5,
};

/** Median. Used instead of the mean because plays are the outliers we are
 *  hunting, and they would drag a mean up into the thing it is measuring. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid] ?? 0;
  return ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Median absolute deviation: a spread estimate the plays cannot inflate. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** Centred moving average. Edges shrink the window rather than padding with
 *  zeros, which would invent a quiet period at the start of every video. */
export function smooth(values: readonly number[], window: number): number[] {
  const w = Math.max(1, Math.floor(window));
  const half = Math.floor(w / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j] ?? 0;
    out.push(sum / (hi - lo + 1));
  }
  return out;
}

export interface SnapEstimate {
  readonly at: VideoTimestamp | null;
  readonly confidence: number;
  readonly basis: readonly string[];
}

export interface SegmentationResult {
  readonly plays: readonly Play[];
  /** Per-video thresholds actually used. Surfaced in the admin debug view so a
   *  bad segmentation can be diagnosed instead of guessed at. */
  readonly thresholds: {
    readonly enter: number;
    readonly exit: number;
    readonly baseline: number;
  };
}

/**
 * Split a game into plays.
 *
 * Every play carries its own `segmentationConfidence`, derived from how far the
 * burst stood out from the surrounding quiet. A play detected during a noisy
 * camera pan scores low and the UI can mark it for review rather than presenting
 * it with the same authority as an obvious one.
 */
export function segmentPlays(
  signals: readonly FrameSignal[],
  opts: SegmentationOptions,
): SegmentationResult {
  const o = { ...SEG_DEFAULTS, ...opts };
  const fps = opts.frameRate;
  const empty: SegmentationResult = {
    plays: [],
    thresholds: { enter: 0, exit: 0, baseline: 0 },
  };
  if (signals.length === 0 || fps <= 0) return empty;

  // Residual motion: what moved beyond the camera's own movement.
  const residual = signals.map((s) => Math.max(0, s.motion - (s.cameraMotion ?? 0)));
  const smoothed = smooth(residual, Math.max(1, Math.round(o.smoothingSeconds * fps)));

  const baseline = median(smoothed);
  const spread = mad(smoothed);
  // MAD is zero on perfectly flat synthetic input; fall back to a fraction of
  // the baseline so the thresholds stay ordered instead of collapsing together.
  const scale = spread > 1e-9 ? spread : Math.max(baseline * 0.1, 1e-6);
  const enter = baseline + o.enterSigma * scale;
  const exit = baseline + o.exitSigma * scale;

  const minPlayFrames = Math.max(1, Math.round(o.minPlaySeconds * fps));
  const maxPlayFrames = Math.max(minPlayFrames, Math.round(o.maxPlaySeconds * fps));
  const minDeadFrames = Math.max(1, Math.round(o.minDeadSeconds * fps));

  // --- Hysteresis scan ------------------------------------------------------
  const bursts: Array<{ start: number; end: number }> = [];
  let live = false;
  let start = 0;
  let quiet = 0;
  for (let i = 0; i < smoothed.length; i++) {
    const v = smoothed[i] ?? 0;
    if (!live) {
      if (v >= enter) {
        live = true;
        start = i;
        quiet = 0;
      }
      continue;
    }
    if (v < exit) {
      quiet += 1;
      if (quiet >= minDeadFrames) {
        bursts.push({ start, end: i - quiet });
        live = false;
        quiet = 0;
      }
    } else {
      quiet = 0;
    }
    // A burst that runs past the longest plausible play means the segmenter
    // has merged a play with the scramble after it, or with a camera move.
    // Close it at the cap rather than emitting a 90-second "play".
    if (live && i - start >= maxPlayFrames) {
      bursts.push({ start, end: i });
      live = false;
      quiet = 0;
    }
  }
  if (live) bursts.push({ start, end: smoothed.length - 1 });

  const plays: Play[] = [];
  let index = 0;
  for (const burst of bursts) {
    if (burst.end - burst.start + 1 < minPlayFrames) continue;

    const startFrame = signals[burst.start]?.frame ?? burst.start;
    const endFrame = signals[burst.end]?.frame ?? burst.end;

    const snap = detectSnap(signals, smoothed, burst.start, o.snapSearchSeconds, fps);

    // Contrast between the burst and the quiet either side of it. This is the
    // honest measure of "did we really find a play", and it is what the review
    // flag keys off.
    const inPlay = smoothed.slice(burst.start, burst.end + 1);
    const contextLo = Math.max(0, burst.start - minDeadFrames);
    const contextHi = Math.min(smoothed.length - 1, burst.end + minDeadFrames);
    const around = [
      ...smoothed.slice(contextLo, burst.start),
      ...smoothed.slice(burst.end + 1, contextHi + 1),
    ];
    const inMean = inPlay.reduce((a, b) => a + b, 0) / Math.max(inPlay.length, 1);
    const outMean =
      around.length > 0 ? around.reduce((a, b) => a + b, 0) / around.length : baseline;
    const contrast = outMean > 1e-9 ? (inMean - outMean) / outMean : inMean > 0 ? 3 : 0;
    const segmentationConfidence = Math.min(1, Math.max(0, contrast / 3));

    plays.push({
      playId: `play-${index + 1}`,
      index,
      startAt: timestamp(startFrame, fps),
      snapAt: snap.at,
      snapConfidence: snap.at === null ? null : snap.confidence,
      endAt: timestamp(endFrame, fps),
      // Left null deliberately. Which side has the ball is decided later, from
      // possession, and inventing it here would be inventing football.
      offenseTeamId: null,
      defenseTeamId: null,
      quarter: null,
      down: null,
      distance: null,
      segmentationConfidence,
    });
    index += 1;
  }

  return { plays, thresholds: { enter, exit, baseline } };
}

/**
 * Locate the snap inside and just before a burst of motion.
 *
 * The snap is not the moment motion is highest — that is the collision three
 * seconds later. It is the moment motion STARTS: twenty-two people who were
 * standing still all move within a few frames of each other. So the detector
 * looks for the sharpest positive acceleration, not the peak.
 *
 * An audio spike, when the file has usable audio, corroborates but never
 * decides: crowd noise and wind produce spikes too.
 */
export function detectSnap(
  signals: readonly FrameSignal[],
  smoothed: readonly number[],
  burstStart: number,
  searchSeconds: number,
  frameRate: number,
): SnapEstimate {
  const back = Math.max(1, Math.round(searchSeconds * frameRate));
  const lo = Math.max(1, burstStart - back);
  const hi = Math.min(smoothed.length - 1, burstStart + back);
  if (hi <= lo) return { at: null, confidence: 0, basis: [] };

  let bestIdx = -1;
  let bestAccel = 0;
  for (let i = lo; i <= hi; i++) {
    const accel = (smoothed[i] ?? 0) - (smoothed[i - 1] ?? 0);
    if (accel > bestAccel) {
      bestAccel = accel;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return { at: null, confidence: 0, basis: [] };

  // Scale the onset against the typical frame-to-frame change in this window,
  // so "sharp" means sharp for THIS camera rather than sharp in the abstract.
  const deltas: number[] = [];
  for (let i = lo; i <= hi; i++)
    deltas.push(Math.abs((smoothed[i] ?? 0) - (smoothed[i - 1] ?? 0)));
  const typical = median(deltas);
  const sharpness = typical > 1e-9 ? bestAccel / (typical * 4) : 1;

  const basis: string[] = ["synchronised motion onset"];
  let confidence = Math.min(0.92, Math.max(0, sharpness));

  // Audio corroboration: a genuine snap is often audible (cadence, pads).
  const audioWindow = signals
    .slice(Math.max(0, bestIdx - 3), bestIdx + 4)
    .map((s) => s.audio)
    .filter((a): a is number => a !== undefined);
  if (audioWindow.length > 0) {
    const allAudio = signals
      .map((s) => s.audio)
      .filter((a): a is number => a !== undefined);
    const audioBaseline = median(allAudio);
    const audioSpread = mad(allAudio);
    const peak = Math.max(...audioWindow);
    if (audioSpread > 1e-9 && peak > audioBaseline + 2 * audioSpread) {
      basis.push("audio spike");
      confidence = Math.min(0.97, confidence + 0.15);
    }
  }

  // The offensive line breaking its stance together is the visual signature of
  // a snap; dispersion rising off a low, stable value corroborates it.
  const dispersion = signals
    .map((s) => s.dispersion)
    .filter((d): d is number => d !== undefined);
  if (dispersion.length === signals.length && bestIdx >= 2) {
    const before = dispersion[bestIdx - 2] ?? 0;
    const after = dispersion[Math.min(dispersion.length - 1, bestIdx + 4)] ?? 0;
    if (after > before * 1.15) {
      basis.push("formation breaking");
      confidence = Math.min(0.97, confidence + 0.08);
    }
  }

  const frame = signals[bestIdx]?.frame ?? bestIdx;
  return { at: timestamp(frame, frameRate), confidence, basis };
}
