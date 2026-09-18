/**
 * Find My Player.
 *
 * This file answers the one question the product exists to answer: given a
 * track of *someone* skating, is that someone the athlete we were asked to
 * find? It is the highest-stakes judgement in the system and the easiest place
 * to lie, so three rules constrain it:
 *
 *  1. **Evidence in, evidence out.** Every segment reports the agreement
 *     figures that produced its confidence. A number with no derivation cannot
 *     be argued with, and a user who cannot argue with it will either trust it
 *     too much or ignore it entirely.
 *
 *  2. **Weak signals cannot add up to certainty.** Colour alone never reaches
 *     `confirmed`, no matter how many frames agree, because a thousand frames
 *     of "dark jersey in a dark rink" is one weak observation repeated. Only a
 *     jersey number — the one signal that is actually unique in a game — opens
 *     the top band.
 *
 *  3. **Absence is reported, not filled in.** No reference photo means
 *     `photoSimilarity: null` and a redistribution of weight, never a default
 *     of 0.5 standing in for a measurement nobody made.
 */

import {
  colorReliability,
  isLikelyOcrConfusion,
  jerseyNumbersMatch,
  normaliseJerseyNumber,
} from "./jersey.ts";
import type {
  Athlete,
  ConfidenceBand,
  IdentityEvidence,
  Observation,
  PlayerSegment,
  PlayerTrack,
  Position,
} from "./types.ts";

/**
 * Where the bands sit.
 *
 * `confirmed` is gated by more than a number — see `bandFor` — because a
 * threshold alone would let a pile of weak agreement cross it.
 */
export const BAND_THRESHOLDS = {
  confirmed: 0.85,
  likely: 0.65,
  possible: 0.4,
} as const;

export interface IdentityOptions {
  /**
   * Similarity between the athlete's reference photo and this track, 0..1, or
   * undefined when no photo was supplied or no comparison was run. Undefined
   * and 0 mean very different things and are never conflated.
   */
  readonly photoSimilarity?: number | undefined;
  /** Which service produced the detections. Recorded on every segment. */
  readonly detectionSource: string;
}

/**
 * How much a set of reads supports the athlete, split into two figures.
 *
 * `agreement` is directional — did the reads point at this athlete or away from
 * them. `clarity` is how legible they were on average. Both are needed, and an
 * earlier version of this function returned only the first. That version scored
 * ten frames of 20%-confidence OCR exactly like ten frames of 95%-confidence
 * OCR, because a ratio of agreeing weight to total weight is 1.0 either way.
 * The engine's own test suite caught it, which is the whole reason the suite
 * tries to make the engine overclaim rather than only checking it works.
 *
 * `signal` — the product of the two — is what actually feeds the fusion, so an
 * unreadable jersey contributes almost nothing in either direction. That is
 * correct: it *is* almost no evidence.
 */
function weightedAgreement(
  observations: readonly Observation[],
  score: (o: Observation) => number | null,
): { agreement: number; clarity: number; signal: number; readCount: number } {
  let weightFor = 0;
  let weightTotal = 0;
  let readCount = 0;
  for (const observation of observations) {
    const result = score(observation);
    if (result === null) continue;
    readCount += 1;
    weightTotal += Math.abs(result);
    if (result > 0) weightFor += result;
  }
  if (readCount === 0 || weightTotal === 0) {
    return { agreement: 0, clarity: 0, signal: 0, readCount };
  }
  const agreement = weightFor / weightTotal;
  const clarity = Math.min(1, weightTotal / readCount);
  return { agreement, clarity, signal: agreement * clarity, readCount };
}

/**
 * How much the jersey number said, for one observation.
 *
 * Returns a positive number when the read supports the athlete, a negative one
 * when it contradicts them, and null when nothing was read. A misread that is a
 * known OCR confusion counts as mild support rather than contradiction: "58"
 * where we expected "56" is far more likely to be our own reader slipping than
 * a different player who happens to be in the same place.
 */
function numberSignal(observation: Observation, expected: string): number | null {
  if (observation.jerseyNumber === null) return null;
  const read = normaliseJerseyNumber(observation.jerseyNumber);
  if (read.length === 0) return null;
  const score = observation.jerseyNumberScore;
  if (jerseyNumbersMatch(read, expected)) return score;
  if (isLikelyOcrConfusion(read, expected)) return score * 0.25;
  return -score;
}

function colorSignal(observation: Observation, expected: string): number | null {
  if (observation.jerseyColorId === null) return null;
  const score = observation.jerseyColorScore;
  if (score <= 0) return null;
  return observation.jerseyColorId === expected ? score : -score;
}

/**
 * How plausible this motion is for the position the athlete plays.
 *
 * A prior, not a gate. A goalie who leaves the crease is still the goalie, so
 * this can only ever nudge confidence — it is capped tightly and never applied
 * as a veto.
 */
export function positionPrior(
  position: Position,
  observations: readonly Observation[],
  frameHeight: number,
): number {
  if (observations.length === 0 || frameHeight <= 0) return 1;
  let spread = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const o of observations) {
    const centre = o.box.x + o.box.width / 2;
    minX = Math.min(minX, centre);
    maxX = Math.max(maxX, centre);
  }
  spread = maxX - minX;
  const relative = spread / frameHeight;
  switch (position) {
    case "goalie":
      // Goalies cover a small part of the ice. A track that crosses the whole
      // frame is less likely to be one — but only a little less.
      return relative < 0.5 ? 1.05 : 0.92;
    case "defense":
      return relative > 0.2 ? 1.0 : 0.98;
    case "forward":
      return relative > 0.4 ? 1.03 : 1.0;
    default:
      return 1;
  }
}

/**
 * Which band a confidence belongs to.
 *
 * The extra condition on `confirmed` is the important part of this function.
 * A track only reaches the top band if the jersey number was actually read,
 * more than once, and agreed. Colour and motion can make something `likely`;
 * they are not allowed to make it certain, because they never are.
 */
export function bandFor(
  confidence: number,
  evidence: IdentityEvidence,
): ConfidenceBand {
  const numberIsDecisive =
    evidence.numberReadCount >= 2 &&
    evidence.numberAgreement >= 0.6 &&
    // Two illegible guesses that happen to agree are not a confirmation.
    evidence.numberClarity >= 0.5;
  if (confidence >= BAND_THRESHOLDS.confirmed && numberIsDecisive) return "confirmed";
  if (confidence >= BAND_THRESHOLDS.likely) return "likely";
  if (confidence >= BAND_THRESHOLDS.possible) return "possible";
  return "uncertain";
}

/**
 * How a band should be spoken about on screen.
 *
 * Bands exist so the interface does not have to invent its own wording, and so
 * that "possible" means the same thing on the review screen as it does in the
 * export warning.
 */
export function describeBand(band: ConfidenceBand): string {
  switch (band) {
    case "confirmed":
      return "The jersey number was read clearly more than once and matched. This is your player.";
    case "likely":
      return "The jersey colour matches throughout and the number agrees where it could be read. Worth a look before you approve it.";
    case "possible":
      return "The jersey colour matches but the number was never read clearly. This may be a team-mate — check it.";
    case "uncertain":
      return "Too little agreed for this to be a claim. It is shown so you can judge it yourself, not because we think it is your player.";
    default:
      return "";
  }
}

/**
 * Fuse everything known about one track into one identity judgement.
 *
 * The weights are redistributed rather than defaulted: whichever signals are
 * actually present divide the whole weight between them. This is what makes a
 * track with a clearly read number and no photo just as strong as one with
 * both, instead of being penalised for a photo the user never uploaded.
 */
export function scoreTrack(
  track: PlayerTrack,
  athlete: Athlete,
  options: IdentityOptions,
  frameHeight = 1080,
): PlayerSegment | null {
  const observations = track.observations;
  if (observations.length === 0) return null;

  const colour = weightedAgreement(observations, (o) =>
    colorSignal(o, athlete.jerseyColorId),
  );
  const number = weightedAgreement(observations, (o) =>
    numberSignal(o, athlete.jerseyNumber),
  );

  const colourWeight = colorReliability(athlete.jerseyColorId);
  // The number is the only signal that is unique within a game, so it carries
  // the most weight — but only in proportion to how often it was actually
  // readable. Two clear reads out of six hundred frames is a real signal; it is
  // not a conclusive one.
  const readFraction = Math.min(1, number.readCount / Math.max(1, observations.length));
  const numberWeight = number.readCount === 0 ? 0 : 1.6 * (0.45 + 0.55 * readFraction);
  const photo = options.photoSimilarity;
  const photoWeight = photo === undefined ? 0 : 0.7;

  const totalWeight = colourWeight + numberWeight + photoWeight;
  if (totalWeight === 0) return null;

  // `signal`, not `agreement`: a read that agreed but was barely legible must
  // not count like one that was unmistakable.
  const raw =
    (colour.signal * colourWeight +
      number.signal * numberWeight +
      (photo ?? 0) * photoWeight) /
    totalWeight;

  const prior = positionPrior(athlete.position, observations, frameHeight);
  const confidence = clamp01(raw * prior);

  const evidence: IdentityEvidence = {
    colorAgreement: round3(colour.agreement),
    colorClarity: round3(colour.clarity),
    numberAgreement: round3(number.agreement),
    numberClarity: round3(number.clarity),
    numberReadCount: number.readCount,
    observationCount: observations.length,
    photoSimilarity: photo === undefined ? null : round3(photo),
  };

  const times = observations.map((o) => o.timeSeconds);
  return {
    id: `${track.id}-segment`,
    projectId: "",
    trackId: track.id,
    startTime: Math.min(...times),
    endTime: Math.max(...times),
    confidence: round3(confidence),
    band: bandFor(confidence, evidence),
    detectionSource: options.detectionSource,
    evidence,
  };
}

/**
 * Score every track and return the ones worth showing, strongest first.
 *
 * `minConfidence` defaults low on purpose. Hiding weak candidates would make
 * the product look more certain than it is and would lose the case this MVP is
 * built for: the athlete was found, but only barely, and a human can settle it
 * in two seconds by looking.
 */
export function findPlayerSegments(
  tracks: readonly PlayerTrack[],
  athlete: Athlete,
  options: IdentityOptions & {
    readonly projectId: string;
    readonly minConfidence?: number;
    readonly frameHeight?: number;
    readonly photoSimilarityByTrack?: Readonly<Record<string, number>>;
  },
): readonly PlayerSegment[] {
  const floor = options.minConfidence ?? BAND_THRESHOLDS.possible;
  const segments: PlayerSegment[] = [];
  for (const track of tracks) {
    const similarity =
      options.photoSimilarityByTrack?.[track.id] ?? options.photoSimilarity;
    const scored = scoreTrack(
      track,
      athlete,
      similarity === undefined
        ? { detectionSource: options.detectionSource }
        : { detectionSource: options.detectionSource, photoSimilarity: similarity },
      options.frameHeight ?? 1080,
    );
    if (scored === null) continue;
    if (scored.confidence < floor) continue;
    segments.push({ ...scored, projectId: options.projectId });
  }
  return segments.sort((a, b) => b.confidence - a.confidence);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
