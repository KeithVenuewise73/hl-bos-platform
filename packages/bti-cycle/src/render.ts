/**
 * Render a Reasoning Ledger as a plain-language Executive Review artifact.
 *
 * The artifact is not the product — it is a faithful projection of the Ledger.
 * Every line traces to a Ledger field; nothing here computes or decides. If it
 * is not in the Ledger, it does not appear here.
 */

import type {
  PermittedOutput,
  ReasoningLedger,
  TransformationOption,
} from "./types.ts";

const OUTPUT_LABEL: Record<PermittedOutput, string> = {
  recommendation: "RECOMMENDATION",
  revise_goal: "REVISE THE GOAL",
  collect_more_evidence: "COLLECT MORE EVIDENCE (provisional lead attached)",
  no_transformation: "NO TRANSFORMATION NOW",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  verified: "HIGH (verified)",
  observed: "MEDIUM-HIGH (observed)",
  estimated: "MEDIUM (estimated)",
  assumed: "LOW (assumed)",
  unknown: "LOW (unconfirmed — no load-bearing evidence)",
};

export function renderLedger(l: ReasoningLedger): string {
  const lines: string[] = [];
  const opt = (id: string | null): TransformationOption | undefined =>
    l.options.find((o) => o.id === id) ?? undefined;

  lines.push(`BTI REASONING LEDGER — ${l.business}`);
  lines.push(`Engagement ${l.engagementId}`);
  lines.push("=".repeat(64));
  lines.push(`OUTPUT: ${OUTPUT_LABEL[l.output]}`);
  lines.push(`Confidence: ${CONFIDENCE_LABEL[l.confidence] ?? l.confidence}`);
  lines.push(
    `Lifecycle: ${l.lifecycle}   Stability: ${l.stability.score}/100 — ${l.stability.fragility}`,
  );
  lines.push("");

  lines.push(`GOAL: ${l.goal.statement}`);
  lines.push(
    `  metric: ${l.goal.metric}${l.goal.target !== undefined ? `  target: ${l.goal.target} ${l.goal.unit ?? ""}` : ""}`,
  );
  if (l.goal.guardrail) lines.push(`  guardrail: ${l.goal.guardrail}`);
  lines.push("");

  lines.push(`1. DISCOVERED: ${l.discovered}`);
  lines.push("");

  lines.push(`2. EVIDENCE (${l.evidence.length} items):`);
  for (const e of l.evidence) {
    const flags = e.flags?.length ? ` {${e.flags.join(",")}}` : "";
    lines.push(`   - [${e.quality}${flags}] (${e.link}) ${e.fact}`);
  }
  lines.push("");

  lines.push(`3. ASSUMPTIONS:`);
  for (const a of l.assumptions)
    lines.push(`   - [${a.tier}] ${a.statement}  (verify by: ${a.verifyBy})`);
  lines.push("");

  lines.push(
    `4. CONFIDENCE: ${CONFIDENCE_LABEL[l.confidence] ?? l.confidence} — capped by the weakest load-bearing input.`,
  );
  lines.push("");

  lines.push(`5. ROOT CAUSE:`);
  if (l.rootCause.bindingLink) {
    lines.push(
      `   Binding constraint: ${l.rootCause.bindingLink} — ${l.rootCause.rationale}`,
    );
  } else {
    lines.push(`   Not confirmable. ${l.rootCause.rationale}`);
    if (l.rootCause.hypotheses.length)
      lines.push(`   Ranked hypotheses: ${l.rootCause.hypotheses.join(" > ")}`);
  }
  lines.push(`   Feasibility: ${l.rootCause.feasibility}`);
  lines.push("");

  lines.push(`6. TRANSFORMATION OPTIONS:`);
  for (const o of l.options) {
    const score =
      o.score === null ? "score: n/a (cannot size honestly)" : `score: ${o.score}`;
    const tag = o.rejectedReason
      ? " [REJECTED]"
      : o.id === l.provisionalLeadId
        ? " [PROVISIONAL LEAD]"
        : "";
    lines.push(`   - ${o.name}${tag} — targets ${o.targetsLink}; ${score}`);
  }
  lines.push("");

  lines.push(`7. RECOMMENDATION:`);
  if (l.recommendation) {
    const r = opt(l.recommendation.optionId);
    lines.push(`   ${r?.name ?? l.recommendation.optionId} — ${l.recommendation.why}`);
  } else if (l.provisionalLeadId) {
    const r = opt(l.provisionalLeadId);
    lines.push(
      `   No firm recommendation yet. Provisional lead: ${r?.name ?? l.provisionalLeadId}.`,
    );
    lines.push(
      `   Why it leads: its precondition is already verified, while the alternatives depend on unknown internal data.`,
    );
  } else {
    lines.push(`   None. ${OUTPUT_LABEL[l.output]}.`);
  }
  lines.push("");

  lines.push(`8. WHY THE ALTERNATIVES LOST:`);
  for (const r of l.rejected) {
    const o = opt(r.optionId);
    lines.push(`   - ${o?.name ?? r.optionId}: ${r.reason}`);
  }
  if (l.rejected.length === 0) lines.push(`   (no rejections recorded)`);
  lines.push("");

  lines.push(`9. VALIDITY CONDITIONS (must remain true):`);
  for (const v of l.validityConditions) {
    lines.push(
      `   - ${v.condition}${v.validityWindowDays ? ` (re-check within ${v.validityWindowDays}d)` : ""}`,
    );
  }
  lines.push("");

  lines.push(`10. EVIDENCE THAT WOULD CHANGE THIS:`);
  for (const c of l.evidenceThatWouldChange)
    lines.push(`   - (${c.effect}) ${c.evidence}`);
  lines.push("");

  lines.push(`11. MEASUREMENT CONTRACT:`);
  if (l.measurementContract) {
    const m = l.measurementContract;
    const base =
      m.baseline.value === null
        ? `unknown — MUST be captured before execution`
        : `${m.baseline.value}`;
    lines.push(`   metric: ${m.metric}`);
    lines.push(`   baseline: ${base} [${m.baseline.tier}]`);
    lines.push(`   window: ${m.window}`);
    lines.push(`   attribution: ${m.attributionMethod}`);
  } else {
    lines.push(`   none (no lead to measure)`);
  }
  lines.push("");

  lines.push(
    `EVIDENCE APPETITE (pursue highest first — the facts that could prove this wrong):`,
  );
  for (const a of l.appetite) {
    lines.push(
      `   [p=${a.priority}] (${a.effect}, ${a.path}) ${a.fact} — ${a.why}${a.source ? `  <${a.source}>` : ""}`,
    );
  }

  return lines.join("\n");
}
