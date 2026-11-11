/**
 * Lining up two cameras from their loudness, with the checks that say when the
 * answer is doubtful. Pure: the loudness is measured elsewhere.
 */

import type { VideoFacts } from "./ffmpeg.ts";
import { findOffset, type SyncResult } from "./sync.ts";

/** Seconds between loudness readings. Whistles are short, so this is fine-grained. */
export const SYNC_STEP_SECONDS = 0.1;

export interface Alignment {
  readonly sync: SyncResult;
  /** The offset the files' own start times suggest (0 when they do not say). */
  readonly guessedOffsetSeconds: number;
  /** Plain-words warnings, if any. */
  readonly notes: string[];
}

export function alignCameras(
  factsA: VideoFacts,
  factsB: VideoFacts,
  loudA: readonly number[],
  loudB: readonly number[],
  options: {
    /** How far either side of the guess to look, in seconds. */
    readonly searchSeconds?: number;
    /** Skip measuring: the second video started this long after the first. */
    readonly forcedOffsetSeconds?: number;
  } = {},
): Alignment {
  const notes: string[] = [];
  const guessed =
    factsA.startedAtEpoch !== null && factsB.startedAtEpoch !== null
      ? factsB.startedAtEpoch - factsA.startedAtEpoch
      : 0;
  if (factsA.startedAtEpoch === null || factsB.startedAtEpoch === null) {
    notes.push(
      "A video did not say when it started, so the search for the alignment began from zero.",
    );
  }

  if (options.forcedOffsetSeconds !== undefined) {
    notes.push("The alignment was set by hand, not measured.");
    return {
      sync: { offsetSeconds: options.forcedOffsetSeconds, confidence: 1 },
      guessedOffsetSeconds: guessed,
      notes,
    };
  }

  // The timestamps are usually right to within a few seconds; look well beyond that anyway.
  const sync = findOffset(
    loudA,
    loudB,
    SYNC_STEP_SECONDS,
    guessed,
    options.searchSeconds ?? 120,
  );
  if (sync.confidence < 0.15) {
    notes.push(
      `The two videos could not be lined up with confidence (${sync.confidence.toFixed(2)} out of 1). The picks may be off by seconds; check them before trusting them.`,
    );
  }
  // The files' own start times are normally right to within a few seconds. If the
  // sound disagrees by much more, one of the two is wrong, and it is not clear which.
  if (
    factsA.startedAtEpoch !== null &&
    factsB.startedAtEpoch !== null &&
    Math.abs(sync.offsetSeconds - guessed) > 20
  ) {
    notes.push(
      `The sound says the second video started ${sync.offsetSeconds.toFixed(1)} s after the first, but the files' own start times say ${guessed.toFixed(1)} s. They should agree to within a few seconds; check the picks, and set the difference by hand if you know it.`,
    );
  }
  if (sync.offsetSeconds < 0) {
    notes.push(
      `The second video started ${(-sync.offsetSeconds).toFixed(1)} s BEFORE the first, and that opening stretch is not used.`,
    );
  }
  return { sync, guessedOffsetSeconds: guessed, notes };
}
