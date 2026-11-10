/**
 * Highlights from times a person gave. Pure.
 *
 * Each time becomes a short clip around it. Clips that touch or overlap are
 * joined so the same play is never shown twice. A time beyond the end of the
 * video is reported, not quietly dropped.
 *
 * With two cameras, the times are read on the FIRST video's clock (the person
 * was watching it) and each clip uses whichever camera saw that moment better,
 * from the activity scores if there are any, else the first camera.
 */

import type { Moment } from "./moments.ts";
import type { TimedMoment } from "./timestamps.ts";

export interface HighlightOptions {
  /** Seconds kept before the time given. */
  readonly beforeSeconds: number;
  /** Seconds kept after it. */
  readonly afterSeconds: number;
  /** Clips closer together than this are joined. */
  readonly joinGapSeconds: number;
}

export const DEFAULT_HIGHLIGHT_OPTIONS: HighlightOptions = {
  beforeSeconds: 8,
  afterSeconds: 6,
  joinGapSeconds: 1,
};

export interface TimedClip extends Moment {
  /** What the person called it; joined clips list every name. */
  readonly label: string;
}

export interface HighlightPlan {
  readonly clips: TimedClip[];
  /** Times that could not be used, with why. */
  readonly skipped: {
    readonly line: number;
    readonly seconds: number;
    readonly why: string;
  }[];
}

export function clipsFromTimes(
  times: readonly TimedMoment[],
  /** Length of the first video, in seconds. */
  durationSeconds: number,
  options: Partial<HighlightOptions> = {},
  /** Chooses the camera for a stretch of game time; defaults to the first camera. */
  pickCamera: (
    startSeconds: number,
    endSeconds: number,
  ) => {
    camera: "A" | "B";
    clipStartSeconds: number;
  } | null = (start) => ({ camera: "A", clipStartSeconds: start }),
): HighlightPlan {
  const o = { ...DEFAULT_HIGHLIGHT_OPTIONS, ...options };
  const skipped: HighlightPlan["skipped"][number][] = [];
  type Range = { start: number; end: number; labels: string[] };
  const ranges: Range[] = [];
  for (const t of [...times].sort((a, b) => a.seconds - b.seconds)) {
    if (t.seconds > durationSeconds) {
      skipped.push({
        line: t.line,
        seconds: t.seconds,
        why: `That is past the end of the video (${Math.floor(durationSeconds / 60)} minutes long).`,
      });
      continue;
    }
    const start = Math.max(0, t.seconds - o.beforeSeconds);
    const end = Math.min(durationSeconds, t.seconds + o.afterSeconds);
    if (end - start < 1) {
      skipped.push({
        line: t.line,
        seconds: t.seconds,
        why: "Too close to the end for a clip.",
      });
      continue;
    }
    const last = ranges[ranges.length - 1];
    if (last !== undefined && start <= last.end + o.joinGapSeconds) {
      last.end = Math.max(last.end, end);
      if (t.label !== "") last.labels.push(t.label);
    } else {
      ranges.push({ start, end, labels: t.label === "" ? [] : [t.label] });
    }
  }
  const clips: TimedClip[] = [];
  for (const r of ranges) {
    const chosen = pickCamera(r.start, r.end);
    if (chosen === null) {
      skipped.push({
        line: 0,
        seconds: r.start,
        why: "No camera has footage for this moment.",
      });
      continue;
    }
    clips.push({
      startSeconds: r.start,
      endSeconds: r.end,
      camera: chosen.camera,
      clipStartSeconds: chosen.clipStartSeconds,
      peak: 0,
      scoreA: 0,
      scoreB: 0,
      label: r.labels.join(" + "),
    });
  }
  return { clips, skipped };
}
