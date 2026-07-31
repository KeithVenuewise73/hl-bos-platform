/**
 * CEO Approval gating — "AI approves nothing."
 *
 * The engine is advisory. It never authorises spend, deployment, a migration, or
 * a commercial commitment. For every actionable recommendation it instead emits
 * the explicit human approval(s) required to act, each naming the gate that
 * enforces it (the reusable workflows human-approval-gate). This is deterministic
 * authority: the same recommendation always yields the same required approvals.
 */

import type { EngineConfig } from "./config";
import type { FactoryReuse } from "./factory";

export type ApprovalType =
  | "none"
  | "ceo_commercial_terms"
  | "ceo_deploy"
  | "ceo_migration"
  | "ceo_spend"
  | "ceo_data_access";

export interface ApprovalRequirement {
  required: boolean;
  type: ApprovalType;
  reason: string;
  /** The gate that enforces it (a workflow / ops control), never the AI. */
  gate: string;
}

const HUMAN_GATE = "workflows.human_approval_gate";

/** The approvals required to act on a product/service recommendation. */
export function approvalsForRecommendation(reuse: FactoryReuse): ApprovalRequirement[] {
  const out: ApprovalRequirement[] = [];

  // Any HL product/service carries pending commercial terms (pricing is CEO-only).
  out.push({
    required: true,
    type: "ceo_commercial_terms",
    reason:
      "Pricing, licensing and ownership are pending CEO decisions; they must be set before this can be sold or committed.",
    gate: HUMAN_GATE,
  });

  // Acting on it means deploying — the runtime is a CEO/ops gate today.
  out.push({
    required: true,
    type: "ceo_deploy",
    reason:
      "Delivery requires switching on / deploying platform runtime, which is a CEO/ops gate.",
    gate: `${HUMAN_GATE} + ops`,
  });

  // A net-new or heavy build implies new schema → an approval-gated migration.
  if (reuse.buildEffort === "high" || reuse.buildEffort === "new_build") {
    out.push({
      required: true,
      type: "ceo_migration",
      reason:
        "This build likely introduces new database schema; no migration is applied without explicit CEO approval.",
      gate: `${HUMAN_GATE} + migration approval`,
    });
  }

  return out;
}

/** A CEO spend approval, required above the configured reference threshold. */
export function spendApproval(
  monthlyValue: number | null,
  config: EngineConfig,
): ApprovalRequirement {
  if (monthlyValue === null) {
    return {
      required: true,
      type: "ceo_spend",
      reason:
        "Spend commitment required, but the amount is unquantified (financial inputs missing).",
      gate: HUMAN_GATE,
    };
  }
  const required = monthlyValue >= config.approval.ceoSpendThreshold;
  return {
    required,
    type: required ? "ceo_spend" : "none",
    reason: required
      ? `Estimated commitment (${monthlyValue}/mo) is at or above the CEO spend threshold.`
      : "Below the CEO spend threshold.",
    gate: HUMAN_GATE,
  };
}

/** De-duplicate approvals by type, keeping the first occurrence. */
export function dedupeApprovals(items: ApprovalRequirement[]): ApprovalRequirement[] {
  const seen = new Set<ApprovalType>();
  const out: ApprovalRequirement[] = [];
  for (const a of items) {
    if (!a.required || a.type === "none") continue;
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    out.push(a);
  }
  return out;
}
