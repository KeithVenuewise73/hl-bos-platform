// Deterministic HL-BTI engagement stage machine — canonical mirror of the DB
// authority `bti.advance_stage` and the edge `_shared/bti/lifecycle.ts`. Encodes
// the ordered lifecycle and the hard Venuewise ANALYSIS-ONLY cap.

import type { Stage, EngagementMode } from "./types.ts";

export const ORDER: Stage[] = [
  "prospect",
  "lead_qualification",
  "business_discovery",
  "assessment",
  "executive_analysis",
  "blueprint",
  "proposal",
  "customer_approval",
  "implementation",
  "project_management",
  "roi_tracking",
  "monthly_partnership",
];

export const SIDE_STATES: Stage[] = ["declined", "on_hold"];

export const STAGE_LABELS: Record<Stage, string> = {
  prospect: "Prospect",
  lead_qualification: "Lead Qualification",
  business_discovery: "Business Discovery",
  assessment: "Assessment",
  executive_analysis: "Executive Analysis",
  blueprint: "Transformation Blueprint",
  proposal: "Proposal",
  customer_approval: "Customer Approval",
  implementation: "Implementation",
  project_management: "Project Management",
  roi_tracking: "ROI Tracking",
  monthly_partnership: "Monthly Partnership",
  declined: "Declined",
  on_hold: "On Hold",
};

export function stageRank(stage: Stage): number {
  const i = ORDER.indexOf(stage);
  return i < 0 ? 0 : i + 1;
}

// The analysis-only cap: 'blueprint' (rank 6). Analysis-only engagements
// (e.g. Venuewise) may not advance past it — HL-BTI advises only.
export const ANALYSIS_ONLY_CAP_RANK = stageRank("blueprint");

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: "analysis_only_cap" | "not_one_step" | "from_side_state" };

export function canAdvance(
  from: Stage,
  to: Stage,
  mode: EngagementMode,
): TransitionResult {
  if (SIDE_STATES.includes(to)) return { ok: true };
  const toRank = stageRank(to);
  if (mode === "analysis_only" && toRank > ANALYSIS_ONLY_CAP_RANK) {
    return { ok: false, code: "analysis_only_cap" };
  }
  const fromRank = stageRank(from);
  if (fromRank === 0) return { ok: false, code: "from_side_state" };
  if (toRank !== fromRank + 1) return { ok: false, code: "not_one_step" };
  return { ok: true };
}

export function nextStage(from: Stage, mode: EngagementMode): Stage | null {
  const fromRank = stageRank(from);
  if (fromRank === 0 || fromRank >= ORDER.length) return null;
  const next = ORDER[fromRank];
  if (next === undefined) return null;
  if (mode === "analysis_only" && stageRank(next) > ANALYSIS_ONLY_CAP_RANK) return null;
  return next;
}

// Whether an analysis-only engagement is barred from a capability (delivery,
// ROI, proposal). Mirrors the DB RPCs' refusal.
export function analysisOnlyBlocks(mode: EngagementMode): boolean {
  return mode === "analysis_only";
}
