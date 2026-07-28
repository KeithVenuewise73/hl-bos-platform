// Deterministic HL-BTI engagement stage machine — the edge mirror of the DB
// authority `bti.advance_stage` / `bti._stage_rank`. It encodes the ordered
// customer transformation lifecycle and the hard Venuewise ANALYSIS-ONLY cap.
//
// This is advisory UI logic only: the DB remains the enforcement point (a
// SECURITY DEFINER RPC with permission checks). The two must agree.

export const BTI_LIFECYCLE_VERSION = "bti-lifecycle-0.1.0";

export type Stage =
  | "prospect"
  | "lead_qualification"
  | "business_discovery"
  | "assessment"
  | "executive_analysis"
  | "blueprint"
  | "proposal"
  | "customer_approval"
  | "implementation"
  | "project_management"
  | "roi_tracking"
  | "monthly_partnership"
  | "declined"
  | "on_hold";

export type Mode = "full_transformation" | "analysis_only";

const ORDER: Stage[] = [
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

const SIDE_STATES: Stage[] = ["declined", "on_hold"];

// Rank of an ordered stage (1-based); side states rank 0.
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

// Pure predicate mirroring the DB rules. Side states are always reachable.
export function canAdvance(from: Stage, to: Stage, mode: Mode): TransitionResult {
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

// The next forward stage available, or null if capped/terminal.
export function nextStage(from: Stage, mode: Mode): Stage | null {
  const fromRank = stageRank(from);
  if (fromRank === 0 || fromRank >= ORDER.length) return null;
  const next = ORDER[fromRank]; // ORDER is 0-based; fromRank is 1-based → next
  if (mode === "analysis_only" && stageRank(next) > ANALYSIS_ONLY_CAP_RANK) return null;
  return next;
}
