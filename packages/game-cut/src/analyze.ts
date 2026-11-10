/**
 * From two video files to a list of moments to keep. Reads only.
 */

import {
  loudnessSeries,
  motionSeries,
  probe,
  type Tools,
  type VideoFacts,
} from "./ffmpeg.ts";
import {
  chooseBroadcast,
  chooseMoments,
  type BroadcastOptions,
  type CameraScores,
  type Moment,
  type MomentOptions,
} from "./moments.ts";
import { robustScores, shrinkByMax } from "./series.ts";
import { findOffset, type SyncResult } from "./sync.ts";

export const STEP_SECONDS = 0.5;
/** Finer loudness readings for lining up: whistles are short. */
const SYNC_STEP_SECONDS = 0.1;

export interface Analysis {
  readonly factsA: VideoFacts;
  readonly factsB: VideoFacts;
  readonly sync: SyncResult;
  /** Where the search for the offset was centred, from the files' own start times (or 0). */
  readonly guessedOffsetSeconds: number;
  readonly moments: Moment[];
  /** The bar that was used (highlights only; 0 for a broadcast). */
  readonly threshold: number;
  readonly gameSeconds: number;
  readonly mode: "broadcast" | "highlights";
  readonly notes: string[];
}

export interface AnalyzeOptions {
  /** "broadcast" (default): the whole game following the play. "highlights": only the strongest moments. */
  readonly mode?: "broadcast" | "highlights";
  readonly moment?: Partial<MomentOptions>;
  readonly broadcast?: Partial<BroadcastOptions>;
  /** How far either side of the guess to look for the true offset, in seconds. */
  readonly searchSeconds?: number;
  /** Skip lining up and use this offset (B started this many seconds after A). */
  readonly forcedOffsetSeconds?: number;
  readonly onStep?: (message: string) => void;
}

/** Loudness and motion together, one score per half second, for one camera. */
function cameraScores(
  loud: readonly number[],
  motion: readonly number[],
  audioWeight: number,
): number[] {
  const perStep = Math.round(STEP_SECONDS / SYNC_STEP_SECONDS);
  // Under 6 dB of rise the loudness is just crowd noise; under 1.5 grey levels of
  // change the picture is just sensor noise.
  const audio = robustScores(shrinkByMax(loud, perStep), 6);
  const move = robustScores(motion, 1.5);
  const n = Math.max(audio.length, move.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1)
    out.push(audioWeight * (audio[i] ?? 0) + (1 - audioWeight) * (move[i] ?? 0));
  return out;
}

export async function analyze(
  tools: Tools,
  fileA: string,
  fileB: string,
  options: AnalyzeOptions = {},
): Promise<Analysis> {
  const say = options.onStep ?? (() => undefined);
  const notes: string[] = [];

  say("Reading the two videos' details…");
  const [factsA, factsB] = [await probe(tools, fileA), await probe(tools, fileB)];
  if (!factsA.hasAudio || !factsB.hasAudio) {
    throw new Error(
      "Both videos need sound, because the sound is how they are lined up.",
    );
  }

  say("Measuring loudness in the first video…");
  const loudA = await loudnessSeries(tools, fileA, SYNC_STEP_SECONDS);
  say("Measuring loudness in the second video…");
  const loudB = await loudnessSeries(tools, fileB, SYNC_STEP_SECONDS);

  const guessed =
    factsA.startedAtEpoch !== null && factsB.startedAtEpoch !== null
      ? factsB.startedAtEpoch - factsA.startedAtEpoch
      : 0;
  if (factsA.startedAtEpoch === null || factsB.startedAtEpoch === null) {
    notes.push(
      "A video did not say when it started, so the search for the alignment began from zero.",
    );
  }

  let sync: SyncResult;
  if (options.forcedOffsetSeconds !== undefined) {
    sync = { offsetSeconds: options.forcedOffsetSeconds, confidence: 1 };
    notes.push("The alignment was set by hand, not measured.");
  } else {
    say("Lining the two videos up by their shared sound…");
    // The timestamps are usually right to within a few seconds; look well beyond that anyway.
    sync = findOffset(
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
        `The sound says the second video started ${sync.offsetSeconds.toFixed(1)} s after the first, but the files' own start times say ${guessed.toFixed(1)} s. They should agree to within a few seconds; check the picks, and pass --offset if you know the true difference.`,
      );
    }
  }

  say("Measuring movement in the first video…");
  const motionA = await motionSeries(tools, fileA, STEP_SECONDS);
  say("Measuring movement in the second video…");
  const motionB = await motionSeries(tools, fileB, STEP_SECONDS);

  const mode = options.mode ?? "broadcast";
  // Which end the play is at shows mostly in movement (the near camera sees it big);
  // for picking highlights, a loud moment counts as much as a busy one.
  const audioWeight = mode === "broadcast" ? 0.3 : 0.5;
  const a: CameraScores = {
    scores: cameraScores(loudA, motionA, audioWeight),
    durationSeconds: factsA.durationSeconds,
  };
  const b: CameraScores = {
    scores: cameraScores(loudB, motionB, audioWeight),
    durationSeconds: factsB.durationSeconds,
  };
  if (sync.offsetSeconds < 0) {
    notes.push(
      `The second video started ${(-sync.offsetSeconds).toFixed(1)} s BEFORE the first, and that opening stretch is not used.`,
    );
  }

  say(
    mode === "broadcast"
      ? "Following the play from end to end…"
      : "Choosing the action…",
  );
  if (mode === "broadcast") {
    const chosen = chooseBroadcast(a, b, {
      ...options.broadcast,
      stepSeconds: STEP_SECONDS,
      offsetSeconds: sync.offsetSeconds,
    });
    return {
      factsA,
      factsB,
      sync,
      guessedOffsetSeconds: guessed,
      notes,
      mode,
      threshold: 0,
      ...chosen,
    };
  }
  const chosen = chooseMoments(a, b, {
    ...options.moment,
    stepSeconds: STEP_SECONDS,
    offsetSeconds: sync.offsetSeconds,
  });
  return {
    factsA,
    factsB,
    sync,
    guessedOffsetSeconds: guessed,
    notes,
    mode,
    ...chosen,
  };
}
