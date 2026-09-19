/**
 * Highlight candidate generation, clip windows and ranking (sections 14, 18).
 *
 * THE ONE RULE THAT MATTERS MOST: never cut off the conclusion of a play.
 *
 * Everything else here is a preference. That one is not, and it is the failure
 * every automated clipper makes. A 40-yard touchdown run that fades to black at
 * the 3-yard line is not a highlight, it is an insult, and a parent will notice
 * it before anything else in the product. So the clip end is computed from the
 * END of the play plus padding — never from the snap plus a fixed duration —
 * and `clampWindow` will shorten the lead-in before it will shorten the tail.
 *
 * Clip windows are in SECONDS, not frames, because this is the boundary where
 * the decision leaves the engine and becomes an FFmpeg seek.
 */

import type {
  ClipSelectionMode,
  ClipWindow,
  HighlightCandidate,
  Play,
  PlayerPlayInvolvement,
} from "./types";

export interface ClipPaddingOptions {
  /** Seconds of lead-in before the snap. The brief's default is 5. */
  readonly preSnapSeconds?: number;
  /** Seconds held after the play ends. The brief's default is 8. */
  readonly postPlaySeconds?: number;
  /** Total video length; windows are clamped into it. */
  readonly videoDurationSeconds: number;
  /**
   * Shortest clip worth exporting. A 1.4-second clip reads as a glitch even
   * when the detection behind it was correct.
   */
  readonly minClipSeconds?: number;
}

const PADDING_DEFAULTS = {
  preSnapSeconds: 5,
  postPlaySeconds: 8,
  minClipSeconds: 3,
};

/**
 * Turn a play into the clip window that shows it.
 *
 * Anchored on the snap when one was found, and on the play's own start when it
 * was not — with the same padding either way, so a play with a low-confidence
 * snap still produces a watchable clip rather than being dropped.
 */
export function planClipWindow(play: Play, opts: ClipPaddingOptions): ClipWindow {
  const o = { ...PADDING_DEFAULTS, ...opts };
  const anchor = play.snapAt?.seconds ?? play.startAt.seconds;
  const rawStart = anchor - o.preSnapSeconds;
  const rawEnd = play.endAt.seconds + o.postPlaySeconds;
  return clampWindow({ startSeconds: rawStart, endSeconds: rawEnd }, play, o);
}

/**
 * Fit a window inside the file without losing the end of the play.
 *
 * The asymmetry is deliberate. Running past the end of the file truncates the
 * tail — there is no footage left to show, and that is the file's fault, not a
 * choice we make. Running before the start of the file is fixed by taking lead-in
 * away, never by moving the end earlier.
 */
export function clampWindow(
  window: ClipWindow,
  play: Play,
  opts: ClipPaddingOptions & { minClipSeconds?: number },
): ClipWindow {
  const duration = opts.videoDurationSeconds;
  const minClip = opts.minClipSeconds ?? PADDING_DEFAULTS.minClipSeconds;

  let start = Math.max(0, window.startSeconds);
  let end = Math.min(duration, window.endSeconds);

  // The conclusion is non-negotiable: the window must reach the end of the
  // play, or as far as the file allows.
  const mustReach = Math.min(play.endAt.seconds, duration);
  if (end < mustReach) end = mustReach;

  // Too short only because it ran into the head of the file: give the time
  // back at the tail, which is padding, not play.
  if (end - start < minClip) {
    end = Math.min(duration, start + minClip);
    if (end - start < minClip) start = Math.max(0, end - minClip);
  }

  if (end <= start) end = Math.min(duration, start + minClip);
  return { startSeconds: start, endSeconds: end };
}

export function windowDuration(w: ClipWindow): number {
  return Math.max(0, w.endSeconds - w.startSeconds);
}

export function windowsOverlap(a: ClipWindow, b: ClipWindow): boolean {
  return a.startSeconds < b.endSeconds && b.startSeconds < a.endSeconds;
}

/**
 * Score a candidate on the 0..5 scale the UI shows as "4.3 / 5".
 *
 * Starts from the involvement engine's continuous output, then applies two
 * honesty adjustments that both push DOWNWARD:
 *
 *   * thin visibility — we saw little of him, so we claim less;
 *   * shaky identity — we are not sure it was him, so we claim less.
 *
 * Nothing here pushes a score up. A highlight reel that oversells is a reel a
 * coach stops trusting, and there is no recovering from that.
 */
export function highlightScore(inv: PlayerPlayInvolvement, play: Play): number {
  let score = inv.rawScore;

  // Identity doubt scales the whole claim: at 50% confidence the play is worth
  // half of what it would be if we were certain.
  score *= 0.5 + 0.5 * Math.min(1, Math.max(0, inv.identityConfidence));

  // Seeing him for a tenth of the play is not the same evidence as seeing him
  // throughout, even when the event detector fired.
  if (inv.visibilityPercentage < 0.5) {
    score *= 0.75 + 0.5 * inv.visibilityPercentage;
  }

  // A play we are not sure was a play should not produce a confident highlight.
  score *= 0.7 + 0.3 * Math.min(1, Math.max(0, play.segmentationConfidence));

  return Math.round(Math.min(5, Math.max(0, score)) * 10) / 10;
}

export interface CandidateOptions extends ClipPaddingOptions {
  /** Plays below this involvement never become candidates at all. */
  readonly minInvolvement?: number;
}

/**
 * Build the highlight candidates for a game.
 *
 * Every play the athlete appeared in produces a candidate, including the dull
 * ones: the "All Plays" mode in the brief is a real mode that coaches use, and
 * filtering at generation time would make it impossible.
 */
export function buildCandidates(
  plays: readonly Play[],
  involvements: readonly PlayerPlayInvolvement[],
  opts: CandidateOptions,
): HighlightCandidate[] {
  const byId = new Map(plays.map((p) => [p.playId, p] as const));
  const minInvolvement = opts.minInvolvement ?? 1;

  const out: HighlightCandidate[] = [];
  for (const inv of involvements) {
    const play = byId.get(inv.playId);
    if (play === undefined) continue;
    if (!inv.playerPresent || inv.involvement < minInvolvement) continue;

    out.push({
      candidateId: `cand-${play.playId}`,
      playId: play.playId,
      window: planClipWindow(play, opts),
      involvement: inv.involvement,
      score: highlightScore(inv, play),
      events: inv.events,
      reasons: inv.reasons,
      reviewRequired: inv.reviewRequired,
    });
  }
  return out;
}

/** Minimum involvement each selection mode admits (brief section 14). */
export const SELECTION_THRESHOLDS: Readonly<Record<ClipSelectionMode, number>> = {
  all_plays: 0,
  involved_plays: 2,
  best_plays: 3,
  elite_highlights: 4,
};

export function selectCandidates(
  candidates: readonly HighlightCandidate[],
  mode: ClipSelectionMode,
): HighlightCandidate[] {
  const threshold = SELECTION_THRESHOLDS[mode];
  return candidates.filter((c) => c.involvement >= threshold);
}

/**
 * Rank candidates for the reel.
 *
 * Ties break on play order, not on some secondary metric, because two plays the
 * engine genuinely cannot separate should appear in the order they happened.
 * Inventing a preference between them would be inventing a judgement.
 */
export function rankCandidates(
  candidates: readonly HighlightCandidate[],
): HighlightCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.involvement !== a.involvement) return b.involvement - a.involvement;
    return a.playId.localeCompare(b.playId, "en");
  });
}

/**
 * Remove candidates whose footage overlaps one already chosen.
 *
 * Two plays close together in the file produce overlapping windows once padded,
 * and cutting both puts the same seconds in the reel twice. The higher-scoring
 * one wins; the other is dropped rather than trimmed, because trimming it would
 * violate the conclusion rule.
 */
export function dedupeOverlapping(
  candidates: readonly HighlightCandidate[],
): HighlightCandidate[] {
  const kept: HighlightCandidate[] = [];
  for (const c of rankCandidates(candidates)) {
    if (kept.some((k) => windowsOverlap(k.window, c.window))) continue;
    kept.push(c);
  }
  // Back into chronological order: a reel is watched, not browsed.
  return kept.sort((a, b) => a.window.startSeconds - b.window.startSeconds);
}
