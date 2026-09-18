/**
 * A provider that replays tracks it was handed.
 *
 * FOR TESTS AND DEMONstrations ONLY. It is exported so the engine's pipeline
 * can be tested end to end without a GPU, and so the app has something to run
 * against while the Python service is being wired up.
 *
 * It is NOT a fallback. `selectProvider` will never choose it, and its
 * `detectionSource` is the literal string "replay:fixture" so that any segment
 * it produced is identifiable as fixture-derived everywhere it is displayed,
 * stored or exported. Fabricated detections that cannot be told apart from real
 * ones are exactly what principle 10 forbids.
 */

import type {
  ProviderAvailability,
  TrackingRequest,
  TrackingResult,
  VideoProbe,
  VisionProvider,
} from "./types.ts";
import type { PlayerTrack } from "../types.ts";

/** The marker that says "these detections came from a fixture, not a camera". */
export const REPLAY_DETECTION_SOURCE = "replay:fixture";

export interface ReplayFixture {
  readonly probe: VideoProbe;
  readonly tracks: readonly PlayerTrack[];
  readonly frameWidth: number;
  readonly frameHeight: number;
}

export class ReplayVisionProvider implements VisionProvider {
  readonly id = "replay";
  readonly label = "Replay of recorded tracks (test fixture)";

  constructor(private readonly fixture: ReplayFixture) {}

  availability(): Promise<ProviderAvailability> {
    return Promise.resolve({
      available: true,
      detail:
        "Replaying recorded tracks from a fixture. No video is being analysed, and every result is marked as fixture-derived.",
      remedy: null,
    });
  }

  probe(): Promise<VideoProbe> {
    return Promise.resolve(this.fixture.probe);
  }

  makeProxy(storageKey: string): Promise<string> {
    return Promise.resolve(`${storageKey}.proxy`);
  }

  track(request: TrackingRequest): Promise<TrackingResult> {
    return Promise.resolve({
      tracks: this.fixture.tracks,
      detectionSource: REPLAY_DETECTION_SOURCE,
      framesAnalysed: this.fixture.tracks.reduce(
        (total, track) => total + track.observations.length,
        0,
      ),
      frameWidth: this.fixture.frameWidth,
      frameHeight: this.fixture.frameHeight,
      usedReferencePhoto: false,
      notes: [
        "These tracks were replayed from a fixture. Nothing was detected from video.",
        request.referencePhotoKey === undefined
          ? "No reference photo was supplied."
          : "A reference photo was supplied but a replay provider cannot compare photos, so it was not used.",
      ],
    });
  }

  cutClip(sourceKey: string, start: number, end: number): Promise<string> {
    return Promise.resolve(`${sourceKey}.clip-${start}-${end}`);
  }

  renderReel(sourceKey: string): Promise<string> {
    return Promise.resolve(`${sourceKey}.reel`);
  }
}

/** True when a detection source came from a fixture rather than a camera. */
export function isFixtureSource(detectionSource: string): boolean {
  return detectionSource.startsWith("replay:");
}
