/**
 * The Confidence State Machine (Learning Loop §4.2).
 *
 * Confidence is two-dimensional: a provenance/quality tier, degraded by
 * orthogonal health flags. This module is the single authority on:
 *   - how strong a tier is (ranking),
 *   - the *effective* tier of an item once its flags are applied,
 *   - the tier a whole recommendation is capped to by its weakest load-bearing
 *     input.
 *
 * It is pure and deterministic: `outdated` is decided against an injected
 * "as of" date, never a wall clock.
 */

import type { HealthFlag, QualityTier } from "./types.ts";

/**
 * The minimal shape the confidence machine needs. `EvidenceItem` satisfies it,
 * and so does any other domain's evidence (e.g. the startup value chain) — this
 * is what lets other BTI domains REUSE this exact confidence machine rather than
 * copy it. The functions below read only these fields, never `link`.
 */
export interface ConfidenceInput {
  readonly quality: QualityTier;
  readonly flags?: readonly HealthFlag[];
  readonly sources?: readonly string[];
  readonly capturedAt?: string;
  readonly validityWindowDays?: number;
}

/** Strongest → weakest. Lower rank number = stronger. */
const RANK: Record<QualityTier, number> = {
  verified: 0,
  observed: 1,
  estimated: 2,
  assumed: 3,
  unknown: 4,
};

const ORDER: readonly QualityTier[] = [
  "verified",
  "observed",
  "estimated",
  "assumed",
  "unknown",
];

/** True when `a` is at least as strong as `b`. */
export function atLeast(a: QualityTier, b: QualityTier): boolean {
  return RANK[a] <= RANK[b];
}

/** The weaker of two tiers. */
export function weaker(a: QualityTier, b: QualityTier): QualityTier {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Weaken a tier by `steps`, clamped at "unknown". */
export function degrade(tier: QualityTier, steps: number): QualityTier {
  const next = Math.min(ORDER.length - 1, RANK[tier] + Math.max(0, steps));
  return ORDER[next]!;
}

/**
 * Whether a fact captured at `capturedAt` with a `validityWindowDays` window is
 * outdated as of `asOf`. Missing dates or window → never outdated (we cannot
 * honestly claim it is stale without the data to say so).
 */
export function isOutdated(item: ConfidenceInput, asOf: string): boolean {
  if (item.capturedAt === undefined || item.validityWindowDays === undefined)
    return false;
  const captured = Date.parse(item.capturedAt);
  const now = Date.parse(asOf);
  if (Number.isNaN(captured) || Number.isNaN(now)) return false;
  const ageDays = (now - captured) / 86_400_000;
  return ageDays > item.validityWindowDays;
}

/**
 * The effective tier of one evidence item once its health flags are applied:
 *   - conflicting → unusable until reconciled  → unknown
 *   - outdated (by window or explicit flag)     → unknown until refreshed
 *   - insufficient                              → degrade one tier
 *   - verified but < 2 sources                  → cannot be verified → observed
 */
export function effectiveTier(item: ConfidenceInput, asOf: string): QualityTier {
  const flags = new Set<HealthFlag>(item.flags ?? []);

  if (flags.has("conflicting")) return "unknown";
  if (flags.has("outdated") || isOutdated(item, asOf)) return "unknown";

  let tier: QualityTier = item.quality;

  // "verified" is a claim about corroboration; it must be backed by ≥2 sources.
  if (tier === "verified" && (item.sources?.length ?? 0) < 2) {
    tier = "observed";
  }

  if (flags.has("insufficient")) {
    tier = degrade(tier, 1);
  }

  return tier;
}

/**
 * Cap a recommendation's confidence at the weakest effective tier among its
 * load-bearing inputs. With no load-bearing inputs there is nothing to stand
 * on → "unknown".
 */
export function capByWeakest(
  loadBearing: readonly ConfidenceInput[],
  asOf: string,
  floor: QualityTier = "verified",
): QualityTier {
  let capped: QualityTier = floor;
  for (const item of loadBearing) {
    capped = weaker(capped, effectiveTier(item, asOf));
  }
  return loadBearing.length === 0 ? "unknown" : capped;
}
