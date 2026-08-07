/**
 * Stages 5, 8–11 — Executive Review, Roadmap, Progress, Measurement, Continuous.
 * Pure, deterministic derivations over the tasks and the BTI ledger.
 */

import type {
  ContinuousPlan,
  ExecutiveDecision,
  ExecutiveReview,
  ImplementationTask,
  ProgressRollup,
  RoadmapPhase,
  StartupLedger,
  SuccessMeasurement,
} from "./types.ts";

// --- Stage 5: Executive Review ---------------------------------------------

const DEFAULT_DECISION: Record<string, ExecutiveDecision> = {
  RECOMMEND_TRANSFORMATION: "approve_transformation",
  COLLECT_MORE_EVIDENCE: "approve_evidence_collection",
  REVISE_GOAL: "defer",
  NO_TRANSFORMATION_NOW: "defer",
};

export function buildReview(
  ledger: StartupLedger,
  decision?: ExecutiveDecision,
): ExecutiveReview {
  const chosen = decision ?? DEFAULT_DECISION[ledger.output] ?? "defer";
  const fullRoadmapUnlocked =
    chosen === "approve_transformation" && ledger.output === "RECOMMEND_TRANSFORMATION";
  const rationale =
    ledger.output === "RECOMMEND_TRANSFORMATION"
      ? "A firm recommendation is justified; the full transformation may be planned and executed on approval."
      : ledger.output === "COLLECT_MORE_EVIDENCE"
        ? "No firm recommendation yet. Approve the evidence-collection and provisional-lead packaging so BTI can rerun toward a firm recommendation. The full roadmap stays gated until then."
        : "The output does not justify a transformation now; defer and revisit when evidence or the goal changes.";
  return { output: ledger.output, decision: chosen, rationale, fullRoadmapUnlocked };
}

// --- Stage 8: Implementation Roadmap ---------------------------------------

export function buildRoadmap(
  tasks: readonly ImplementationTask[],
  review: ExecutiveReview,
): RoadmapPhase[] {
  const ids = (pred: (t: ImplementationTask) => boolean) =>
    tasks.filter(pred).map((t) => t.id);

  const phase0 = ids(
    (t) =>
      t.source === "measurement" ||
      (t.source === "transformation" && !t.feedsReanalysis) ||
      t.source === "evidence",
  );
  const phase1 = ids((t) => t.source === "transformation" && t.feedsReanalysis);

  const phases: RoadmapPhase[] = [
    {
      key: "phase-0",
      title: "Decide, Package & Collect Evidence",
      intent:
        "Pick one offer + one customer, package it, capture the baseline, and gather the load-bearing facts.",
      taskIds: phase0,
      gated: false,
    },
    {
      key: "phase-1",
      title: "Validate Willingness-to-Pay",
      intent:
        "Put the priced offer in front of real prospects / a paid design partner and record the result.",
      taskIds: phase1,
      gated: false,
    },
    {
      key: "phase-2",
      title: "Full Commercialization Roadmap",
      intent:
        "Sequence the confirmed transformation end to end once the binding constraint is proven.",
      taskIds: [],
      gated: !review.fullRoadmapUnlocked,
      ...(review.fullRoadmapUnlocked
        ? {}
        : {
            unlockCondition:
              "BTI reruns to RECOMMEND_TRANSFORMATION after the Phase-0/1 evidence lands.",
          }),
    },
  ];
  return phases;
}

// --- Stage 9: Progress Tracking --------------------------------------------

export function rollup(tasks: readonly ImplementationTask[]): ProgressRollup {
  const c = { not_started: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const t of tasks) c[t.status]++;
  const total = tasks.length;
  const percentComplete = total === 0 ? 0 : Math.round((c.done / total) * 100);
  return {
    total,
    notStarted: c.not_started,
    inProgress: c.in_progress,
    blocked: c.blocked,
    done: c.done,
    percentComplete,
  };
}

// --- Stage 10: Success Measurement -----------------------------------------

export function buildMeasurement(
  ledger: StartupLedger,
  actual: number | null = null,
): SuccessMeasurement {
  const contract = ledger.measurementContract;
  if (!contract) {
    return {
      contract: null,
      actual: null,
      verdict: "not_yet_measured",
      note: "No measurement contract (no lead to measure).",
    };
  }
  if (actual === null) {
    return {
      contract,
      actual: null,
      verdict: "not_yet_measured",
      note: `No outcome data yet. Baseline: ${contract.baseline.value === null ? "null (capture first)" : contract.baseline.value} [${contract.baseline.tier}].`,
    };
  }
  const base = contract.baseline.value ?? 0;
  return {
    contract,
    actual,
    verdict: actual > base ? "on_track" : "off_track",
    note: `Actual ${actual} vs baseline ${base}; ${contract.attribution}`,
  };
}

// --- Stage 11: Continuous Transformation -----------------------------------

export function buildContinuous(ledger: StartupLedger): ContinuousPlan {
  return {
    rerunWhen:
      ledger.measurementContract?.rerunWhen ??
      "When new load-bearing evidence lands or the goal changes.",
    whatWouldUnlockNext:
      ledger.output === "COLLECT_MORE_EVIDENCE"
        ? "A firm RECOMMEND_TRANSFORMATION once the offer/customer/price evidence is collected — which unlocks the Phase-2 full roadmap."
        : "The next binding constraint, once this transformation is measured.",
  };
}
