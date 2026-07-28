// Deterministic transformation roadmap. Each finding is placed in exactly one
// bucket (Immediate / Short / Medium / Long) from its timeline, and every
// placement carries a justification. No finding is placed without a reason.

import type { Finding, Roadmap, RoadmapItem, TimelineBucket } from "./types.ts";

const BUCKET_LABEL: Record<TimelineBucket, string> = {
  immediate: "Immediate (0–30 days)",
  short_term: "Short-Term (30–90 days)",
  medium_term: "Medium-Term (3–6 months)",
  long_term: "Long-Term (6–12 months)",
};

function justify(f: Finding): string {
  const diff = `${f.difficulty} implementation difficulty`;
  if (f.timeline === "immediate")
    return `Placed Immediate: ${f.priority} priority (rated ${f.rating}/5) with ${diff} — address now.`;
  if (f.timeline === "short_term")
    return `Placed Short-Term: ${f.priority} priority with ${diff} — sequence within the quarter.`;
  if (f.timeline === "medium_term")
    return `Placed Medium-Term: ${diff} requires planning and dependencies before execution.`;
  return `Placed Long-Term: ${diff} and strategic scope make this a 6–12 month initiative.`;
}

export function buildRoadmap(findings: Finding[]): Roadmap {
  const buckets: Record<TimelineBucket, RoadmapItem[]> = {
    immediate: [],
    short_term: [],
    medium_term: [],
    long_term: [],
  };
  for (const f of findings) {
    buckets[f.timeline].push({
      dimension: f.dimension,
      label: f.label,
      priority: f.priority,
      difficulty: f.difficulty,
      action: f.recommendedAction,
      justification: justify(f),
    });
  }
  return {
    immediate: buckets.immediate,
    shortTerm: buckets.short_term,
    mediumTerm: buckets.medium_term,
    longTerm: buckets.long_term,
  };
}

export { BUCKET_LABEL };
