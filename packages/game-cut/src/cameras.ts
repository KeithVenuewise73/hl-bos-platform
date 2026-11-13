/**
 * Which camera saw a stretch of the game better. Reads only.
 *
 * The camera whose picture changed more over that stretch is the one nearer the
 * action: each phone sits behind one goal, and play at its end is big and busy
 * while play at the far end is small and still. Shared by highlights from times
 * and by moments a person asks to be sure of.
 */

import {
  motionSeries,
  type JobOptions,
  type Tools,
  type VideoFacts,
} from "./ffmpeg.ts";

export interface CameraRig {
  readonly tools: Tools;
  readonly fileA: string;
  /** Null with one camera. */
  readonly fileB: string | null;
  readonly factsA: VideoFacts;
  readonly factsB: VideoFacts;
  /** B started this many seconds after A (negative: before). Game time is A's clock. */
  readonly offsetSeconds: number;
}

export interface CameraChoice {
  readonly camera: "A" | "B";
  /** Where to start cutting in THAT camera's own file. */
  readonly clipStartSeconds: number;
}

/** The mean picture change over a short stretch of one file, or 0 if there is no such stretch. */
export async function activityAround(
  tools: Tools,
  file: string,
  facts: VideoFacts,
  startSeconds: number,
  endSeconds: number,
  job: JobOptions,
): Promise<number> {
  const start = Math.max(0, startSeconds);
  const end = Math.min(facts.durationSeconds, endSeconds);
  if (end - start < 1) return 0;
  const series = await motionSeries(tools, file, 0.5, job, {
    startSeconds: start,
    lengthSeconds: end - start,
  });
  // The first reading of any run is a placeholder 0 (nothing before it to compare with).
  const real = series.slice(1);
  return real.length === 0 ? 0 : real.reduce((a, b) => a + b, 0) / real.length;
}

/**
 * The camera for game time [startSeconds, endSeconds], or null when neither has footage
 * for all of it. Only a camera that covers the whole stretch may be chosen.
 */
export async function chooseCamera(
  rig: CameraRig,
  startSeconds: number,
  endSeconds: number,
  job: JobOptions = {},
): Promise<CameraChoice | null> {
  if (rig.fileB === null) return { camera: "A", clipStartSeconds: startSeconds };
  const aCovers = startSeconds >= 0 && endSeconds <= rig.factsA.durationSeconds;
  const bStart = startSeconds - rig.offsetSeconds;
  const bEnd = endSeconds - rig.offsetSeconds;
  const bCovers = bStart >= 0 && bEnd <= rig.factsB.durationSeconds;
  if (!aCovers && !bCovers) return null;
  if (!bCovers) return { camera: "A", clipStartSeconds: startSeconds };
  if (!aCovers) return { camera: "B", clipStartSeconds: bStart };
  const a = await activityAround(
    rig.tools,
    rig.fileA,
    rig.factsA,
    startSeconds,
    endSeconds,
    job,
  );
  const b = await activityAround(rig.tools, rig.fileB, rig.factsB, bStart, bEnd, job);
  return b > a
    ? { camera: "B", clipStartSeconds: bStart }
    : { camera: "A", clipStartSeconds: startSeconds };
}
