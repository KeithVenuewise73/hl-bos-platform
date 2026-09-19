/**
 * Player re-identification (brief section 7).
 *
 * Football breaks trackers. Not occasionally — every play. Twenty-two bodies
 * in identical uniforms converge on one point, a pile forms, the camera pans,
 * and the athlete emerges somewhere else with a new track id. A tracker alone
 * cannot solve this, because the tracker's own assumption (this box is near
 * where that box was) is exactly what the pile violates.
 *
 * Re-identification is therefore not a nicety here; it is the mechanism that
 * makes "follow #23 through the game" possible at all.
 *
 * WHY A COMPOSITE SIGNATURE RATHER THAN AN EMBEDDING. A generic person-ReID
 * embedding is trained to separate people by clothing, and in football every
 * player on a team is wearing the same clothing. Left alone it will confidently
 * re-link #23 to #28. So the embedding is one signal among several, and the
 * signals that actually separate teammates — the jersey number, and the
 * physical impossibility of being somewhere — carry their own weight.
 *
 * THE MOTION GATE IS A HARD VETO, not a weight. A human cannot cross forty
 * yards in a fifth of a second. When the candidate requires that, no amount of
 * embedding similarity should be allowed to overrule it, because a confident
 * wrong re-link is worse than a dropped track: a dropped track shows up as a
 * gap the user can correct, while a wrong re-link silently puts another child
 * in the athlete's highlight reel.
 */

import type { BoundingBox, FieldPoint, Point, Rgb, VideoTimestamp } from "./types";
import { boxCenter } from "./types";
import { rgbToLab, uniformDistance } from "./color";

/**
 * Everything we know about how one player looks and moves, gathered into the
 * object that gets compared when a track has to be reconnected.
 */
export interface PlayerSignature {
  readonly trackId: string;
  readonly at: VideoTimestamp;
  readonly box: BoundingBox;
  readonly jerseyColor: Rgb | null;
  readonly helmetColor: Rgb | null;
  readonly pantsColor: Rgb | null;
  readonly numberColor: Rgb | null;
  /** Voted, not per-frame. See jersey.temporalVote. */
  readonly jerseyNumber: number | null;
  readonly numberConfidence: number;
  /** Unit-length appearance embedding, when a ReID model produced one. */
  readonly embedding: readonly number[] | null;
  readonly field: FieldPoint | null;
  /** Normalised screen units per second. Used by the motion gate. */
  readonly velocity: { readonly vx: number; readonly vy: number } | null;
}

export interface SimilarityParts {
  readonly embedding: number | null;
  readonly jerseyColor: number | null;
  readonly helmetColor: number | null;
  readonly pantsColor: number | null;
  readonly numberAgreement: number | null;
  readonly bodyProportions: number | null;
  readonly motion: number | null;
}

export interface SimilarityResult {
  /** 0..1. 0 when a hard gate rejected the pair. */
  readonly score: number;
  readonly parts: SimilarityParts;
  /** Set when a gate vetoed. Shown verbatim in the admin debug view. */
  readonly vetoed: string | null;
}

export interface ReIdOptions {
  /**
   * Top speed, in normalised screen widths per second, that a human on a
   * football field can plausibly cover. 0.9 is generous: it allows a full
   * sprint across most of the frame in one second, which already exceeds any
   * real athlete on a typical sideline framing, so the gate only fires on
   * impossibilities rather than on fast players.
   */
  readonly maxSpeed?: number;
  /** Beyond this gap, position tells us nothing and the gate stops applying. */
  readonly motionGateMaxGapSeconds?: number;
  /** A confident, DIFFERENT number is a veto. This is how confident. */
  readonly conflictingNumberConfidence?: number;
  readonly weights?: Partial<Record<keyof SimilarityParts, number>>;
}

const DEFAULT_WEIGHTS: Record<keyof SimilarityParts, number> = {
  embedding: 3.0,
  jerseyColor: 1.0,
  helmetColor: 0.6,
  pantsColor: 0.6,
  // Highest single weight: in a uniformed team sport the number is the only
  // appearance signal that separates teammates at all.
  numberAgreement: 4.0,
  bodyProportions: 0.8,
  motion: 1.6,
};

const REID_DEFAULTS = {
  maxSpeed: 0.9,
  motionGateMaxGapSeconds: 2.5,
  conflictingNumberConfidence: 0.7,
};

/** Cosine similarity mapped to 0..1. Returns null if either side is absent. */
export function embeddingSimilarity(
  a: readonly number[] | null,
  b: readonly number[] | null,
): number | null {
  if (a === null || b === null || a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.min(1, Math.max(0, (cos + 1) / 2));
}

function colorSimilarity(a: Rgb | null, b: Rgb | null): number | null {
  if (a === null || b === null) return null;
  const d = uniformDistance(rgbToLab(a), rgbToLab(b));
  // 40 ΔE is the point at which two uniform colours are unrelated. Linear
  // falloff keeps the number interpretable in the debug view.
  return Math.min(1, Math.max(0, 1 - d / 40));
}

/**
 * Height-to-width ratio of the detection box, which stands in for build.
 *
 * Weak on its own — it separates a lineman from a corner, not two corners —
 * but it is nearly free and it is one of the few signals that survives a
 * uniform change between games in season mode.
 */
function proportionSimilarity(a: BoundingBox, b: BoundingBox): number | null {
  if (a.w <= 0 || b.w <= 0 || a.h <= 0 || b.h <= 0) return null;
  const ra = a.h / a.w;
  const rb = b.h / b.w;
  const rel = Math.abs(ra - rb) / Math.max(ra, rb);
  return Math.min(1, Math.max(0, 1 - rel));
}

/**
 * Compare a candidate track against a known signature.
 *
 * `vetoed` is populated instead of returning a low score when a hard constraint
 * was violated, so the admin view can show WHY a plausible-looking match was
 * refused rather than leaving a confusing 0.
 */
export function similarity(
  known: PlayerSignature,
  candidate: PlayerSignature,
  opts: ReIdOptions = {},
): SimilarityResult {
  const o = { ...REID_DEFAULTS, ...opts };
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };

  const gapSeconds = candidate.at.seconds - known.at.seconds;

  // --- Hard gate 1: the number says they are different people --------------
  if (
    known.jerseyNumber !== null &&
    candidate.jerseyNumber !== null &&
    known.jerseyNumber !== candidate.jerseyNumber &&
    known.numberConfidence >= o.conflictingNumberConfidence &&
    candidate.numberConfidence >= o.conflictingNumberConfidence
  ) {
    return {
      score: 0,
      parts: emptyParts(),
      vetoed: `confident conflicting numbers (#${known.jerseyNumber} vs #${candidate.jerseyNumber})`,
    };
  }

  // --- Hard gate 2: nobody moves that fast ----------------------------------
  let motion: number | null = null;
  if (gapSeconds > 0 && gapSeconds <= o.motionGateMaxGapSeconds) {
    const from = boxCenter(known.box);
    const to = boxCenter(candidate.box);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const reachable = o.maxSpeed * gapSeconds;
    if (distance > reachable) {
      return {
        score: 0,
        parts: emptyParts(),
        vetoed: `physically unreachable (${distance.toFixed(2)} screen widths in ${gapSeconds.toFixed(2)}s)`,
      };
    }
    // Reward being near where the last known velocity predicted, not merely
    // near where he was: a receiver running a post is SUPPOSED to be far from
    // his previous box, and punishing that loses exactly the plays worth
    // clipping.
    const predicted: Point =
      known.velocity === null
        ? from
        : {
            x: from.x + known.velocity.vx * gapSeconds,
            y: from.y + known.velocity.vy * gapSeconds,
          };
    const predictionError = Math.hypot(to.x - predicted.x, to.y - predicted.y);
    motion = Math.min(1, Math.max(0, 1 - predictionError / Math.max(reachable, 1e-6)));
  }

  const parts: SimilarityParts = {
    embedding: embeddingSimilarity(known.embedding, candidate.embedding),
    jerseyColor: colorSimilarity(known.jerseyColor, candidate.jerseyColor),
    helmetColor: colorSimilarity(known.helmetColor, candidate.helmetColor),
    pantsColor: colorSimilarity(known.pantsColor, candidate.pantsColor),
    numberAgreement:
      known.jerseyNumber !== null && candidate.jerseyNumber !== null
        ? known.jerseyNumber === candidate.jerseyNumber
          ? Math.min(known.numberConfidence, candidate.numberConfidence)
          : 0
        : null,
    bodyProportions: proportionSimilarity(known.box, candidate.box),
    motion,
  };

  // Weighted mean over the signals that are actually present. Absent signals
  // are dropped from BOTH numerator and denominator: a missing embedding must
  // not read as a dissimilar embedding.
  let num = 0;
  let den = 0;
  for (const key of Object.keys(weights) as Array<keyof SimilarityParts>) {
    const v = parts[key];
    if (v === null) continue;
    const w = weights[key];
    num += v * w;
    den += w;
  }

  return { score: den === 0 ? 0 : num / den, parts, vetoed: null };
}

function emptyParts(): SimilarityParts {
  return {
    embedding: null,
    jerseyColor: null,
    helmetColor: null,
    pantsColor: null,
    numberAgreement: null,
    bodyProportions: null,
    motion: null,
  };
}

export interface ReIdMatch {
  readonly trackId: string;
  readonly score: number;
  readonly result: SimilarityResult;
}

/**
 * Pick the best re-link for a lost athlete, or refuse.
 *
 * Refusal is a first-class outcome. `minScore` sets how good a match has to be,
 * and `minMargin` requires the winner to be clearly better than the runner-up —
 * because the dangerous case in football is not "no candidate looks right", it
 * is "two teammates look equally right".
 */
export function bestMatch(
  known: PlayerSignature,
  candidates: readonly PlayerSignature[],
  opts: ReIdOptions & { minScore?: number; minMargin?: number } = {},
): ReIdMatch | null {
  const minScore = opts.minScore ?? 0.6;
  const minMargin = opts.minMargin ?? 0.08;

  const scored = candidates
    .map((c) => ({ trackId: c.trackId, result: similarity(known, c, opts) }))
    .map((x) => ({ ...x, score: x.result.score }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best === undefined || best.score < minScore) return null;
  const second = scored[1];
  if (second !== undefined && best.score - second.score < minMargin) return null;
  return best;
}
