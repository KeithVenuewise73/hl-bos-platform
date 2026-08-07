/**
 * The Venuewise Business Transformation Report — a decision-ready executive
 * projection of the Startup Ledger. It is not a dashboard, not an SEO audit, not
 * a code inventory. Every line traces to a Ledger field; nothing is computed
 * here. It deliberately separates a functioning PRODUCT from a functioning
 * BUSINESS.
 */

import type { AssetClass, StartupLedger, StartupOption } from "./types.ts";

const OUTPUT_LABEL: Record<string, string> = {
  RECOMMEND_TRANSFORMATION: "RECOMMEND A TRANSFORMATION",
  REVISE_GOAL: "REVISE THE GOAL",
  COLLECT_MORE_EVIDENCE: "COLLECT MORE EVIDENCE (provisional lead attached)",
  NO_TRANSFORMATION_NOW: "NO TRANSFORMATION NOW",
};

const CONF: Record<string, string> = {
  verified: "HIGH (verified)",
  observed: "MEDIUM-HIGH (observed)",
  estimated: "MEDIUM (estimated)",
  assumed: "LOW (assumed)",
  unknown: "LOW (unconfirmed — capped by weakest load-bearing input)",
};

export function renderReport(l: StartupLedger): string {
  const L: string[] = [];
  const opt = (id: string | null): StartupOption | undefined =>
    l.options.find((o) => o.id === id);
  const lead = opt(l.recommendation?.optionId ?? l.provisionalLeadId);

  L.push(`VENUEWISE — BUSINESS TRANSFORMATION REPORT`);
  L.push(`Engagement ${l.engagementId}   ·   BTI startup-analysis pipeline`);
  L.push("=".repeat(72));
  L.push(`OUTPUT: ${OUTPUT_LABEL[l.output] ?? l.output}`);
  L.push(
    `Confidence: ${CONF[l.confidence] ?? l.confidence}   ·   Stability: ${l.stability.score}/100 — ${l.stability.fragility}`,
  );
  L.push("");
  L.push(`GOAL (assumed): ${l.goal.statement}`);
  L.push(`  guardrail: ${l.goal.guardrail ?? "—"}`);
  L.push("");

  L.push(`WHAT VENUEWISE IS TODAY`);
  L.push(`  ${l.discovered}`);
  L.push("");

  // The central separation the mission demands.
  L.push(`PRODUCT vs BUSINESS (do not confuse the two)`);
  const byLink = (k: string) => l.chain.find((c) => c.link === k);
  L.push(
    `  • Product creation:      ${statusOf(byLink("product"))} — a technically mature, live product exists.`,
  );
  L.push(
    `  • Business creation:     ${statusOf(byLink("revenue"))} — near-zero monetization (subscriptions = 1).`,
  );
  L.push(
    `  • Market validation:     ${statusOf(byLink("customer"))} — no defined first customer / proven demand.`,
  );
  L.push(
    `  • Customer acquisition:  ${statusOf(byLink("acquisition"))} — no repeatable channel evidenced (leads = 0).`,
  );
  L.push(
    `  • Recurring revenue:     ${statusOf(byLink("revenue"))} — Stripe live but essentially unmonetized.`,
  );
  L.push("");

  L.push(`WHAT GENUINELY EXISTS (source-labeled)`);
  for (const e of l.evidence) {
    const asset = e.asset ? ` {${assetLabel(e.asset)}}` : "";
    L.push(`  - [${e.quality}${asset}] (${e.link}) ${e.fact}`);
  }
  L.push("");

  L.push(`WHAT IS WORKING`);
  for (const c of l.chain.filter((x) => x.status === "strength"))
    L.push(`  ✓ ${c.link}: ${c.rationale}`);
  L.push(`WHAT IS NOT YET WORKING / UNPROVEN`);
  for (const c of l.chain.filter((x) => x.status === "gap" || x.status === "unknown"))
    L.push(`  • ${c.link} (${c.status}): ${c.rationale}`);
  L.push("");

  L.push(`WHY VENUEWISE HAS NOT YET ACHIEVED COMMERCIAL SUCCESS`);
  if (l.rootCause.bindingLink) {
    L.push(
      `  Binding constraint: ${l.rootCause.bindingLink} — ${l.rootCause.rationale}`,
    );
  } else {
    L.push(`  ${l.rootCause.rationale}`);
    L.push(
      `  The product is not the problem. The binding constraint is commercial, and the`,
    );
    L.push(`  single responsible link cannot be confirmed from current evidence.`);
    L.push(`  Ranked hypotheses: ${l.rootCause.hypotheses.join(" > ")}`);
  }
  L.push("");

  L.push(`TRANSFORMATION OPTIONS (business outcomes, never products)`);
  for (const o of l.options) {
    const tag = o.rejectedReason
      ? " [REJECTED]"
      : o.id === l.provisionalLeadId
        ? " [PROVISIONAL LEAD]"
        : "";
    L.push(`  - ${o.name}${tag} → targets ${o.targetsLink}`);
    if (!o.rejectedReason) {
      L.push(`      objective: ${o.objective}`);
      L.push(
        `      time to evidence: ${o.timeToEvidence}   ·   burden: ${o.implementationBurden}`,
      );
      L.push(`      invalidated by: ${o.invalidatedBy}`);
    } else {
      L.push(`      REJECTED: ${o.rejectedReason}`);
    }
  }
  L.push("");

  L.push(`WHAT BTI RECOMMENDS`);
  if (l.recommendation && lead) {
    L.push(`  ${lead.name} — ${l.recommendation.why}`);
  } else if (lead) {
    L.push(
      `  No firm recommendation yet — the honest output is COLLECT MORE EVIDENCE.`,
    );
    L.push(`  Provisional lead: ${lead.name}.`);
    L.push(
      `  Why it leads: its precondition (a working product exists to sell) is VERIFIED,`,
    );
    L.push(
      `  while the specific binding commercial link depends on answers only the CEO holds.`,
    );
  } else {
    L.push(`  ${OUTPUT_LABEL[l.output] ?? l.output}.`);
  }
  L.push("");

  L.push(`WHAT SHOULD HAPPEN FIRST`);
  L.push(
    `  Answer the load-bearing questions below and pick ONE first offer + ONE first customer.`,
  );
  L.push(`WHAT SHOULD EXPLICITLY NOT BE DONE`);
  for (const r of l.rejected) {
    const o = opt(r.optionId);
    L.push(`  ✗ ${o?.name ?? r.optionId}: ${r.reason}`);
  }
  L.push("");

  L.push(`EVIDENCE TO COLLECT NEXT (highest information value first)`);
  for (const a of l.appetite)
    L.push(`  [p=${a.priority}] (${a.effect}) ${a.fact}  <${a.source ?? "?"}>`);
  L.push("");

  L.push(`HOW WE WILL KNOW IF THE TRANSFORMATION WORKED (Measurement Contract)`);
  if (l.measurementContract) {
    const m = l.measurementContract;
    L.push(`  target: ${m.targetOutcome}`);
    L.push(
      `  baseline: ${m.baseline.value === null ? "null — MUST be captured first" : m.baseline.value} [${m.baseline.tier}] — ${m.baseline.note}`,
    );
    L.push(`  window: ${m.window}`);
    L.push(`  success: ${m.successIndicators.join("; ")}`);
    L.push(`  failure: ${m.failureIndicators.join("; ")}`);
    L.push(`  attribution: ${m.attribution}`);
    L.push(`  invalidate if: ${m.invalidateIf}`);
    L.push(`  rerun when: ${m.rerunWhen}`);
  } else {
    L.push(`  none (no lead to measure)`);
  }

  return L.join("\n");
}

function statusOf(c: { status: string } | undefined): string {
  if (!c) return "UNKNOWN";
  return c.status === "strength" ? "STRONG" : c.status === "gap" ? "WEAK" : "UNPROVEN";
}

function assetLabel(a: AssetClass): string {
  return a.replace(/_/g, " ");
}
