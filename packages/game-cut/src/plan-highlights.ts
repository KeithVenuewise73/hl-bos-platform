/**
 * Highlights from times a person gave: from text and one or two video files to
 * a list of clips, ready to render. Reads only.
 *
 * The times are read on the FIRST video's clock. With a second camera, the two
 * are lined up by their shared sound, and each clip uses the camera whose
 * picture changed more around that moment: the end of the ice nearer the play.
 */

import { alignCameras, SYNC_STEP_SECONDS, type Alignment } from "./align.ts";
import { chooseCamera, type CameraChoice, type CameraRig } from "./cameras.ts";
import {
  loudnessSeries,
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

  const rig: CameraRig = {
    tools,
    fileA,
    fileB,
    factsA,
    factsB,
    offsetSeconds: alignment?.sync.offsetSeconds ?? 0,
  };
  // Decide each clip's camera first (async), then lay the clips out (pure).
  const preliminary = clipsFromTimes(times, factsA.durationSeconds, options);
  const choices = new Map<number, CameraChoice | null>();
  for (let i = 0; i < preliminary.clips.length; i += 1) {
    const c = preliminary.clips[i]!;
    say(`Choosing the camera for clip ${i + 1} of ${preliminary.clips.length}…`);
    tell(0.65 + (0.35 * i) / Math.max(1, preliminary.clips.length));
    choices.set(
      c.startSeconds,
      await chooseCamera(rig, c.startSeconds, c.endSeconds, jobOf()),
    );
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
