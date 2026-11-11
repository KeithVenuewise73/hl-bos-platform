/**
 * From two video files to a list of moments to keep. Reads only.
 */

import {
  capabilities,
  loudnessSeries,
  motionSeries,
  probe,
  type JobOptions,
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
import { alignCameras, SYNC_STEP_SECONDS } from "./align.ts";
import type { SyncResult } from "./sync.ts";

export const STEP_SECONDS = 0.5;
/** Finer loudness readings for lining up: whistles are short. */

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
  /** How far along the whole analysis is, 0 to 1, for a progress bar. */
  readonly onProgress?: (fraction: number) => void;
  /** Stops the work (and the ffmpeg running it). */
  readonly signal?: AbortSignal;
}

/**
 * Weights for the progress bar. Listening is quick (sound only); watching has to
 * read every picture and takes most of the time.
 */
const WEIGHTS = {
  details: 1,
  listenA: 6,
  listenB: 6,
  sync: 1,
  watchA: 40,
  watchB: 40,
  choose: 1,
} as const;
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

/** Turns "phase P is f done" into one overall fraction. */
export function overallProgress(
  done: readonly (keyof typeof WEIGHTS)[],
  current: keyof typeof WEIGHTS,
  f: number,
): number {
  const before = done.reduce((t, k) => t + WEIGHTS[k], 0);
  return Math.max(
    0,
    Math.min(
      1,
      (before + WEIGHTS[current] * Math.max(0, Math.min(1, f))) / TOTAL_WEIGHT,
    ),
  );
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
  const tell = options.onProgress ?? (() => undefined);
  const notes: string[] = [];
  const done: (keyof typeof WEIGHTS)[] = [];
  const job = (phase: keyof typeof WEIGHTS, length: number): JobOptions => ({
    ...(options.signal ? { signal: options.signal } : {}),
    onProgress: (seconds) =>
      tell(overallProgress(done, phase, length > 0 ? seconds / length : 0)),
  });
  const finish = (phase: keyof typeof WEIGHTS) => {
    done.push(phase);
    tell(overallProgress(done, "choose", 0));
  };

  say("Reading the two videos' details…");
  const [factsA, factsB] = [await probe(tools, fileA), await probe(tools, fileB)];
  if (!factsA.hasAudio || !factsB.hasAudio) {
    throw new Error(
      "Both videos need sound, because the sound is how they are lined up.",
    );
  }
  const caps = await capabilities(tools);
  if ((factsA.isHdr || factsB.isHdr) && !caps.hdrConversion) {
    notes.push(
      "These videos are HDR, and this copy of ffmpeg cannot convert HDR colours, so the result will look washed out. A fuller build of ffmpeg fixes that.",
    );
  }
  finish("details");

  say("Listening to the first video…");
  const loudA = await loudnessSeries(
    tools,
    fileA,
    SYNC_STEP_SECONDS,
    job("listenA", factsA.durationSeconds),
  );
  finish("listenA");
  say("Listening to the second video…");
  const loudB = await loudnessSeries(
    tools,
    fileB,
    SYNC_STEP_SECONDS,
    job("listenB", factsB.durationSeconds),
  );
  finish("listenB");

  say("Lining the two videos up by their shared sound…");
  const aligned = alignCameras(factsA, factsB, loudA, loudB, {
    ...(options.searchSeconds !== undefined
      ? { searchSeconds: options.searchSeconds }
      : {}),
    ...(options.forcedOffsetSeconds !== undefined
      ? { forcedOffsetSeconds: options.forcedOffsetSeconds }
      : {}),
  });
  const { sync, guessedOffsetSeconds: guessed } = aligned;
  notes.push(...aligned.notes);

  finish("sync");

  say("Watching the first video…");
  const motionA = await motionSeries(
    tools,
    fileA,
    STEP_SECONDS,
    job("watchA", factsA.durationSeconds),
  );
  finish("watchA");
  say("Watching the second video…");
  const motionB = await motionSeries(
    tools,
    fileB,
    STEP_SECONDS,
    job("watchB", factsB.durationSeconds),
  );
  finish("watchB");

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
