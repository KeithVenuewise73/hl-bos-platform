/**
 * Turning moments into clips a person can judge.
 *
 * Three jobs, all of them about respecting the reviewer's time:
 *
 *  - **Pad.** A clip that starts at the instant the player accelerated is
 *    unwatchable; you need the run-up to see what happened.
 *  - **Merge.** Two moments four seconds apart are one play. Presenting them as
 *    two clips makes the reviewer rule on the same play twice.
 *  - **Bound.** Clips are clamped to the video. A clip whose window runs past
 *    the end of the file renders to a broken file or a black tail.
 */

import type { CandidateEvent, Clip } from "./types.ts";

export class UnknownDurationError extends Error {
  constructor(readonly received: unknown) {
    super(
      `Clips cannot be planned against a video whose length is not known (got ${String(received)}).`,
    );
    this.name = "UnknownDurationError";
  }
}

export interface ClipOptions {
  /** Seconds of lead-in before the event. */
  readonly leadSeconds?: number;
  /** Seconds to hold after it. */
  readonly tailSeconds?: number;
  /** Clips closer together than this are merged into one. */
  readonly mergeGapSeconds?: number;
  /** Hard floor and ceiling on a single clip. */
  readonly minSeconds?: number;
  readonly maxSeconds?: number;
  /** Duration of the source video. Clips never exceed it. */
  readonly videoDurationSeconds: number;
}

const DEFAULTS = {
  leadSeconds: 3,
  tailSeconds: 2.5,
  mergeGapSeconds: 2.5,
  minSeconds: 3,
  maxSeconds: 20,
} as const;

interface Window {
  readonly start: number;
  readonly end: number;
  readonly events: readonly CandidateEvent[];
}

/**
 * Build the review queue.
 *
 * Output is ordered by time, not by strength. The reviewer is watching a game
 * they were at; showing the third period before the first makes every clip
 * harder to place. Strength decides what gets *into* the queue, in
 * `detectEvents`; it does not decide the order they are watched in.
 */
export function buildClips(
  events: readonly CandidateEvent[],
  options: ClipOptions,
): readonly Clip[] {
  if (events.length === 0) return [];
  // A duration that is not a real number produces clips whose end time is NaN,
  // which serialises to null and reaches storage looking like a deliberate
  // value. That happened: a probe response was passed through unmapped, the
  // duration arrived undefined, and a clip was written with no end. Refusing
  // here is how the next such bug surfaces at its cause instead of three
  // layers downstream.
  if (
    !Number.isFinite(options.videoDurationSeconds) ||
    options.videoDurationSeconds <= 0
  ) {
    throw new UnknownDurationError(options.videoDurationSeconds);
  }
  const lead = options.leadSeconds ?? DEFAULTS.leadSeconds;
  const tail = options.tailSeconds ?? DEFAULTS.tailSeconds;
  const gap = options.mergeGapSeconds ?? DEFAULTS.mergeGapSeconds;
  const minSeconds = options.minSeconds ?? DEFAULTS.minSeconds;
  const maxSeconds = options.maxSeconds ?? DEFAULTS.maxSeconds;
  const duration = options.videoDurationSeconds;

  const padded = [...events]
    .sort((a, b) => a.startTime - b.startTime)
    .map((event) => ({
      start: Math.max(0, event.startTime - lead),
      end: Math.min(duration, event.endTime + tail),
      events: [event],
    }));

  const merged: Window[] = [];
  for (const window of padded) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && window.start - previous.end <= gap) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, window.end),
        events: [...previous.events, ...window.events],
      };
      continue;
    }
    merged.push(window);
  }

  const clips: Clip[] = [];
  for (const window of merged) {
    // The strongest event in a merged window is the one the clip is named
    // after and the one it is centred on if it has to be shortened.
    const lead0 = window.events[0];
    if (lead0 === undefined) continue;
    const strongest = window.events.reduce(
      (best, event) => (event.strength > best.strength ? event : best),
      lead0,
    );
    const bounded = fitWindow(
      window,
      strongest.peakTime,
      minSeconds,
      maxSeconds,
      duration,
    );
    if (bounded === null) continue;
    clips.push({
      id: `clip-${strongest.id}`,
      projectId: strongest.projectId,
      eventId: strongest.id,
      startTime: round2(bounded.start),
      endTime: round2(bounded.end),
      decision: "pending",
      trimmedStart: null,
      trimmedEnd: null,
      note: null,
      mediaAssetId: null,
      order: clips.length,
    });
  }
  return clips;
}

/**
 * Make a window obey the length rules without losing the moment.
 *
 * An over-long window is trimmed **around the peak**, not from the end. Cutting
 * the tail of a 40-second merged window would reliably remove the very thing
 * that made it a highlight.
 */
function fitWindow(
  window: Window,
  peak: number,
  minSeconds: number,
  maxSeconds: number,
  duration: number,
): { start: number; end: number } | null {
  let start = Math.max(0, window.start);
  let end = Math.min(duration, window.end);
  if (end <= start) return null;

  if (end - start > maxSeconds) {
    const half = maxSeconds / 2;
    start = Math.max(0, Math.min(peak - half, duration - maxSeconds));
    end = Math.min(duration, start + maxSeconds);
  }

  if (end - start < minSeconds) {
    const deficit = minSeconds - (end - start);
    start = Math.max(0, start - deficit / 2);
    end = Math.min(duration, start + minSeconds);
    // Ran out of video: a source shorter than the minimum clip length yields
    // one clip of the whole file rather than nothing at all.
    if (end - start < minSeconds) start = Math.max(0, end - minSeconds);
  }

  if (end <= start) return null;
  return { start, end };
}

/** The window that will actually be rendered, after any human trim. */
export function effectiveWindow(clip: Clip): { start: number; end: number } {
  return {
    start: clip.trimmedStart ?? clip.startTime,
    end: clip.trimmedEnd ?? clip.endTime,
  };
}

export function clipDuration(clip: Clip): number {
  const { start, end } = effectiveWindow(clip);
  return Math.max(0, round2(end - start));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
