import { describe, it, expect } from "vitest";
import { advisory, isAuthoritative, computeFactoryReadiness } from "./recommendation";
import { analyzeReuse } from "./reuse";
import { summarizeEvaluation } from "./evaluation";

describe("advisory recommendation vs authoritative decision", () => {
  it("an advisory recommendation is never authoritative", () => {
    const r = advisory("build", "reasoning", "medium", {
      aiRunId: "run_123",
      model: "claude",
      promptVersion: "v1",
    });
    expect(r.authoritative).toBe(false);
    expect(isAuthoritative(r)).toBe(false);
  });

  it("records AI provenance (run/model/prompt) or explicit null", () => {
    const r = advisory("watch", "reasoning", "low");
    expect(r.aiRunId).toBeNull();
    expect(r.model).toBeNull();
    expect(r.promptVersion).toBeNull();
  });
});

describe("factory readiness preview (never executable in V2-1)", () => {
  it("is never executable and lists blockers when nothing is ready", () => {
    const r = computeFactoryReadiness({
      decision: null,
      evaluation: null,
      reuse: null,
      evidenceCount: 0,
      hasVerifiedEvidence: false,
    });
    expect(r.executable).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("No CEO decision recorded.");
    expect(r.blockers).toContain("No evidence attached.");
  });

  it("blocks non-build decisions from Factory readiness", () => {
    const r = computeFactoryReadiness({
      decision: "watch",
      evaluation: summarizeEvaluation([]),
      reuse: analyzeReuse({ title: "x" }),
      evidenceCount: 1,
      hasVerifiedEvidence: true,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.includes('not "build"'))).toBe(true);
  });

  it("is ready (but still not executable) only when a build decision has full support", () => {
    const evalFull = summarizeEvaluation([
      {
        dimension: "strategic_fit",
        score: 80,
        status: "estimated",
        confidence: "high",
        methodology: "t",
        evidenceBasis: "t",
      },
    ]);
    const r = computeFactoryReadiness({
      decision: "build",
      evaluation: evalFull,
      reuse: analyzeReuse({ title: "identity service" }),
      evidenceCount: 2,
      hasVerifiedEvidence: true,
    });
    expect(r.ready).toBe(true);
    expect(r.executable).toBe(false); // hard invariant for V2-1
  });
});
