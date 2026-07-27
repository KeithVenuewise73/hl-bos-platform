// Transparent prioritization model (Business Transformation Blueprint).
//
// Maps a set of named factors to one of five clear bands. It deliberately
// avoids false mathematical precision: the output is a CATEGORY, and the exact
// factors + model version that produced it are retained for traceability. No
// hidden magic number is presented to the customer as if it were exact.

import type { PriorityBand, Severity, EffortBand } from "./rules.ts";

export const PRIORITY_MODEL_VERSION = "priority-0.1.0";

export type Urgency = "immediate" | "near_term" | "planned" | "monitor";

export interface PriorityFactors {
  severity: Severity;
  urgency?: Urgency;
  confidence?: number; // 0–1
  effort?: EffortBand;
  dependencyOrder?: number; // lower = earlier
  revenueOpportunity?: "low" | "medium" | "high";
  customerExperienceImpact?: "low" | "medium" | "high";
  operationalEfficiencyImpact?: "low" | "medium" | "high";
  riskReduction?: "low" | "medium" | "high";
  growthEnablement?: "low" | "medium" | "high";
}

export interface PriorityResult {
  band: PriorityBand;
  factors: PriorityFactors;
  modelVersion: string;
  rationale: string;
}

const SEVERITY_BASE: Record<Severity, PriorityBand> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  info: "low",
};

const ORDER: PriorityBand[] = ["future", "low", "medium", "high", "critical"];

function bump(band: PriorityBand, steps: number): PriorityBand {
  const i = ORDER.indexOf(band);
  const j = Math.max(0, Math.min(ORDER.length - 1, i + steps));
  return ORDER[j];
}

/**
 * Derive a priority band from the factors. Severity sets the base; urgency and
 * a high revenue/risk signal can raise it; very low confidence lowers it. The
 * result is categorical on purpose — see the Priority Model spec.
 */
export function prioritize(factors: PriorityFactors): PriorityResult {
  let band = SEVERITY_BASE[factors.severity];
  const reasons: string[] = [`severity=${factors.severity}`];

  if (factors.urgency === "immediate") {
    band = bump(band, 1);
    reasons.push("urgency=immediate");
  } else if (factors.urgency === "monitor") {
    band = bump(band, -1);
    reasons.push("urgency=monitor");
  }

  if (factors.revenueOpportunity === "high" || factors.riskReduction === "high") {
    band = bump(band, 1);
    reasons.push("high revenue/risk signal");
  }

  if (typeof factors.confidence === "number" && factors.confidence < 0.4) {
    band = bump(band, -1);
    reasons.push("low confidence");
  }

  return {
    band,
    factors,
    modelVersion: PRIORITY_MODEL_VERSION,
    rationale: reasons.join("; "),
  };
}

/**
 * Order items for a roadmap: earlier dependencyOrder first, then by band
 * (critical → future). Stable so equal items keep input order.
 */
export function orderByPriority<
  T extends { priority: PriorityResult; dependencyOrder?: number },
>(items: T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const da = a.it.dependencyOrder ?? a.it.priority.factors.dependencyOrder ?? 1e9;
      const db = b.it.dependencyOrder ?? b.it.priority.factors.dependencyOrder ?? 1e9;
      if (da !== db) return da - db;
      const ba = ORDER.indexOf(a.it.priority.band);
      const bb = ORDER.indexOf(b.it.priority.band);
      if (ba !== bb) return bb - ba; // higher band first
      return a.i - b.i;
    })
    .map((x) => x.it);
}
