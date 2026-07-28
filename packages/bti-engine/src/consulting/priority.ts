// Deterministic prioritization for consulting findings. Transparent and
// categorical — severity drives the band; the domain's transformation weight
// only breaks ties for ordering. No opaque scoring, no false precision.

import type { DomainKey } from "../types.ts";
import type { Priority, Confidence } from "./types.ts";

export const FINDING_THRESHOLD = 3; // rating <= 3 is a finding; 4-5 are strengths

export function severityOf(rating: number): number {
  return Math.max(0, 5 - rating);
}

export function priorityFor(rating: number): Priority {
  const s = severityOf(rating);
  if (s >= 4) return "critical"; // rating 0-1
  if (s === 3) return "high"; // rating 2
  return "medium"; // rating 3
}

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// A stable ordering key: worse priority first, then higher domain weight,
// then label — fully deterministic.
export function orderKey(
  priority: Priority,
  domainWeight: number,
  label: string,
): string {
  const p = PRIORITY_RANK[priority].toString();
  const w = (99 - domainWeight).toString().padStart(2, "0");
  return `${p}:${w}:${label}`;
}

// Confidence in a finding, from how much verified evidence backs it. A rating
// alone is moderate; a rating plus explicit evidence is high; an extreme rating
// with no corroboration is flagged low so the CEO can validate it.
export function confidenceOf(rating: number, evidenceCount: number): Confidence {
  if (evidenceCount >= 1) return "high";
  if (rating === 0) return "low"; // an extreme claim with no corroboration
  return "moderate";
}

export function domainWeights(): Record<DomainKey, number> {
  return {
    business: 9,
    operations: 8,
    growth: 8,
    technology: 7,
    ai_readiness: 7,
    financial: 8,
  };
}
