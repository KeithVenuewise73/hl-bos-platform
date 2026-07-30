import { describe, it, expect } from "vitest";
import type { consulting } from "@hl-bos/bti-engine";
import { runTransformationIntelligence, PIPELINE_STAGES } from "./pipeline";

// A clearly-labelled SAMPLE assessment (sample: true). Not a real customer.
const SAMPLE: consulting.AssessmentInput = {
  businessName: "Sample Business (illustrative)",
  industryPack: "general",
  mode: "full_transformation",
  sample: true,
  ratings: [
    { domain: "growth", dimension: "website", rating: 1 },
    { domain: "growth", dimension: "seo", rating: 2 },
    { domain: "growth", dimension: "reviews", rating: 2 },
    { domain: "growth", dimension: "conversion", rating: 2 },
    { domain: "operations", dimension: "automation", rating: 1 },
    { domain: "operations", dimension: "operations", rating: 2 },
    { domain: "business", dimension: "customer_experience", rating: 2 },
    { domain: "ai_readiness", dimension: "automation_opportunities", rating: 1 },
    { domain: "financial", dimension: "revenue_growth", rating: 4 },
  ],
  financial: {
    monthlyRevenue: 50000,
    laborHoursPerMonth: 200,
    laborCostPerHour: 30,
  },
};

describe("transformation intelligence pipeline", () => {
  const result = runTransformationIntelligence(SAMPLE);

  it("runs all eight pipeline stages", () => {
    expect(PIPELINE_STAGES).toHaveLength(8);
    expect(result.meta.stages).toEqual(PIPELINE_STAGES);
  });

  it("stage 1 raw-data carries the sample flag (no fabricated customer)", () => {
    expect(result.rawData.sample).toBe(true);
    expect(result.meta.sample).toBe(true);
  });

  it("stage 2 analysis produces a transformation score", () => {
    expect(typeof result.analysis.transformation).toBe("number");
    expect(result.analysis.growth).not.toBeNull();
  });

  it("stage 3 insights reuse the consulting findings", () => {
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it("stage 4 every recommendation answers all five executive questions", () => {
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(rec.problem).toBeTruthy(); // 1. what happened
      expect(rec.rootCause).toBeTruthy(); // 2. why
      expect(rec.solution).toBeTruthy(); // 3. what to do
      expect(rec.revenueImpact).toBeTruthy(); // 4. estimated impact
      expect(rec.approvals.length).toBeGreaterThan(0); // 5. what approval
      expect(rec.reusableProduct.factory).toBeTruthy(); // reusable HL product
    }
  });

  it("stage 4 never asserts a payback period", () => {
    for (const rec of result.recommendations) {
      expect(rec.revenueImpact.paybackMonths).toBeNull();
    }
  });

  it("stage 5 business impact totals only the supplied-figure estimates", () => {
    // financial figures ARE supplied, so a total exists
    expect(result.businessImpact.totalMonthlyValue).not.toBeNull();
  });

  it("stage 6 CEO approval always requires commercial terms and deploy", () => {
    const types = result.approvals.map((a) => a.type);
    expect(types).toContain("ceo_commercial_terms");
    expect(types).toContain("ceo_deploy");
  });

  it("HLVS: surfaces deduplicated software opportunities", () => {
    expect(result.softwareOpportunities.length).toBeGreaterThan(0);
  });

  it("stage 8 measurement plan lists metrics to track", () => {
    expect(result.measurementPlan.length).toBeGreaterThan(0);
  });

  it("is fully deterministic", () => {
    const again = runTransformationIntelligence(SAMPLE);
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });

  it("scoring is configurable: reweighting to growth-only yields the growth score", () => {
    const growthOnly = runTransformationIntelligence(SAMPLE, {
      scoring: {
        domainWeights: {
          business: 0,
          operations: 0,
          growth: 1,
          technology: 0,
          ai_readiness: 0,
          financial: 0,
        },
      },
    });
    expect(growthOnly.analysis.transformation).toBe(result.analysis.growth);
  });
});
