// Roadmap builder (Business Transformation Blueprint).
//
// Turns prioritized recommendations into a sequenced, phased roadmap. Phases
// come from the CONFIGURABLE phase catalog (discovery.roadmap_phases) — they
// are passed in, never hard-coded here. Critical/immediate items are sequenced
// before the items that depend on them.

import type { Recommendation } from "./rules.ts";
import {
  orderByPriority,
  prioritize,
  type PriorityResult,
  type Urgency,
} from "./priority.ts";

export interface Phase {
  key: string;
  name: string;
  defaultSequence: number;
  isActive?: boolean;
}

export interface RoadmapItem {
  sequence: number;
  phaseKey: string;
  objective: string;
  recommendedAction?: string;
  estimatedEffort?: Recommendation["effortBand"];
  dependsOnSequences: number[];
  relatedRecommendationTitles: string[];
  priority: PriorityResult;
}

// Map a recommendation's severity/affected dimensions to a default phase key.
// The mapping only references phases the caller actually supplied.
function pickPhase(rec: Recommendation, phaseKeys: Set<string>): string {
  const affected = rec.affectedDimensions ?? [];
  const prefer = (k: string) => (phaseKeys.has(k) ? k : undefined);
  if (rec.severity === "critical")
    return prefer("immediate_stabilization") ?? firstOf(phaseKeys);
  if (affected.includes("security") || affected.includes("digital_presence"))
    return prefer("digital_foundation") ?? firstOf(phaseKeys);
  if (affected.includes("marketing") || affected.includes("sales"))
    return prefer("customer_acquisition") ?? firstOf(phaseKeys);
  if (affected.includes("communications") || affected.includes("customer_experience"))
    return prefer("customer_experience") ?? firstOf(phaseKeys);
  if (affected.includes("automation"))
    return prefer("operational_automation") ?? firstOf(phaseKeys);
  if (affected.includes("ai_adoption"))
    return prefer("ai_enablement") ?? firstOf(phaseKeys);
  if (affected.includes("analytics"))
    return prefer("analytics_optimization") ?? firstOf(phaseKeys);
  return prefer("digital_foundation") ?? firstOf(phaseKeys);
}

function firstOf(keys: Set<string>): string {
  return [...keys][0] ?? "digital_foundation";
}

const urgencyFor = (rec: Recommendation): Urgency =>
  rec.severity === "critical"
    ? "immediate"
    : rec.severity === "high"
      ? "near_term"
      : "planned";

/**
 * Build a sequenced roadmap from recommendations. Phases order the timeline by
 * their defaultSequence; within the timeline, higher-priority items come first,
 * and an item is marked as depending on any earlier item in an earlier phase.
 */
export function buildRoadmap(recs: Recommendation[], phases: Phase[]): RoadmapItem[] {
  const active = phases.filter((p) => p.isActive !== false);
  const phaseOrder = new Map(active.map((p) => [p.key, p.defaultSequence]));
  const phaseKeys = new Set(active.map((p) => p.key));

  const enriched = recs.map((rec) => {
    const priority = prioritize({
      severity: rec.severity,
      urgency: urgencyFor(rec),
      confidence: rec.confidence,
      effort: rec.effortBand,
    });
    const phaseKey = pickPhase(rec, phaseKeys);
    return { rec, priority, phaseKey, phaseSeq: phaseOrder.get(phaseKey) ?? 999 };
  });

  // order primarily by phase sequence, then by priority within the phase
  const ordered = orderByPriority(
    enriched.map((e) => ({ ...e, dependencyOrder: e.phaseSeq })),
  );

  const items: RoadmapItem[] = [];
  let seq = 0;
  for (const e of ordered) {
    seq += 1;
    // depends on earlier items that are in a strictly earlier phase
    const dependsOn = items
      .filter((it) => (phaseOrder.get(it.phaseKey) ?? 0) < e.phaseSeq)
      .map((it) => it.sequence);
    items.push({
      sequence: seq,
      phaseKey: e.phaseKey,
      objective: e.rec.title,
      recommendedAction: e.rec.title,
      estimatedEffort: e.rec.effortBand,
      dependsOnSequences: dependsOn,
      relatedRecommendationTitles: [e.rec.title],
      priority: e.priority,
    });
  }
  return items;
}
