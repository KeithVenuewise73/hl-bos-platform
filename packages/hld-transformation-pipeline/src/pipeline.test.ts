import { describe, expect, it } from "vitest";
import { runPipeline, reanalyze } from "./pipeline.ts";
import { renderPipeline } from "./report.ts";
import { VENUEWISE_CLIENT } from "./client-venuewise.ts";
import { PIPELINE_STAGES } from "./types.ts";
import { runStartupCycle } from "@hl-bos/bti-venuewise";
import type { StartupEvidence } from "@hl-bos/bti-venuewise";

const s = runPipeline(VENUEWISE_CLIENT);

describe("the transformation pipeline runs all eleven stages for Client #1", () => {
  it("runs every stage in order", () => {
    expect(s.stagesRun).toEqual(PIPELINE_STAGES);
    expect(s.stagesRun.length).toBe(11);
  });

  it("REUSES BTI unchanged for stages 1–4 (does not rebuild it)", () => {
    const direct = runStartupCycle(VENUEWISE_CLIENT);
    expect(JSON.stringify(s.ledger)).toBe(JSON.stringify(direct));
    expect(s.ledger.output).toBe("COLLECT_MORE_EVIDENCE");
  });

  it("Stage 5: makes the honest executive decision (evidence collection, roadmap gated)", () => {
    expect(s.review.decision).toBe("approve_evidence_collection");
    expect(s.review.fullRoadmapUnlocked).toBe(false);
  });

  it("Stage 6: turns the recommendation/lead into EXECUTABLE tasks", () => {
    expect(s.tasks.length).toBeGreaterThan(0);
    // The provisional lead is decomposed into transformation tasks.
    expect(s.tasks.some((t) => t.source === "transformation")).toBe(true);
    // Evidence appetite becomes evidence tasks that feed re-analysis.
    expect(s.tasks.some((t) => t.source === "evidence" && t.feedsReanalysis)).toBe(
      true,
    );
    // Every task is genuinely executable: has acceptance criteria + a capability.
    for (const t of s.tasks) {
      expect(t.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(t.capability.length).toBeGreaterThan(0);
    }
  });

  it("Stage 7: maps every task to an HLD capability (execution mechanism)", () => {
    expect(s.capabilityMap.length).toBe(s.tasks.length);
    for (const m of s.capabilityMap)
      expect(m.capability.executes.length).toBeGreaterThan(0);
  });

  it("Stage 8: the full commercialization roadmap is GATED until BTI reruns firm", () => {
    const phase2 = s.roadmap.find((p) => p.key === "phase-2")!;
    expect(phase2.gated).toBe(true);
    expect(phase2.unlockCondition).toBeDefined();
    // Phase 0/1 are actionable now.
    expect(s.roadmap.find((p) => p.key === "phase-0")!.taskIds.length).toBeGreaterThan(
      0,
    );
  });

  it("Stage 9: progress is a deterministic rollup (nothing started, 0%)", () => {
    expect(s.progress.total).toBe(s.tasks.length);
    expect(s.progress.percentComplete).toBe(0);
    expect(s.progress.notStarted).toBe(s.tasks.length);
  });

  it("Stage 10: success measurement uses the honest baseline, not a forecast", () => {
    expect(s.measurement.verdict).toBe("not_yet_measured");
    expect(s.measurement.contract?.baseline.value).toBe(1);
  });

  it("Stage 11: continuous transformation states the rerun trigger", () => {
    expect(s.continuous.rerunWhen.length).toBeGreaterThan(0);
    expect(s.continuous.whatWouldUnlockNext.toLowerCase()).toContain("recommend");
  });

  it("invents no financials — no dollar/ROI/valuation figures in the plan", () => {
    const r = renderPipeline(s);
    expect(r).not.toMatch(/\$\s?\d/);
    expect(r).not.toMatch(/\bROI\b|valuation|market share/i);
  });

  it("is deterministic — identical inputs, identical pipeline", () => {
    expect(JSON.stringify(runPipeline(VENUEWISE_CLIENT))).toBe(JSON.stringify(s));
  });

  it("a decline decision produces no tasks (nothing is planned without approval)", () => {
    const declined = runPipeline(VENUEWISE_CLIENT, "decline");
    expect(declined.tasks.length).toBe(0);
  });
});

describe("Stage 11: the loop closes — new evidence unlocks the full roadmap", () => {
  // The CEO answers the load-bearing questions: a named first customer exists and
  // acquisition is the measured gap.
  const answers: StartupEvidence[] = [
    {
      id: "ans-customer",
      fact: "[strong] a named first customer segment is confirmed and already buying",
      link: "customer",
      quality: "observed",
    },
    {
      id: "ans-acq",
      fact: "[weak] no repeatable acquisition channel — every deal is founder-sourced",
      link: "acquisition",
      quality: "observed",
    },
  ];

  it("adding evidence alone stays honest — an assumed goal still caps confidence", () => {
    // reanalyze folds evidence back in, but the goal is still assumed, so BTI
    // does NOT yet issue a firm recommendation. Truth Mode: the goal must be
    // confirmed too.
    const r = reanalyze(VENUEWISE_CLIENT, answers);
    expect(r.ledger.output).toBe("COLLECT_MORE_EVIDENCE");
  });

  it("once the CEO confirms the goal AND the evidence lands, BTI recommends and the roadmap unlocks", () => {
    // Answering a question RESOLVES the unknown: the customer/acquisition
    // placeholders are replaced by the answers, and the CEO confirms the goal.
    const engagement = {
      ...VENUEWISE_CLIENT,
      goal: { ...VENUEWISE_CLIENT.goal, confidence: "observed" as const },
      evidence: [
        ...VENUEWISE_CLIENT.evidence.filter(
          (e) => e.link !== "customer" && e.link !== "acquisition",
        ),
        ...answers,
      ],
    };
    const next = runPipeline(engagement, "approve_transformation");
    expect(next.ledger.output).toBe("RECOMMEND_TRANSFORMATION");
    expect(next.review.fullRoadmapUnlocked).toBe(true);
    expect(next.roadmap.find((p) => p.key === "phase-2")!.gated).toBe(false);
  });
});
