import { describe, it, expect } from "vitest";
import { buildSeed } from "./seed.ts";
import {
  openEngagement,
  advanceEngagement,
  createProject,
  recordRoi,
  scorecardFor,
  latestEngagement,
  engagementById,
} from "./store.ts";

describe("seed", () => {
  it("configures the four portfolio businesses", () => {
    const ws = buildSeed();
    const keys = ws.businesses.map((b) => b.key).sort();
    expect(keys).toEqual(["5star", "homehuddle", "hscs", "venuewise"]);
  });
  it("Venuewise is an analysis-only demonstration with a completed assessment", () => {
    const ws = buildSeed();
    const v = ws.businesses.find((b) => b.key === "venuewise")!;
    expect(v.analysisOnly).toBe(true);
    expect(v.demo).toBe(true);
    const eng = latestEngagement(ws, v.id)!;
    expect(eng.mode).toBe("analysis_only");
    expect(eng.assessment.completed).toBe(true);
    expect(scorecardFor(eng.assessment).transformation).not.toBeNull();
  });
});

describe("full-transformation engagement", () => {
  it("opens in full mode and can hold delivery + ROI", () => {
    const ws = buildSeed();
    const hscs = ws.businesses.find((b) => b.key === "hscs")!;
    const e = openEngagement(ws, hscs.id);
    expect(e.mode).toBe("full_transformation");
    expect(createProject(e, "Warehouse Automation")).not.toBeNull();
    expect(recordRoi(e, "Labor saved", "hrs", 0, 320)).not.toBeNull();
  });
});

describe("analysis-only cap (Venuewise) — enforced in the UI store", () => {
  it("cannot advance past blueprint, and has no delivery or ROI", () => {
    const ws = buildSeed();
    const v = ws.businesses.find((b) => b.key === "venuewise")!;
    const e = openEngagement(ws, v.id); // fresh analysis-only engagement at prospect
    // step to blueprint
    for (const s of [
      "lead_qualification",
      "business_discovery",
      "assessment",
      "executive_analysis",
      "blueprint",
    ] as const) {
      expect(advanceEngagement(e, s).ok).toBe(true);
    }
    const capped = advanceEngagement(e, "proposal");
    expect(capped.ok).toBe(false);
    expect(createProject(e, "Nope")).toBeNull();
    expect(recordRoi(e, "Nope", "x", 0, 0)).toBeNull();
  });
});

describe("scoring reuse — matches the engine fixture", () => {
  it("business 4s + operations 5/2 → business 80, operations 70, transformation 75", () => {
    const ws = buildSeed();
    const hscs = ws.businesses.find((b) => b.key === "hscs")!;
    const e = openEngagement(ws, hscs.id);
    e.assessment.ratings.business = {
      business_maturity: 4,
      leadership: 4,
      processes: 4,
      customer_experience: 4,
      growth_readiness: 4,
    };
    e.assessment.ratings.operations = { operations: 5, supply_chain: 2 };
    const s = scorecardFor(e.assessment);
    expect(s.businessHealth).toBe(80);
    expect(s.operations).toBe(70);
    expect(s.transformation).toBe(75);
    // and it is retrievable by id
    expect(engagementById(ws, e.id)).toBe(e);
  });
});
