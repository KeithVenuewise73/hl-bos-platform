/**
 * The boundary between the product and whatever is doing the looking.
 *
 * The brief is explicit: do not couple the product to one detection model.
 * So the app never imports YOLO, never knows what ByteTrack is, and never
 * learns which of the two produced a box. It calls a `VisionProvider` and gets
 * tracks back. Swapping the detector is a new implementation of this interface.
 *
 * The other half of that bargain — and the harder half — is that a provider
 * must be able to say **"I cannot do this"**. A vision service with no model
 * installed has to report that, and the job has to fail visibly, because the
 * alternative is a product that quietly returns zero events and lets a user
 * conclude their child did nothing all game.
 */

import type { PlayerTrack } from "../types.ts";

export interface VideoProbe {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly sizeBytes: number;
}

export interface TrackingRequest {
  /** Where the proxy video is. Analysis never reads the original. */
  readonly proxyStorageKey: string;
  /** Analyse every Nth frame. Higher is faster and coarser. */
  readonly frameStride: number;
  /** The jersey colour to look for, by id from `jersey.ts`. */
  readonly jerseyColorId: string;
  readonly jerseyNumber: string;
  /** Optional reference photo. Providers that cannot use one ignore it. */
  readonly referencePhotoKey?: string | undefined;
}

export interface TrackingResult {
  readonly tracks: readonly PlayerTrack[];
  /** Which detector and version produced these. Recorded on every segment. */
  readonly detectionSource: string;
  readonly framesAnalysed: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /**
   * Whether a reference photo was actually compared. False when none was
   * supplied OR when this provider cannot compare photos — the distinction is
   * in `notes`, and the UI says which, rather than leaving a user to assume
   * their upload was used.
   */
  readonly usedReferencePhoto: boolean;
  readonly notes: readonly string[];
}

/**
 * Why a provider cannot run.
 *
 * A first-class result, not an exception, because "no model installed" is an
 * expected state of a fresh checkout and the UI has to explain it in plain
 * English rather than showing a stack trace.
 */
export interface ProviderAvailability {
  readonly available: boolean;
  /** What the user is told. Written for a person, not an operator. */
  readonly detail: string;
  /** What an engineer would need to change. Empty when available. */
  readonly remedy: string | null;
}

export interface VisionProvider {
  /** Stable id, recorded against every detection this provider produces. */
  readonly id: string;
  readonly label: string;
  /** Can this provider actually run right now? Checked before a job starts. */
  availability(): Promise<ProviderAvailability>;
  probe(storageKey: string): Promise<VideoProbe>;
  /** Make the downscaled analysis copy. Returns the new storage key. */
  makeProxy(storageKey: string, maxHeight: number): Promise<string>;
  track(request: TrackingRequest): Promise<TrackingResult>;
  /** Cut one clip from the original. Returns the new storage key. */
  cutClip(sourceKey: string, start: number, end: number): Promise<string>;
  /** Concatenate cuts into the finished reel. Returns the new storage key. */
  renderReel(
    sourceKey: string,
    cuts: readonly { readonly start: number; readonly end: number }[],
  ): Promise<string>;
}

export class ProviderUnavailableError extends Error {
  constructor(
    readonly providerId: string,
    readonly availability: ProviderAvailability,
  ) {
    super(availability.detail);
    this.name = "ProviderUnavailableError";
  }
}
