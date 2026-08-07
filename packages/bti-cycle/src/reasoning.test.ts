import { describe, expect, it } from "vitest";
import { runCycle } from "./reasoning.ts";
import type { Engagement } from "./types.ts";

const AS_OF = "2026-08-06";

/** A business with a confirmed, sized capture gap and spare capacity to absorb
 * it — the path where BTI SHOULD issue a firm recommendation. */
const CAPTURE_GAP: Engagement = {
  engagementId: "eng-capgap",
  business: "Test Plumbing Co",
  asOf: AS_OF,
  goal: {
    statement: "+20 jobs/month within 90 days",
    metric: "net new jobs / month",
    target: 20,
    unit: "jobs/mo",
    confidence: "observed",
  },
  evidence: [
    {
      id: "d",
      fact: "[strong] Strong inbound demand.",
      link: "demand",
      quality: "observed",
    },
    {
      id: "c",
      fact: "[weak] ~30% of inbound calls hit voicemail after hours and are never returned — an estimated $6,750/month in lost jobs.",
      link: "capture",
      quality: "observed",
      value: 6750,
      valueUnit: "usd/mo",
    },
    {
      id: "f",
      fact: "[strong] Crews have spare capacity to take ~15 more jobs/month.",
      link: "fulfillment",
      quality: "observed",
    },
  ],
};

/** A goal that exceeds a verified capacity ceiling — the path where BTI must
 * refuse to chase it and send it back to Stage 1. */
const INFEASIBLE: Engagement = {
  engagementId: "eng-infeasible",
  business: "Capped Co",
  asOf: AS_OF,
  goal: {
    statement: "+20 jobs/mo",
    metric: "jobs/mo",
    target: 20,
    confidence: "observed",
  },
  evidence: [
    { id: "d", fact: "[strong] Strong demand.", link: "demand", quality: "observed" },
    {
      id: "cap",
      fact: "[weak] Verified capacity ceiling: the two crews can physically deliver at most 8 more jobs/month.",
      link: "fulfillment",
      quality: "verified",
      sources: ["owner books", "dispatch log"],
      value: 8,
    },
  ],
};

describe("permitted output: recommendation", () => {
  const l = runCycle(CAPTURE_GAP);

  it("confirms the binding constraint at the sized gap", () => {
    expect(l.rootCause.bindingLink).toBe("capture");
    expect(l.output).toBe("recommendation");
  });

  it("recommends the outcome that relieves it, with a real non-null score", () => {
    expect(l.recommendation).not.toBeNull();
    const rec = l.options.find((o) => o.id === l.recommendation?.optionId);
    expect(rec?.name).toBe("Recover Missed Opportunities");
    expect(rec?.score).not.toBeNull();
    expect(rec?.score).toBeGreaterThan(0);
  });

  it("authors a measurement contract with a real, captured baseline", () => {
    expect(l.measurementContract?.baseline.value).toBe(6750);
    expect(l.measurementContract?.baseline.tier).not.toBe("unknown");
  });

  it("is substantiated, not merely provisional", () => {
    expect(l.lifecycle).toBe("substantiated");
  });
});

describe("permitted output: revise_goal (feasibility gate)", () => {
  const l = runCycle(INFEASIBLE);
  it("refuses to chase a goal above a verified capacity ceiling", () => {
    expect(l.output).toBe("revise_goal");
    expect(l.rootCause.feasibility).toBe("infeasible");
    expect(l.recommendation).toBeNull();
  });
});

describe("honesty invariants", () => {
  it("never fabricates a score when inputs are unknown", () => {
    // A demand-only engagement cannot size anything internal.
    const l = runCycle({
      engagementId: "e",
      business: "b",
      asOf: AS_OF,
      goal: { statement: "grow", metric: "revenue", confidence: "assumed" },
      evidence: [
        {
          id: "d",
          fact: "[strong] strong demand",
          link: "demand",
          quality: "verified",
          sources: ["a", "b"],
        },
      ],
    });
    for (const o of l.options) {
      if (o.rejectedReason === undefined && o.preconditionVerified === false) {
        expect(o.score).toBeNull();
      }
    }
    expect(l.output).not.toBe("recommendation");
  });
});

describe("permitted output: collect_more_evidence when hypotheses remain", () => {
  // Strong external demand, unknown internal operations, no verified strength to
  // leverage. No recommendation is justified and there is no provisional lead —
  // but the internal links are live hypotheses worth investigating. The honest
  // output is "collect more evidence", NOT "no transformation now".
  const l = runCycle({
    engagementId: "eng-strong-demand-unknown-internals",
    business: "Strong-demand Co",
    asOf: AS_OF,
    goal: { statement: "grow profitably", metric: "revenue", confidence: "assumed" },
    evidence: [
      {
        id: "d",
        fact: "[strong] strong verified inbound demand",
        link: "demand",
        quality: "verified",
        sources: ["a", "b"],
      },
      {
        id: "c",
        fact: "capture mechanics unknown",
        link: "capture",
        quality: "unknown",
      },
      { id: "f", fact: "capacity unknown", link: "fulfillment", quality: "unknown" },
    ],
  });

  it("returns collect_more_evidence, not no_transformation", () => {
    expect(l.output).toBe("collect_more_evidence");
    expect(l.output).not.toBe("no_transformation");
  });

  it("still has live hypotheses and a feasible goal to justify it", () => {
    expect(l.rootCause.bindingLink).toBeNull();
    expect(l.rootCause.hypotheses.length).toBeGreaterThan(0);
    expect(l.rootCause.feasibility).not.toBe("infeasible");
  });

  it("names the evidence that could materially change the recommendation", () => {
    expect(l.appetite.length).toBeGreaterThan(0);
  });
});
