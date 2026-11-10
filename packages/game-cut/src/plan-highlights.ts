/**
 * Highlights from times a person gave: from text and one or two video files to
 * a list of clips, ready to render. Reads only.
 *
 * The times are read on the FIRST video's clock. With a second camera, the two
 * are lined up by their shared sound, and each clip uses the camera whose
 * picture changed more around that moment: the end of the ice nearer the play.
 */

import { alignCameras, SYNC_STEP_SECONDS, type Alignment } from "./align.ts";
import {
  loudnessSeries,
  motionSeries,
  probe,
  type JobOptions,
  type Tools,
  type VideoFacts,
} from "./ffmpeg.ts";
import { clipsFromTimes, type HighlightOptions, type TimedClip } from "./highlights.ts";
import { parseTimestamps, type TimestampProblem } from "./timestamps.ts";

export interface HighlightPlanResult {
  readonly factsA: VideoFacts;
  /** The second camera's facts, or the first's again when there is only one camera. */
  readonly factsB: VideoFacts;
  readonly hasSecondCamera: boolean;
  readonly alignment: Alignment | null;
  readonly clips: TimedClip[];
  /** Times that could not be used, with why (past the end, no camera, ...). */
  readonly skipped: {
    readonly line: number;
    readonly seconds: number;
    readonly why: string;
  }[];
  /** Lines of the typed list that could not be read. */
  readonly problems: TimestampProblem[];
  readonly notes: string[];
}

export interface PlanHighlightsOptions extends Partial<HighlightOptions> {
  readonly forcedOffsetSeconds?: number;
  readonly onStep?: (message: string) => void;
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}

/** The mean picture change over a short stretch of one file, or 0 if there is no such stretch. */
async function activityAround(
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

export async function planHighlights(
  tools: Tools,
  fileA: string,
  fileB: string | null,
  timesText: string,
  options: PlanHighlightsOptions = {},
): Promise<HighlightPlanResult> {
  const say = options.onStep ?? (() => undefined);
  const tell = options.onProgress ?? (() => undefined);
  const jobOf = (): JobOptions => (options.signal ? { signal: options.signal } : {});
  const notes: string[] = [];

  const { moments: times, problems } = parseTimestamps(timesText);
  if (times.length === 0) {
    throw new Error(
      problems.length > 0
        ? "None of the lines could be read as a time. Each line should start with a time like 12:34 or 1:02:15."
        : "No times were given. Type one per line, like 12:34 big hit.",
    );
  }

  say("Reading the video's details…");
  const factsA = await probe(tools, fileA);
  const factsB = fileB === null ? factsA : await probe(tools, fileB);
  tell(0.05);

  let alignment: Alignment | null = null;
  if (fileB !== null) {
    if (!factsA.hasAudio || !factsB.hasAudio) {
      throw new Error(
        "Both videos need sound, because the sound is how they are lined up.",
      );
    }
    say("Listening to the first video…");
    const loudA = await loudnessSeries(tools, fileA, SYNC_STEP_SECONDS, {
      ...jobOf(),
      onProgress: (s) => tell(0.05 + 0.3 * Math.min(1, s / factsA.durationSeconds)),
    });
    say("Listening to the second video…");
    const loudB = await loudnessSeries(tools, fileB, SYNC_STEP_SECONDS, {
      ...jobOf(),
      onProgress: (s) => tell(0.35 + 0.3 * Math.min(1, s / factsB.durationSeconds)),
    });
    say("Lining the two videos up by their shared sound…");
    alignment = alignCameras(factsA, factsB, loudA, loudB, {
      ...(options.forcedOffsetSeconds !== undefined
        ? { forcedOffsetSeconds: options.forcedOffsetSeconds }
        : {}),
    });
    notes.push(...alignment.notes);
  }
  tell(0.65);

  const offset = alignment?.sync.offsetSeconds ?? 0;
  // Decide each clip's camera first (async), then lay the clips out (pure).
  const preliminary = clipsFromTimes(times, factsA.durationSeconds, options);
  const choices = new Map<
    number,
    { camera: "A" | "B"; clipStartSeconds: number } | null
  >();
  for (let i = 0; i < preliminary.clips.length; i += 1) {
    const c = preliminary.clips[i]!;
    say(`Choosing the camera for clip ${i + 1} of ${preliminary.clips.length}…`);
    tell(0.65 + (0.35 * i) / Math.max(1, preliminary.clips.length));
    if (fileB === null || alignment === null) {
      choices.set(c.startSeconds, { camera: "A", clipStartSeconds: c.startSeconds });
      continue;
    }
    const aCovers = c.endSeconds <= factsA.durationSeconds;
    const bStart = c.startSeconds - offset;
    const bEnd = c.endSeconds - offset;
    const bCovers = bStart >= 0 && bEnd <= factsB.durationSeconds;
    if (!aCovers && !bCovers) {
      choices.set(c.startSeconds, null);
    } else if (!bCovers) {
      choices.set(c.startSeconds, { camera: "A", clipStartSeconds: c.startSeconds });
    } else if (!aCovers) {
      choices.set(c.startSeconds, { camera: "B", clipStartSeconds: bStart });
    } else {
      const a = await activityAround(
        tools,
        fileA,
        factsA,
        c.startSeconds,
        c.endSeconds,
        jobOf(),
      );
      const b = await activityAround(tools, fileB, factsB, bStart, bEnd, jobOf());
      choices.set(
        c.startSeconds,
        b > a
          ? { camera: "B", clipStartSeconds: bStart }
          : { camera: "A", clipStartSeconds: c.startSeconds },
      );
    }
  }
  const plan = clipsFromTimes(
    times,
    factsA.durationSeconds,
    options,
    (start) => choices.get(start) ?? null,
  );
  tell(1);
  return {
    factsA,
    factsB,
    hasSecondCamera: fileB !== null,
    alignment,
    clips: plan.clips,
    skipped: plan.skipped,
    problems,
    notes,
  };
}
