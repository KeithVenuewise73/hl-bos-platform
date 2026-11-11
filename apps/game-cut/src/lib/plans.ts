import "server-only";

import type { Analysis, HighlightPlanResult, Quality } from "@hl-bos/game-cut";

/**
 * Plans waiting to be made. A plan is the whole result of the (slow) looking
 * step; making the video later reuses it instead of looking again. Kept in
 * memory only, and only the last few: a restart simply means "look again".
 */

export type StoredPlan =
  | {
      readonly kind: "broadcast";
      readonly id: string;
      readonly fileA: string;
      readonly fileB: string;
      readonly analysis: Analysis;
    }
  | {
      readonly kind: "times";
      readonly id: string;
      readonly fileA: string;
      /** Null with one camera. */
      readonly fileB: string | null;
      readonly plan: HighlightPlanResult;
    };

const KEEP = 5;
const g = globalThis as unknown as {
  __gameCutPlans?: Map<string, StoredPlan>;
  __gameCutPlanN?: number;
};
const store = (g.__gameCutPlans ??= new Map<string, StoredPlan>());

export function newPlanId(): string {
  g.__gameCutPlanN = (g.__gameCutPlanN ?? 0) + 1;
  return `plan-${g.__gameCutPlanN}`;
}

export function savePlan(p: StoredPlan): void {
  store.set(p.id, p);
  while (store.size > KEEP) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function getPlan(id: string): StoredPlan | undefined {
  return store.get(id);
}

export type { Quality };
