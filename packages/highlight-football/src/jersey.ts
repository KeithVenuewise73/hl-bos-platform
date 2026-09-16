/**
 * Jersey number recognition over time (brief section 5).
 *
 * THE CENTRAL CLAIM OF THIS FILE: a football jersey number is unreadable in
 * most frames. The player is facing away, in a pile, blurred, behind a lineman,
 * or the camera zoomed. Any design that needs the number on the current frame
 * to know who it is looking at will lose the athlete several times per play.
 *
 * So the number is never read from a frame. It is VOTED on across a track, and
 * frames that could not read it abstain rather than vote "unknown". The brief's
 * worked example — .81, unreadable, .92, unreadable — must stay #23, and
 * `temporalVote` is the function that makes that true. There is a test named
 * after that exact example.
 *
 * Two things this deliberately does NOT do:
 *
 *   * It does not treat an abstention as evidence against the leader. A player
 *     with his back turned for 40 frames is not 40 frames of doubt.
 *   * It does not let an old reading outrank a fresh one forever. Support
 *     decays with time, so a genuine identity change (the tracker latched onto
 *     the wrong body) can eventually overcome the history instead of being
 *     locked out by it.
 */

import type { VideoTimestamp } from "./types";

/** One attempt to read a number in one frame. `number: null` = unreadable. */
export interface JerseyObservation {
  readonly at: VideoTimestamp;
  readonly number: number | null;
  /** The recogniser's confidence in that reading. Ignored when number is null. */
  readonly confidence: number;
  /** Where on the uniform it was read. Backs are larger and more reliable. */
  readonly surface?: "back" | "front" | "shoulder";
}

export interface TemporalVoteOptions {
  /**
   * Seconds after which a reading's support has halved. 6s spans roughly one
   * football play, so a number established at the snap still carries real
   * weight at the whistle, and a number from three plays ago does not.
   */
  readonly halfLifeSeconds?: number;
  /** Ignore readings below this confidence entirely. */
  readonly minObservationConfidence?: number;
  /**
   * The leader must hold at least this share of total support to be returned.
   * Below it, the honest answer is null.
   *
   * 0.6, not 0.5. A bare majority between two candidates is what a 50.5/49.5
   * split looks like, and that is not knowledge — it is a coin landing. The
   * first version of this file used 0.5 and a test with four alternating
   * readings of #23 and #28 came back "definitely #28" at 50.5%, which is
   * exactly the confident-wrong-answer this system must not produce.
   */
  readonly minShare?: number;
  /** Absolute support floor, so a single weak reading cannot carry a decision. */
  readonly minSupport?: number;
  /** Multiplier per surface. A back number is the reliable one. */
  readonly surfaceWeights?: Readonly<Record<"back" | "front" | "shoulder", number>>;
  /** Vote as of this moment. Defaults to the latest observation. */
  readonly asOfSeconds?: number;
}

const VOTE_DEFAULTS: Required<Omit<TemporalVoteOptions, "asOfSeconds">> = {
  halfLifeSeconds: 6,
  minObservationConfidence: 0.35,
  minShare: 0.6,
  minSupport: 0.6,
  surfaceWeights: { back: 1.0, front: 0.9, shoulder: 0.6 },
};

export interface JerseyVote {
  /** null means "we do not know", which is a legitimate and common answer. */
  readonly number: number | null;
  readonly confidence: number;
  /** Every candidate with its share, best first. Feeds the debug view. */
  readonly distribution: ReadonlyArray<{
    number: number | "unknown";
    confidence: number;
  }>;
  readonly supportingFrames: number;
  /** Frames that tried and failed to read a number. Context, not evidence. */
  readonly abstainingFrames: number;
}

const EMPTY_VOTE: JerseyVote = {
  number: null,
  confidence: 0,
  distribution: [],
  supportingFrames: 0,
  abstainingFrames: 0,
};

/**
 * Decide a track's jersey number from every reading attempted on it.
 *
 * The returned `confidence` is the leader's share of total support, so it
 * behaves the way a human expects: two evenly-matched candidates report ~0.5
 * each and the caller can route the track to REVIEW REQUIRED instead of
 * guessing.
 */
export function temporalVote(
  observations: readonly JerseyObservation[],
  opts: TemporalVoteOptions = {},
): JerseyVote {
  const o = { ...VOTE_DEFAULTS, ...opts };
  if (observations.length === 0) return EMPTY_VOTE;

  const latest = Math.max(...observations.map((x) => x.at.seconds));
  const asOf = opts.asOfSeconds ?? latest;
  const decay = Math.log(2) / Math.max(o.halfLifeSeconds, 1e-6);

  const support = new Map<number, number>();
  let supporting = 0;
  let abstaining = 0;

  for (const obs of observations) {
    if (obs.number === null) {
      // An unreadable frame is an ABSTENTION. It is recorded so the UI can say
      // "readable in 9 of 61 frames", but it does not reduce anyone's support.
      abstaining += 1;
      continue;
    }
    if (obs.confidence < o.minObservationConfidence) {
      abstaining += 1;
      continue;
    }
    // ABSOLUTE distance, so a vote taken "as of" an earlier moment is not
    // dominated by evidence recorded a minute later. Under the default asOf
    // (the latest observation) nothing is in the future, so this is identical
    // to a one-sided decay for the normal case.
    const age = Math.abs(asOf - obs.at.seconds);
    const surface = o.surfaceWeights[obs.surface ?? "back"];
    const w = obs.confidence * surface * Math.exp(-decay * age);
    support.set(obs.number, (support.get(obs.number) ?? 0) + w);
    supporting += 1;
  }

  if (support.size === 0) {
    return { ...EMPTY_VOTE, abstainingFrames: abstaining };
  }

  const total = [...support.values()].reduce((a, b) => a + b, 0);
  // Sorted by support, best first. `number` is widened to the public
  // `number | "unknown"` shape at the boundary only; the leader is read from
  // `ranked` below, which keeps its concrete numeric key.
  const ranked = [...support.entries()]
    .map(([number, w]) => ({ number, confidence: w / total }))
    .sort((a, b) => b.confidence - a.confidence);
  const distribution: JerseyVote["distribution"] = ranked;

  const leader = ranked[0];
  /* c8 ignore next */
  if (leader === undefined) return { ...EMPTY_VOTE, abstainingFrames: abstaining };

  const leaderSupport = support.get(leader.number) ?? 0;
  const decided = leader.confidence >= o.minShare && leaderSupport >= o.minSupport;

  return {
    number: decided ? leader.number : null,
    confidence: leader.confidence,
    distribution,
    supportingFrames: supporting,
    abstainingFrames: abstaining,
  };
}

/**
 * How well a voted number matches the number the user asked for.
 *
 * Not a boolean, because the common failure is not "wrong", it is "close".
 * A recogniser that reads 23 as 28 is making a specific, structural mistake —
 * the digits are visually similar — and the caller needs to know the difference
 * between "definitely not him" and "this is the confusable one".
 */
export interface NumberMatch {
  readonly matches: boolean;
  readonly confidence: number;
  /** True when the observed number is one of the classic OCR confusions. */
  readonly confusable: boolean;
}

/**
 * Digit pairs that football OCR genuinely confuses: shared strokes, and on a
 * stretched or folded jersey the distinguishing stroke is the one that
 * disappears. Derived from digit shape, not from a model's error log, and
 * stated here so it can be argued with.
 */
const CONFUSABLE_DIGITS: Readonly<Record<string, readonly string[]>> = {
  "0": ["8", "6", "9"],
  "1": ["7", "4"],
  "2": ["7"],
  "3": ["8", "9"],
  "4": ["1", "9"],
  "5": ["6", "8"],
  "6": ["5", "8", "0"],
  "7": ["1", "2"],
  "8": ["0", "3", "6", "5"],
  "9": ["4", "3", "0"],
};

function digitsConfusable(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    /* c8 ignore next */
    if (ca === undefined || cb === undefined) return false;
    if (ca === cb) continue;
    differences += 1;
    if (differences > 1) return false;
    if (!(CONFUSABLE_DIGITS[ca] ?? []).includes(cb)) return false;
  }
  return differences === 1;
}

export function matchNumber(vote: JerseyVote, target: number): NumberMatch {
  if (vote.number === null) {
    return { matches: false, confidence: 0, confusable: false };
  }
  if (vote.number === target) {
    return { matches: true, confidence: vote.confidence, confusable: false };
  }
  // Compare as written on the jersey: "7" and "07" are the same number but
  // different glyph counts, so pad both to the longer form before comparing.
  const a = String(vote.number);
  const b = String(target);
  const width = Math.max(a.length, b.length);
  const confusable = digitsConfusable(a.padStart(width, "0"), b.padStart(width, "0"));
  return { matches: false, confidence: 0, confusable };
}

/** Numbers a football player may wear. 00 is modelled by Player.doubleZero. */
export function isValidJerseyNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 99;
}
