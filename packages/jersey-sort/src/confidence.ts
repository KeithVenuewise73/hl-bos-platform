/**
 * Confidence bands.
 *
 *   HIGH    >= high threshold (default 85%)   filed automatically
 *   MEDIUM  >= medium threshold (default 60%) filed, marked Needs Review
 *   LOW     below that                        Unidentified / Review
 *
 * The thresholds are per-organisation settings. Bands are COMPUTED from the
 * stored confidence every time they are needed, never stored themselves, so
 * moving a threshold re-sorts every gallery immediately and no photo is left
 * stranded in a band that no longer exists.
 */

export interface ConfidenceThresholds {
  readonly high: number;
  readonly medium: number;
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = { high: 0.85, medium: 0.6 };

export type ConfidenceBand = "high" | "medium" | "low";

export function bandFor(
  confidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): ConfidenceBand {
  if (confidence >= thresholds.high) return "high";
  if (confidence >= thresholds.medium) return "medium";
  return "low";
}

/** A threshold pair is usable when 0 < medium < high <= 1. */
export function validateThresholds(t: ConfidenceThresholds): string | null {
  if (!Number.isFinite(t.high) || !Number.isFinite(t.medium)) {
    return "Both thresholds must be numbers.";
  }
  if (t.medium <= 0) return "The review threshold must be above 0%.";
  if (t.high > 1) return "The automatic threshold cannot be above 100%.";
  if (t.medium >= t.high) {
    return "The review threshold must be lower than the automatic threshold.";
  }
  return null;
}

/** "94%" — what the UI shows. */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
