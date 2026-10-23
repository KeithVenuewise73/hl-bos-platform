/**
 * Renders the full Transformation Pipeline state as an executive-readable plan.
 * A faithful projection — every line traces to the pipeline state; nothing is
 * computed or fabricated here.
 */

import { CAPABILITIES } from "./capabilities.ts";
import type { ImplementationTask, PipelineState } from "./types.ts";

export function renderPipeline(s: PipelineState): string {
  const L: string[] = [];
  const task = (id: string): ImplementationTask | undefined =>
    s.tasks.find((t) => t.id === id);

  L.push(`HERMAN LEGACY DIGITAL — TRANSFORMATION PIPELINE`);
  L.push(`Client: ${s.client}`);
  L.push("=".repeat(72));
  L.push(
    `Stages 1–4 (BTI analysis): output ${s.ledger.output}, confidence ${s.ledger.confidence}.`,
  );
  L.push("");

  L.push(`STAGE 5 — EXECUTIVE REVIEW`);
  L.push(`  decision: ${s.review.decision}`);
  L.push(`  ${s.review.rationale}`);
  L.push(
    `  full roadmap unlocked: ${s.review.fullRoadmapUnlocked ? "yes" : "no (gated)"}`,
  );
  L.push("");

  L.push(`STAGE 6 — TRANSFORMATION PLAN (${s.tasks.length} executable tasks)`);
  for (const t of s.tasks) {
    L.push(`  [${t.status}] ${t.id} — ${t.title}`);
    L.push(
      `      source: ${t.source}   ·   executes via: ${CAPABILITIES[t.capability].name}`,
    );
    L.push(`      done when: ${t.acceptanceCriteria}`);
    if (t.dependsOn.length)
      L.push(
        `      depends on: ${t.dependsOn.map((d) => task(d)?.title ?? d).join("; ")}`,
      );
    if (t.feedsReanalysis) L.push(`      ↻ feeds the next BTI analysis`);
  }
  if (s.tasks.length === 0)
    L.push(`  (no tasks — the executive decision was ${s.review.decision})`);
  L.push("");

  L.push(`STAGE 7 — CAPABILITY MAPPING (which HLD capability executes each task)`);
  const byCap = new Map<string, string[]>();
  for (const t of s.tasks) {
    const cap = CAPABILITIES[t.capability].name;
    byCap.set(cap, [...(byCap.get(cap) ?? []), t.id]);
  }
  for (const [cap, taskIds] of byCap) L.push(`  ${cap}: ${taskIds.join(", ")}`);
  L.push("");

  L.push(`STAGE 8 — IMPLEMENTATION ROADMAP`);
  for (const p of s.roadmap) {
    L.push(`  ${p.title}${p.gated ? "  [GATED]" : ""}`);
    L.push(`    ${p.intent}`);
    if (p.gated && p.unlockCondition) L.push(`    unlock: ${p.unlockCondition}`);
    for (const id of p.taskIds) L.push(`    - ${id}: ${task(id)?.title ?? id}`);
    if (!p.gated && p.taskIds.length === 0) L.push(`    (no tasks in this phase)`);
  }
  L.push("");

  L.push(`STAGE 9 — PROGRESS TRACKING`);
  const pr = s.progress;
  L.push(
    `  ${pr.done}/${pr.total} done (${pr.percentComplete}%) · in-progress ${pr.inProgress} · blocked ${pr.blocked} · not-started ${pr.notStarted}`,
  );
  L.push("");

  L.push(`STAGE 10 — SUCCESS MEASUREMENT`);
  if (s.measurement.contract) {
    L.push(`  target: ${s.measurement.contract.targetOutcome}`);
    L.push(`  verdict: ${s.measurement.verdict} — ${s.measurement.note}`);
  } else {
    L.push(`  ${s.measurement.note}`);
  }
  L.push("");

  L.push(`STAGE 11 — CONTINUOUS TRANSFORMATION`);
  L.push(`  rerun when: ${s.continuous.rerunWhen}`);
  L.push(`  what unlocks next: ${s.continuous.whatWouldUnlockNext}`);

  return L.join("\n");
}
