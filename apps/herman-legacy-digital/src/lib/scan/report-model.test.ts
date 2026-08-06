import { describe, it, expect } from "vitest";
import { analyst } from "@hl-bos/bti-engine";
import { buildReportView, workflowStages } from "./report-model";

// Drive the real engine over its own sample homepage (no network) and assert the
// view-model is well-formed and HONEST — nothing fabricated, unknowns preserved.
function sampleView() {
  const analysis = analyst.analyzeBusiness({
    name: analyst.SAMPLE_BUSINESS.name,
    website: analyst.SAMPLE_BUSINESS.website,
    industry: analyst.SAMPLE_BUSINESS.industry,
    location: analyst.SAMPLE_BUSINESS.location,
    html: analyst.SAMPLE_HTML,
  });
  return buildReportView(analysis);
}

describe("buildReportView", () => {
  it("carries the business identity through", () => {
    const v = sampleView();
    expect(v.business.name).toBe(analyst.SAMPLE_BUSINESS.name);
    expect(v.business.website).toContain("rivertown");
  });

  it("produces evidence-backed findings with valid priority and confidence", () => {
    const v = sampleView();
    expect(v.findings.length).toBeGreaterThan(0);
    for (const f of v.findings) {
      expect(["critical", "high", "medium", "low"]).toContain(f.priority);
      expect(["High", "Moderate", "Low"]).toContain(f.confidence);
      expect(typeof f.businessImpact).toBe("string");
      expect(f.title.length).toBeGreaterThan(0);
    }
  });

  it("sorts findings by priority (critical/high first)", () => {
    const v = sampleView();
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < v.findings.length; i++) {
      expect(rank[v.findings[i]!.priority]).toBeGreaterThanOrEqual(
        rank[v.findings[i - 1]!.priority],
      );
    }
  });

  it("does NOT fabricate ROI when no financials were provided", () => {
    const v = sampleView();
    expect(v.roi.quantified).toBe(false);
    expect(v.roi.lines).toEqual([]);
    expect(v.roi.note.toLowerCase()).toContain("financial");
  });

  it("exposes the four planning horizons", () => {
    const v = sampleView();
    expect(v.horizons.map((h) => h.key)).toEqual([
      "immediate",
      "shortTerm",
      "mediumTerm",
      "longTerm",
    ]);
  });

  it("recommends only Herman Legacy products that findings support", () => {
    const v = sampleView();
    for (const r of v.recommendedTransformations) {
      expect(r.supportedBy.length).toBeGreaterThan(0);
      expect(["recurring", "one_time"]).toContain(r.type);
    }
  });

  it("hands off to the blueprint stage", () => {
    const v = sampleView();
    expect(v.next.href).toBe("/transformation-blueprint");
    expect(v.next.stage).toBe("blueprint");
    expect(v.next.cta.length).toBeGreaterThan(0);
  });

  it("carries provenance meta (deterministic, nothing fabricated)", () => {
    const v = sampleView();
    expect(v.meta.engineVersion.length).toBeGreaterThan(0);
    expect(v.meta.dimensionsRated).toBeGreaterThan(0);
  });
});

describe("workflowStages", () => {
  it("defines the full journey spine with a single active stage", () => {
    const stages = workflowStages();
    expect(stages.map((s) => s.id)).toEqual([
      "analysis",
      "report",
      "blueprint",
      "implement",
      "measure",
      "subscription",
    ]);
    expect(stages.filter((s) => s.status === "active")).toHaveLength(1);
  });
});
