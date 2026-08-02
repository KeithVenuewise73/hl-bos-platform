import { describe, it, expect } from "vitest";
import {
  NOTEBOOK_KINDS,
  INTELLIGENCE_PROGRAMS,
  INTELLIGENCE_PROGRAM_KEYS,
  isTaskKind,
  kindMeta,
  canTransition,
  programFor,
  assembleIntelligenceObject,
  type NotebookEntry,
} from "./notebook";
import { NOTE_TYPES } from "./types";

function entry(over: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: "e1",
    kind: "observation",
    title: null,
    body: "a note",
    status: "open",
    program: null,
    opportunityId: null,
    dueDate: null,
    createdAt: "2026-08-02T00:00:00Z",
    ...over,
  };
}

describe("notebook kinds", () => {
  it("has one meta per note_type (kind vocabulary == DB enum)", () => {
    expect(NOTEBOOK_KINDS.length).toBe(NOTE_TYPES.length);
    for (const k of NOTE_TYPES) {
      expect(NOTEBOOK_KINDS.some((m) => m.kind === k)).toBe(true);
    }
  });
  it("marks task-like kinds", () => {
    expect(isTaskKind("personal_task")).toBe(true);
    expect(isTaskKind("research_request")).toBe(true);
    expect(isTaskKind("observation")).toBe(false);
    expect(kindMeta("ai_analysis_request").isTask).toBe(true);
  });
  it("assigns every kind to a real program", () => {
    for (const m of NOTEBOOK_KINDS) {
      expect(INTELLIGENCE_PROGRAM_KEYS).toContain(m.program);
    }
  });
});

describe("intelligence programs", () => {
  it("declares exactly the six permanent programs", () => {
    expect(INTELLIGENCE_PROGRAMS.map((p) => p.key)).toEqual([
      "opportunity",
      "acquisition",
      "research",
      "grant",
      "competitive",
      "portfolio",
    ]);
  });
  it("marks planned programs honestly (no fabricated capability)", () => {
    const planned = INTELLIGENCE_PROGRAMS.filter((p) => p.status === "planned");
    for (const p of planned) {
      expect(p.currentCapability.toLowerCase()).toContain("placeholder");
      expect(p.futureConnectors.length).toBeGreaterThan(0);
    }
  });
  it("resolves a program by key", () => {
    expect(programFor("research")?.name).toBe("Research Intelligence");
  });
});

describe("task transitions", () => {
  it("allows sensible moves and rejects no-ops", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "done")).toBe(true);
    expect(canTransition("done", "archived")).toBe(true);
    expect(canTransition("open", "open")).toBe(false);
    expect(canTransition("archived", "done")).toBe(false);
  });
});

describe("assembleIntelligenceObject", () => {
  it("populates entry-intrinsic facets from the kind", () => {
    const obj = assembleIntelligenceObject(
      entry({ kind: "research_request", title: "LLM eval tools", body: "look into X" }),
    );
    expect(obj.facets.researchRequest.available).toBe(true);
    expect(obj.facets.aiAnalysisRequest.available).toBe(false);
    expect(obj.facets.personalTasks.available).toBe(true); // task-like
  });

  it("marks composed facets absent (with a reason) when unlinked", () => {
    const obj = assembleIntelligenceObject(entry());
    expect(obj.facets.evidenceCollection.available).toBe(false);
    expect(obj.facets.reuseAnalysis.available).toBe(false);
    expect(obj.facets.factoryReadiness.available).toBe(false);
    if (!obj.facets.reuseAnalysis.available) {
      expect(obj.facets.reuseAnalysis.reason).toMatch(/not linked/);
    }
  });

  it("populates composed facets from linked-opportunity context", () => {
    const obj = assembleIntelligenceObject(
      entry({ kind: "decision_input", opportunityId: "opp1", program: "opportunity" }),
      {
        evidence: [
          {
            id: "ev1",
            title: "Fact",
            evidenceType: "verified_fact",
            reliability: "high",
          },
        ],
        reuse: { score: 72, verdict: "high-reuse", formula: "…" },
        factory: { ready: true, reusableCapabilityCount: 4, blockers: [] },
        decisions: [{ id: "d1", decision: "build", decidedAt: "2026-08-02" }],
        relatedOpportunities: [{ id: "opp2", title: "Adjacent", status: "watch" }],
      },
    );
    expect(obj.facets.evidenceCollection.available).toBe(true);
    expect(obj.facets.reuseAnalysis.available).toBe(true);
    expect(obj.facets.factoryReadiness.available).toBe(true);
    expect(obj.facets.decisionHistory.available).toBe(true);
    expect(obj.facets.relatedOpportunities.available).toBe(true);
    expect(obj.program?.key).toBe("opportunity");
  });

  it("never fabricates — an empty context yields no populated composed facets", () => {
    const obj = assembleIntelligenceObject(entry({ kind: "personal_task" }));
    const composed = [
      obj.facets.evidenceCollection,
      obj.facets.relatedOpportunities,
      obj.facets.reuseAnalysis,
      obj.facets.factoryReadiness,
      obj.facets.decisionHistory,
    ];
    expect(composed.every((f) => !f.available)).toBe(true);
  });
});
