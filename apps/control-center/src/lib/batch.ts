// Controlled batch demo building: up to 10 selected, qualified leads at a time.
//
// The rules, each tested (batch.test.ts):
//   * at most MAX_BATCH leads; a larger selection is refused, not trimmed;
//   * only qualified leads in a vertical that has a template are built; the
//     rest are listed with the reason on the confirmation screen;
//   * a lead missing a fact its vertical requires is "Needs information" and
//     is not built;
//   * template copy only: a batch never calls Claude, whatever is configured;
//   * each lead is built on its own, so one failure never stops the rest;
//   * buildDemo never moves a lead backwards in the pipeline;
//   * nothing is published, sent or registered.

import {
  effectiveQualification,
  normalizePhone,
  type Prospect,
} from "@hl-bos/presence-scanner";
import { isSiteVertical, verticalDef } from "@hl-bos/site-builder";

import { buildDemo, type DemoDeps } from "./demo";

export const MAX_BATCH = 10;

export type BatchStatus = "queued" | "building" | "completed" | "needs_info" | "failed";

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  queued: "Queued",
  building: "Building",
  completed: "Completed",
  needs_info: "Needs information",
  failed: "Failed",
};

export interface BatchPlan {
  /** Plain-English reason the whole batch cannot run, if any. */
  error: string | undefined;
  /** Will be built, in this order. */
  build: { id: string; name: string; vertical: string }[];
  /** Selected but will not be built: needs a fact first. */
  needsInfo: { id: string; name: string; reason: string }[];
  /** Selected but not eligible. */
  excluded: { id: string; name: string; reason: string }[];
}

/** Which facts a lead lacks for its vertical (empty = ready to build). */
export function missingFacts(p: Prospect): string[] {
  if (!isSiteVertical(p.vertical)) return [];
  const out: string[] = [];
  const phone = normalizePhone(p.corrections.phone ?? p.phone);
  const email = p.corrections.email ?? p.email;
  for (const r of verticalDef(p.vertical).requiredFacts) {
    if (r === "name" && !p.name.trim()) out.push("a business name");
    if (r === "contact" && !(phone && phone.length === 10) && !email)
      out.push("a phone number or email address");
    if (r === "city" && !p.address && !p.market.label) out.push("a town");
  }
  return out;
}

export function planBatch(ids: string[], leads: Prospect[]): BatchPlan {
  const unique = [...new Set(ids.filter(Boolean))];
  const plan: BatchPlan = { error: undefined, build: [], needsInfo: [], excluded: [] };
  if (unique.length === 0) {
    plan.error = "No leads were selected.";
    return plan;
  }
  if (unique.length > MAX_BATCH) {
    plan.error = `${unique.length} leads were selected; a batch builds at most ${MAX_BATCH}. Select fewer and try again.`;
    return plan;
  }
  const byId = new Map(leads.map((p) => [p.id, p]));
  for (const id of unique) {
    const p = byId.get(id);
    if (!p) {
      plan.excluded.push({ id, name: id, reason: "Lead not found." });
      continue;
    }
    if (!isSiteVertical(p.vertical)) {
      plan.excluded.push({
        id,
        name: p.name,
        reason: "No demo template for this vertical yet.",
      });
      continue;
    }
    if (effectiveQualification(p.qualification) !== "qualified") {
      plan.excluded.push({ id, name: p.name, reason: "Not qualified." });
      continue;
    }
    if (p.notes.some((n) => n.text.startsWith("HLG-owned business"))) {
      plan.excluded.push({
        id,
        name: p.name,
        reason: "HLG-owned business: use its Business Profile instead.",
      });
      continue;
    }
    const missing = missingFacts(p);
    if (missing.length) {
      plan.needsInfo.push({
        id,
        name: p.name,
        reason: `Needs ${missing.join(" and ")}.`,
      });
      continue;
    }
    plan.build.push({ id, name: p.name, vertical: p.vertical });
  }
  return plan;
}

export interface BatchItemResult {
  id: string;
  name: string;
  status: Exclude<BatchStatus, "queued" | "building">;
  message: string;
  version: number | undefined;
  /** How long the build took, end to end. */
  ms: number | undefined;
}

/** Build one lead's demo for a batch: template copy only; errors become "Failed". */
export async function buildBatchItem(
  id: string,
  deps: DemoDeps,
): Promise<BatchItemResult> {
  const lead = await deps.leads.getProspect(id);
  const name = lead?.name ?? id;
  if (lead) {
    const missing = missingFacts(lead);
    if (missing.length)
      return {
        id,
        name,
        status: "needs_info",
        message: `Needs ${missing.join(" and ")}.`,
        version: undefined,
        ms: undefined,
      };
  }
  try {
    const r = await buildDemo(id, { ...deps, writer: null });
    if (!r.ok)
      return {
        id,
        name,
        status: "failed",
        message: r.headline,
        version: undefined,
        ms: undefined,
      };
    const d = await deps.drafts.getByProspect(id);
    return {
      id,
      name,
      status: "completed",
      message: r.headline,
      version: d?.version,
      ms: d?.buildMs,
    };
  } catch (e) {
    return {
      id,
      name,
      status: "failed",
      message: `Not built: ${e instanceof Error ? e.message : String(e)}`,
      version: undefined,
      ms: undefined,
    };
  }
}

export interface BatchRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  actor: string;
  items: BatchItemResult[];
  summary: string;
}

export function summarize(items: BatchItemResult[]): string {
  const n = (s: BatchItemResult["status"]) =>
    items.filter((i) => i.status === s).length;
  const built = items.filter((i) => i.status === "completed");
  const ms = built.reduce((a, i) => a + (i.ms ?? 0), 0);
  return `${n("completed")} built, ${n("needs_info")} need information, ${n("failed")} failed${built.length ? ` (${(ms / 1000).toFixed(1)} s of build time)` : ""}. Template copy only. Nothing was published or sent.`;
}

/** Run a whole planned batch, one lead at a time, reporting each status as it changes. */
export async function runBatch(
  ids: string[],
  deps: DemoDeps,
  onStatus: (id: string, status: BatchStatus) => void = () => {},
): Promise<BatchRun | { error: string }> {
  const plan = planBatch(ids, await deps.leads.listProspects());
  if (plan.error) return { error: plan.error };
  const startedAt = deps.now().toISOString();
  const items: BatchItemResult[] = plan.needsInfo.map((x) => ({
    ...x,
    status: "needs_info" as const,
    message: x.reason,
    version: undefined,
    ms: undefined,
  }));
  for (const b of plan.build) onStatus(b.id, "queued");
  for (const b of plan.build) {
    onStatus(b.id, "building");
    const r = await buildBatchItem(b.id, deps);
    onStatus(b.id, r.status);
    items.push(r);
  }
  return {
    id: deps.newId(),
    startedAt,
    finishedAt: deps.now().toISOString(),
    actor: deps.actor,
    items,
    summary: summarize(items),
  };
}
