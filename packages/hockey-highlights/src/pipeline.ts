/**
 * The pipeline, as one function per stage.
 *
 * The app owns persistence and calls these in order, saving the job between
 * each. That split is what makes "leave the page and come back" work: every
 * stage is a pure-ish step from one persisted state to the next, so a process
 * that dies between two stages loses at most the stage it was running.
 *
 * Each stage returns either a result or a `StageFailure`. Failures are values,
 * not exceptions, because every one of them has to end up in the job record
 * with a code, a retryability judgement and a sentence the user can read.
 */

import { detectEvents } from "./events.ts";
import { buildClips } from "./clips.ts";
import { findPlayerSegments } from "./identity.ts";
import { ProviderUnavailableError } from "./vision/types.ts";
import type { VisionProvider, VideoProbe } from "./vision/types.ts";
import type {
  Athlete,
  CandidateEvent,
  Clip,
  Observation,
  PlayerSegment,
  PlayerTrack,
} from "./types.ts";

/** Analysis height for the proxy. 540p is enough to find a person and a number. */
export const PROXY_MAX_HEIGHT = 540;

/** Analyse 5 frames a second. A skater does not change much between them. */
export function strideFor(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 6;
  return Math.max(1, Math.round(frameRate / 5));
}

export interface StageFailure {
  readonly ok: false;
  readonly code: string;
  readonly detail: string;
  readonly retryable: boolean;
}

export type StageResult<T> = ({ readonly ok: true } & T) | StageFailure;

function fail(code: string, detail: string, retryable: boolean): StageFailure {
  return { ok: false, code, detail, retryable };
}

/**
 * Turn any thrown thing into a failure record.
 *
 * `ProviderUnavailableError` is singled out and marked NOT retryable: a service
 * that is not connected will still not be connected in thirty seconds, and a
 * Try Again button that cannot work is a control that controls nothing.
 */
function toFailure(error: unknown, code: string): StageFailure {
  if (error instanceof ProviderUnavailableError) {
    return fail("vision_unavailable", error.availability.detail, false);
  }
  const detail = error instanceof Error ? error.message : String(error);
  return fail(code, detail, true);
}

// --- preprocessing ---------------------------------------------------------

export interface PreprocessOutput {
  readonly probe: VideoProbe;
  readonly proxyStorageKey: string;
}

export async function preprocess(
  provider: VisionProvider,
  originalStorageKey: string,
): Promise<StageResult<PreprocessOutput>> {
  try {
    const probe = await provider.probe(originalStorageKey);
    if (probe.durationSeconds <= 0) {
      return fail(
        "unreadable_video",
        "The file was accepted but no video could be read from it. It may be corrupt or may not be a video at all.",
        false,
      );
    }
    const proxyStorageKey = await provider.makeProxy(originalStorageKey, PROXY_MAX_HEIGHT);
    return { ok: true, probe, proxyStorageKey };
  } catch (error) {
    return toFailure(error, "preprocess_failed");
  }
}

// --- detection + tracking --------------------------------------------------

export interface TrackOutput {
  readonly tracks: readonly PlayerTrack[];
  readonly detectionSource: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly usedReferencePhoto: boolean;
  readonly notes: readonly string[];
}

export async function detectAndTrack(
  provider: VisionProvider,
  input: {
    readonly proxyStorageKey: string;
    readonly athlete: Athlete;
    readonly frameRate: number;
  },
): Promise<StageResult<TrackOutput>> {
  try {
    const result = await provider.track({
      proxyStorageKey: input.proxyStorageKey,
      frameStride: strideFor(input.frameRate),
      jerseyColorId: input.athlete.jerseyColorId,
      jerseyNumber: input.athlete.jerseyNumber,
      referencePhotoKey: input.athlete.referencePhotoKey,
    });
    if (result.tracks.length === 0) {
      // A real, reportable outcome rather than an error: the service ran and
      // saw nobody. Saying so is very different from failing, and the user
      // needs to be able to tell the two apart.
      return {
        ok: true,
        tracks: [],
        detectionSource: result.detectionSource,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        usedReferencePhoto: result.usedReferencePhoto,
        notes: [
          ...result.notes,
          "No players were detected anywhere in this video. If the camera was far from the ice, or the video is very dark, that is the usual reason.",
        ],
      };
    }
    return {
      ok: true,
      tracks: result.tracks,
      detectionSource: result.detectionSource,
      frameWidth: result.frameWidth,
      frameHeight: result.frameHeight,
      usedReferencePhoto: result.usedReferencePhoto,
      notes: result.notes,
    };
  } catch (error) {
    return toFailure(error, "tracking_failed");
  }
}

// --- identity + events -----------------------------------------------------

export interface EventOutput {
  readonly segments: readonly PlayerSegment[];
  readonly events: readonly CandidateEvent[];
  /** Said out loud when nothing matched, so an empty screen explains itself. */
  readonly notes: readonly string[];
}

export function identifyAndDetectEvents(input: {
  readonly projectId: string;
  readonly athlete: Athlete;
  readonly tracks: readonly PlayerTrack[];
  readonly detectionSource: string;
  readonly frameHeight: number;
  readonly minConfidence?: number;
}): EventOutput {
  const segments = findPlayerSegments(input.tracks, input.athlete, {
    projectId: input.projectId,
    detectionSource: input.detectionSource,
    frameHeight: input.frameHeight,
    ...(input.minConfidence === undefined ? {} : { minConfidence: input.minConfidence }),
  });

  if (segments.length === 0) {
    return {
      segments: [],
      events: [],
      notes: [
        input.tracks.length === 0
          ? "No players were detected, so there was nothing to match against the jersey you described."
          : `${input.tracks.length} player paths were found, but none of them matched a ${input.athlete.jerseyColorId} jersey numbered ${input.athlete.jerseyNumber} well enough to be worth showing you. Check the colour and number, and try again.`,
      ],
    };
  }

  const byTrack = new Map<string, readonly Observation[]>(
    input.tracks.map((track) => [track.id, track.observations]),
  );
  const events: CandidateEvent[] = [];
  for (const segment of segments) {
    const observations = byTrack.get(segment.trackId);
    if (observations === undefined) continue;
    events.push(
      ...detectEvents(segment, observations, { frameHeight: input.frameHeight }),
    );
  }

  return {
    segments,
    events,
    notes:
      events.length === 0
        ? [
            "Your player was found, but nothing in those stretches stood out as a moment worth clipping. You can still review the whole tracked footage.",
          ]
        : [],
  };
}

// --- clips -----------------------------------------------------------------

export function planClips(
  events: readonly CandidateEvent[],
  videoDurationSeconds: number,
): readonly Clip[] {
  return buildClips(events, { videoDurationSeconds });
}
