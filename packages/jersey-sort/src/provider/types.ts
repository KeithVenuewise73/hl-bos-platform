/**
 * The ImageAnalysisProvider boundary.
 *
 * Anything that can look at a photo and report the numbers in it implements
 * this: Claude vision (./claude.ts), the app's local OCR, and whichever comes
 * next — Gemini, Google Cloud Vision, Rekognition, a custom YOLO jersey
 * model. Adding one is one new file; the pipeline, the review queue and the
 * galleries never change, because they only ever see `ProviderResult`, and
 * every result goes through `interpretReadings()` before anything is stored.
 *
 * A provider's output is EVIDENCE, not a verdict. It may be wrong; the
 * context rules and the confidence bands decide what is filed, and a person
 * can override every one of those decisions.
 */

import type { DetectionMethod, ProviderResult } from "../types.ts";

export interface ProviderInfo {
  /** Stored on every detection as `provider`. */
  readonly id: string;
  /** Stored on every detection as `provider_model`. */
  readonly model: string;
  /** Plain English for the settings page. */
  readonly label: string;
  readonly method: DetectionMethod;
  /**
   * Whether this provider can tell a jersey from a scoreboard by itself. A
   * provider that cannot has its readings capped below the automatic band.
   */
  readonly understandsContext: boolean;
}

/** The image as handed to a provider. Decoding and resizing are the app's job. */
export interface AnalysisImage {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
  readonly height: number;
}

export interface ImageAnalysisProvider {
  readonly info: ProviderInfo;
  analyze(image: AnalysisImage): Promise<ProviderResult>;
}

/**
 * Thrown when a provider is configured but cannot run (no key, model not
 * installed). The photo is marked FAILED with this message and can be
 * retried; nothing is substituted for the missing provider's answer.
 */
export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
