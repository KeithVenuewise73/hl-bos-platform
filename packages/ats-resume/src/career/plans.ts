/**
 * Plans, entitlements and server-side usage limits.
 *
 * Prices here are RECOMMENDATIONS, not approved launch prices, and paid
 * checkout is disabled until a payment provider is connected and the prices
 * are approved. The pilot plan is what every account gets today.
 */

import { newId, now } from "../text.ts";
import type { UUID } from "../types.ts";
import type { MeteredAction, UsageEvent } from "./types.ts";

export type PlanId = "pilot" | "essentials" | "pro";

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  /** Monthly limits per metered action. Missing means not limited. */
  readonly monthlyLimits: Partial<Record<MeteredAction, number>>;
  /** Recommended price in USD per month. Not charged while checkoutEnabled is false. */
  readonly recommendedMonthlyUsd: number | null;
  readonly checkoutEnabled: false;
  readonly description: string;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  pilot: {
    id: "pilot",
    name: "Pilot",
    monthlyLimits: {
      resume_upload: 10,
      base_resume_draft: 20,
      discovery_run: 60,
      job_import: 100,
      package_generation: 40,
      practice_answer: 200,
      linkedin_generation: 30,
    },
    recommendedMonthlyUsd: null,
    checkoutEnabled: false,
    description: "Invited pilot users. No charge.",
  },
  essentials: {
    id: "essentials",
    name: "Essentials (recommended, not live)",
    monthlyLimits: {
      package_generation: 15,
      practice_answer: 60,
      linkedin_generation: 10,
      discovery_run: 60,
      job_import: 60,
    },
    recommendedMonthlyUsd: 19,
    checkoutEnabled: false,
    description: "Base resume, job tracking, 15 tailored application packages a month.",
  },
  pro: {
    id: "pro",
    name: "Pro (recommended, not live)",
    monthlyLimits: {
      package_generation: 60,
      practice_answer: 300,
      linkedin_generation: 40,
      discovery_run: 120,
      job_import: 200,
    },
    recommendedMonthlyUsd: 39,
    checkoutEnabled: false,
    description:
      "Active searchers: 60 packages a month, unlimited practice within fair use, LinkedIn content calendar.",
  },
};

/**
 * Estimated cost of one action by engine. The rules engine makes no paid
 * calls. The Claude figures are PLACEHOLDERS, not quotes: the career flow does
 * not call Claude today, and these must be replaced with measured cost before
 * it does.
 */
export const COST_PER_ACTION_USD: Readonly<
  Record<string, Partial<Record<MeteredAction, number>>>
> = {
  "rules-engine": {},
  claude: {
    package_generation: 0.12,
    base_resume_draft: 0.05,
    practice_answer: 0.02,
    linkedin_generation: 0.04,
    job_import: 0.03,
  },
};

export function estimateCost(action: MeteredAction, engine: string): number {
  const table = engine.startsWith("claude")
    ? COST_PER_ACTION_USD["claude"]
    : COST_PER_ACTION_USD["rules-engine"];
  return table?.[action] ?? 0;
}

export function monthKey(at: string): string {
  return at.slice(0, 7);
}

export interface Allowance {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number | null;
  readonly message: string;
}

export function checkAllowance(
  plan: Plan,
  usage: readonly UsageEvent[],
  action: MeteredAction,
  at = now(),
): Allowance {
  const limit = plan.monthlyLimits[action] ?? null;
  const month = monthKey(at);
  const used = usage.filter(
    (u) => u.action === action && monthKey(u.createdAt) === month,
  ).length;
  if (limit === null)
    return { allowed: true, used, limit, message: "Not limited on your plan." };
  if (used >= limit)
    return {
      allowed: false,
      used,
      limit,
      message: `You have used all ${limit} of this month's ${action.replace(/_/g, " ")} allowance on the ${plan.name} plan. It resets on the 1st.`,
    };
  return {
    allowed: true,
    used,
    limit,
    message: `${used} of ${limit} used this month.`,
  };
}

export function usageEvent(
  profileId: UUID,
  action: MeteredAction,
  engine: string,
): UsageEvent {
  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId,
    action,
    engine,
    estimatedCostUsd: estimateCost(action, engine),
  };
}

export function usageSummary(usage: readonly UsageEvent[], at = now()) {
  const month = monthKey(at);
  const thisMonth = usage.filter((u) => monthKey(u.createdAt) === month);
  const byAction = new Map<MeteredAction, number>();
  for (const u of thisMonth) byAction.set(u.action, (byAction.get(u.action) ?? 0) + 1);
  return {
    month,
    events: thisMonth.length,
    estimatedCostUsd:
      Math.round(thisMonth.reduce((s, u) => s + u.estimatedCostUsd, 0) * 100) / 100,
    byAction: [...byAction.entries()],
  };
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Refuse anything that is not a small PDF or DOCX, checked by content, not just name. */
export function validateResumeUpload(name: string, bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "The file is empty.";
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return "Resume files are limited to 5 MB.";
  const lower = name.toLowerCase();
  const isPdf =
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // PK — DOCX is a zip
  if (lower.endsWith(".pdf"))
    return isPdf ? null : "That file is named .pdf but is not a PDF.";
  if (lower.endsWith(".docx"))
    return isZip ? null : "That file is named .docx but is not a Word document.";
  return "Upload a PDF or a Word (.docx) file, or paste the text instead.";
}
