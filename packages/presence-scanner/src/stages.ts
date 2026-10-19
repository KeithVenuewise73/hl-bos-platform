// Lead stages, and how they map onto the EXISTING HL-BOS prospect stages
// (visibility.prospect_stage in migration 0017:
//   'prospect','assessed','proposed','client','lost').
//
// The finer Presence Scanner stages are a view over those five, not a second
// workflow: when leads move into visibility.prospects, each stage lands on
// exactly one existing value, and nothing in the database has to change.

import type { AuditEntry, LeadStage, Prospect } from "./types.ts";

export const LEAD_STAGES: { key: LeadStage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "reviewed", label: "Reviewed" },
  { key: "qualified", label: "Qualified" },
  { key: "demo_requested", label: "Demo requested" },
  { key: "demo_built", label: "Demo built" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "proposal", label: "Proposal" },
  { key: "client", label: "Client" },
  { key: "lost", label: "Lost" },
  { key: "disqualified", label: "Disqualified" },
];

export type HlbosProspectStage =
  "prospect" | "assessed" | "proposed" | "client" | "lost";

export const STAGE_TO_HLBOS: Record<LeadStage, HlbosProspectStage> = {
  new: "prospect",
  reviewed: "prospect",
  qualified: "assessed",
  demo_requested: "assessed",
  demo_built: "assessed",
  contacted: "assessed",
  interested: "assessed",
  proposal: "proposed",
  client: "client",
  lost: "lost",
  disqualified: "lost",
};

export function stageLabel(s: LeadStage): string {
  return LEAD_STAGES.find((x) => x.key === s)?.label ?? s;
}

const ORDER: LeadStage[] = LEAD_STAGES.map((s) => s.key).filter(
  (s) => s !== "lost" && s !== "disqualified",
);

/**
 * Allowed moves. Forward along the pipeline one or more steps (a reviewer may
 * skip, e.g. Reviewed -> Contacted), back one step to correct a slip, to Lost
 * or Disqualified from any open stage, and Lost/Disqualified may be reopened
 * to Reviewed. A Client is final except for Lost.
 */
export function canTransition(from: LeadStage, to: LeadStage): boolean {
  if (from === to) return false;
  if (from === "client") return to === "lost";
  if (from === "lost" || from === "disqualified") return to === "reviewed";
  if (to === "lost" || to === "disqualified") return true;
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  return b > a || b === a - 1;
}

export class StageTransitionError extends Error {
  constructor(from: LeadStage, to: LeadStage) {
    super(`A lead cannot move from ${stageLabel(from)} to ${stageLabel(to)}.`);
    this.name = "StageTransitionError";
  }
}

export function transitionStage(
  p: Prospect,
  to: LeadStage,
  by: string,
  note: string,
  now: Date,
): Prospect {
  if (!canTransition(p.stage, to)) throw new StageTransitionError(p.stage, to);
  const entry: AuditEntry = {
    at: now.toISOString(),
    by,
    action: "stage",
    detail: `${stageLabel(p.stage)} → ${stageLabel(to)}${note.trim() ? `: ${note.trim()}` : ""}`,
  };
  return { ...p, stage: to, audit: [...p.audit, entry] };
}
