/**
 * When a photo needs a person, and which galleries it belongs in.
 *
 * The app's SQL implements the same rules for speed over thousands of photos;
 * the app's tests hold that SQL to these functions on the same fixtures, so
 * there is one definition and one enforcement of it, not two opinions.
 */

import { bandFor, type ConfidenceThresholds } from "./confidence.ts";
import type { DetectionStatus } from "./types.ts";

export interface DetectionState {
  readonly value: string;
  readonly confidence: number;
  readonly status: DetectionStatus;
}

export interface PhotoReviewState {
  readonly detections: readonly DetectionState[];
  readonly athletesPresent: boolean | null;
  readonly noJerseyVisible: boolean;
  readonly unusable: boolean;
  /** A person has looked at this photo and finished with it. */
  readonly reviewed: boolean;
}

/**
 * The status a photo should hold once analysis has run.
 *
 * Needs review when:
 *   * any suggested (unconfirmed) number is below the automatic band, or
 *   * no number was found and the provider did not rule out athletes.
 *
 * A person's decision always wins: reviewed, "no jersey visible" and
 * "unusable" are all final.
 */
export function analyzedStatus(
  photo: PhotoReviewState,
  thresholds: ConfidenceThresholds,
): "completed" | "needs_review" {
  if (photo.reviewed || photo.noJerseyVisible || photo.unusable) return "completed";
  const active = photo.detections.filter((d) => d.status !== "rejected");
  if (active.length === 0) {
    return photo.athletesPresent === false ? "completed" : "needs_review";
  }
  const uncertain = active.some(
    (d) => d.status === "suggested" && bandFor(d.confidence, thresholds) !== "high",
  );
  return uncertain ? "needs_review" : "completed";
}

/**
 * The jersey galleries a photo appears in. Confirmed numbers always; AI
 * suggestions only in the high and medium bands. Low readings do not file a
 * photo anywhere — that photo is Unidentified until someone looks.
 */
export function galleryNumbers(
  detections: readonly DetectionState[],
  thresholds: ConfidenceThresholds,
): string[] {
  const out = new Set<string>();
  for (const d of detections) {
    if (d.status === "rejected") continue;
    if (d.status === "confirmed" || bandFor(d.confidence, thresholds) !== "low") {
      out.add(d.value);
    }
  }
  return [...out];
}

/** In no jersey gallery, and nobody has said there is no jersey to find. */
export function isUnidentified(
  photo: PhotoReviewState,
  thresholds: ConfidenceThresholds,
): boolean {
  if (photo.noJerseyVisible || photo.unusable) return false;
  return galleryNumbers(photo.detections, thresholds).length === 0;
}
