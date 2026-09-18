/**
 * The provider that talks to services/hockey-vision over HTTP.
 *
 * Thin on purpose. Every judgement about what the pixels mean lives in the
 * Python service; everything about what to do with the answer lives in the
 * engine. This file is the wire between them and should stay boring.
 *
 * It fails closed. A service that is unreachable, slow, or returns something
 * this file does not recognise produces an error, never an empty result —
 * "we found nothing" and "we could not look" must never arrive at a user
 * wearing the same clothes.
 */

import type {
  ProviderAvailability,
  TrackingRequest,
  TrackingResult,
  VideoProbe,
  VisionProvider,
} from "./types.ts";
import type { Observation, PlayerTrack } from "../types.ts";

export interface HttpVisionOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class VisionServiceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "VisionServiceError";
  }
}

export class HttpVisionProvider implements VisionProvider {
  readonly id = "hockey-vision-http";
  readonly label = "HL-BOS hockey vision service";

  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: HttpVisionOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    // Tracking a full game is minutes of work, not milliseconds. A default
    // 30-second timeout would abort every real job.
    this.#timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async availability(): Promise<ProviderAvailability> {
    try {
      const body = await this.#send<{
        ready: boolean;
        detail: string;
        remedy: string | null;
      }>("GET", "/availability", undefined, 10_000);
      return { available: body.ready, detail: body.detail, remedy: body.remedy };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      return {
        available: false,
        detail: `The video analysis service is not answering (${reason}).`,
        remedy: `Start the hockey vision service and make sure ${this.#baseUrl} is reachable.`,
      };
    }
  }

  async probe(storageKey: string): Promise<VideoProbe> {
    // Mapped field by field, NOT passed through. The service speaks
    // snake_case and this interface is camelCase, and `width`/`height` happen
    // to be spelled the same in both — which is precisely why passing the
    // response through looked like it worked. `durationSeconds` arrived
    // undefined, the clip planner multiplied it out to NaN, and the first
    // clip built through the real UI was stored with a null end time.
    const wire = await this.#send<WireProbe>("POST", "/probe", {
      storage_key: storageKey,
    });
    return {
      durationSeconds: wire.duration_seconds,
      width: wire.width,
      height: wire.height,
      frameRate: wire.frame_rate,
      sizeBytes: wire.size_bytes,
    };
  }

  async makeProxy(storageKey: string, maxHeight: number): Promise<string> {
    const body = await this.#send<{ storage_key: string }>("POST", "/proxy", {
      storage_key: storageKey,
      max_height: maxHeight,
    });
    return body.storage_key;
  }

  async track(request: TrackingRequest): Promise<TrackingResult> {
    const body = await this.#send<WireTrackingResult>("POST", "/track", {
      storage_key: request.proxyStorageKey,
      frame_stride: request.frameStride,
      jersey_color_id: request.jerseyColorId,
      jersey_number: request.jerseyNumber,
      reference_photo_key: request.referencePhotoKey ?? null,
    });
    return {
      tracks: body.tracks.map(toTrack),
      detectionSource: body.detection_source,
      framesAnalysed: body.frames_analysed,
      frameWidth: body.frame_width,
      frameHeight: body.frame_height,
      usedReferencePhoto: body.used_reference_photo,
      notes: body.notes,
    };
  }

  async cutClip(sourceKey: string, start: number, end: number): Promise<string> {
    const body = await this.#send<{ storage_key: string }>("POST", "/clip", {
      storage_key: sourceKey,
      start,
      end,
    });
    return body.storage_key;
  }

  async renderReel(
    sourceKey: string,
    cuts: readonly { readonly start: number; readonly end: number }[],
  ): Promise<string> {
    const body = await this.#send<{ storage_key: string }>("POST", "/reel", {
      storage_key: sourceKey,
      cuts: cuts.map((cut) => ({ start: cut.start, end: cut.end })),
    });
    return body.storage_key;
  }

  async #send<T>(
    method: string,
    path: string,
    payload?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: payload === undefined ? {} : { "content-type": "application/json" },
        body: payload === undefined ? null : JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new VisionServiceError(
          `The video analysis service refused the request: ${response.status} ${detail}`.trim(),
          response.status,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

interface WireProbe {
  duration_seconds: number;
  width: number;
  height: number;
  frame_rate: number;
  size_bytes: number;
}

interface WireObservation {
  frame: number;
  time_seconds: number;
  box: { x: number; y: number; width: number; height: number };
  detection_score: number;
  jersey_color_id: string | null;
  jersey_color_score: number;
  jersey_number: string | null;
  jersey_number_score: number;
}

interface WireTrackingResult {
  tracks: { id: string; observations: WireObservation[] }[];
  detection_source: string;
  frames_analysed: number;
  frame_width: number;
  frame_height: number;
  used_reference_photo: boolean;
  notes: string[];
}

function toTrack(wire: { id: string; observations: WireObservation[] }): PlayerTrack {
  return {
    id: wire.id,
    observations: wire.observations.map((o): Observation => ({
      frame: o.frame,
      timeSeconds: o.time_seconds,
      box: o.box,
      detectionScore: o.detection_score,
      jerseyColorId: o.jersey_color_id,
      jerseyColorScore: o.jersey_color_score,
      jerseyNumber: o.jersey_number,
      jerseyNumberScore: o.jersey_number_score,
    })),
  };
}
