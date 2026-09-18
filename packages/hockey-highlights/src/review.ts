/**
 * Human review.
 *
 * The MVP's central bet: the engine proposes, a person disposes. So this file
 * is where a person's judgement is written down, and it has one absolute rule —
 * **a clip that no human has accepted never reaches a reel.** That rule is
 * enforced here, again in `reel.ts` when the reel is assembled, and a third
 * time as a CHECK constraint in the database. A clip of the wrong child sent to
 * a family is worth three independent controls.
 */

import { clipDuration, effectiveWindow } from "./clips.ts";
import type { Clip, ReviewDecision } from "./types.ts";

export class InvalidTrimError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidTrimError";
  }
}

export function decide(clip: Clip, decision: ReviewDecision, note?: string): Clip {
  return { ...clip, decision, note: note ?? clip.note };
}

/**
 * Apply a human trim.
 *
 * Trims are validated against the proposed window rather than against the
 * video, because a reviewer dragging a handle inside a clip cannot mean to
 * select footage outside it. A trim that inverts or empties the clip is
 * refused: a zero-length clip renders to a file that will not play, and finding
 * that out at export time is far too late.
 */
export function trim(clip: Clip, start: number, end: number): Clip {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new InvalidTrimError("A trim needs two real times.");
  }
  if (end <= start) {
    throw new InvalidTrimError("A clip has to end after it starts.");
  }
  if (start < clip.startTime - 1e-6 || end > clip.endTime + 1e-6) {
    throw new InvalidTrimError(
      "A trim can only shorten the proposed clip, not extend it past what was detected.",
    );
  }
  return { ...clip, trimmedStart: start, trimmedEnd: end };
}

export function clearTrim(clip: Clip): Clip {
  return { ...clip, trimmedStart: null, trimmedEnd: null };
}

/** The clips a person has said yes to, in reel order. */
export function acceptedClips(clips: readonly Clip[]): readonly Clip[] {
  return clips
    .filter((clip) => clip.decision === "accepted")
    .filter((clip) => clipDuration(clip) > 0)
    .sort((a, b) => a.order - b.order || a.startTime - b.startTime);
}

export interface ReviewProgress {
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly pending: number;
  readonly acceptedSeconds: number;
  /** Whether there is anything to build a reel from. */
  readonly canBuildReel: boolean;
  /** One sentence for the review header. */
  readonly summary: string;
}

export function reviewProgress(clips: readonly Clip[]): ReviewProgress {
  const accepted = acceptedClips(clips);
  const rejected = clips.filter((c) => c.decision === "rejected").length;
  const pending = clips.filter((c) => c.decision === "pending").length;
  const seconds = accepted.reduce((total, clip) => total + clipDuration(clip), 0);
  const summary =
    clips.length === 0
      ? "No clips were produced from this game."
      : pending > 0
        ? `${accepted.length} kept, ${rejected} discarded, ${pending} still to review.`
        : `All ${clips.length} reviewed: ${accepted.length} kept, ${rejected} discarded.`;
  return {
    total: clips.length,
    accepted: accepted.length,
    rejected,
    pending,
    acceptedSeconds: Math.round(seconds * 100) / 100,
    canBuildReel: accepted.length > 0,
    summary,
  };
}

/** Re-order the review queue after a drag, keeping `order` dense and stable. */
export function reorder(clips: readonly Clip[], clipId: string, toIndex: number): Clip[] {
  const ordered = [...clips].sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((c) => c.id === clipId);
  if (from < 0) return ordered;
  const moved = ordered[from];
  if (moved === undefined) return ordered;
  ordered.splice(from, 1);
  ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, moved);
  return ordered.map((clip, index) => ({ ...clip, order: index }));
}

export { effectiveWindow, clipDuration };
