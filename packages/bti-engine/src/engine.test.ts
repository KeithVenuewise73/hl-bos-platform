import { describe, it, expect } from "vitest";
import {
  computeScorecard,
  analyzeGrowth,
  assembleExecutiveBlueprint,
  canAdvance,
  nextStage,
  stageRank,
  totalDimensionCount,
  DOMAIN_WEIGHTS,
  type DimensionRating,
} from "./index.ts";

// The SAME fixture asserted by the DB (28_bti_platform.sql) and the edge layer
// (bti_platform.test.ts): business dims all 4 → 80; operations 5 & 2 → 70;
// growth unrated → null; transformation → 75. If these drift, it is a bug.
const RATINGS: DimensionRating[] = [
  { domain: "business", dimension: "business_maturity", rating: 4, weight: 7 },
  { domain: "business", dimension: "leadership", rating: 4, weight: 6 },
  { domain: "business", dimension: "processes", rating: 4, weight: 6 },
  { domain: "business", dimension: "customer_experience", rating: 4, weight: 7 },
  { domain: "business", dimension: "growth_readiness", rating: 4, weight: 7 },
  { domain: "operations", dimension: "operations", rating: 5, weight: 7 },
  { domain: "operations", dimension: "supply_chain", rating: 2, weight: 7 },
];

describe("scoring — identical to DB + edge authority", () => {
  it("business 80, operations 70", () => {
    const s = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
    expect(s.businessHealth).toBe(80);
    expect(s.operations).toBe(70);
  });
  it("unrated domains are honest nulls", () => {
    const s = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
    expect(s.growth).toBeNull();
    expect(s.technology).toBeNull();
    expect(s.financialOpportunity).toBeNull();
  });
  it("transformation is 75 (weighted mean of present domains)", () => {
    expect(computeScorecard(RATINGS, DOMAIN_WEIGHTS).transformation).toBe(75);
  });
  it("no ratings → all-null scorecard, no invented numbers", () => {
    const s = computeScorecard([], DOMAIN_WEIGHTS);
    expect(s.transformation).toBeNull();
    expect(Object.keys(s.domainScores)).toHaveLength(0);
  });
});

describe("lifecycle — ordered + analysis-only cap", () => {
  it("advances one step; blocks skips", () => {
    expect(canAdvance("prospect", "lead_qualification", "full_transformation").ok).toBe(
      true,
    );
    const skip = canAdvance("prospect", "blueprint", "full_transformation");
    expect(skip.ok).toBe(false);
  });
  it("analysis-only cannot pass blueprint (Venuewise)", () => {
    const capped = canAdvance("blueprint", "proposal", "analysis_only");
    expect(capped.ok).toBe(false);
    expect(canAdvance("blueprint", "proposal", "full_transformation").ok).toBe(true);
    expect(nextStage("blueprint", "analysis_only")).toBeNull();
    expect(nextStage("blueprint", "full_transformation")).toBe("proposal");
  });
  it("side states rank 0", () => {
    expect(stageRank("on_hold")).toBe(0);
  });
});

describe("growth — priority + ROI + service on every rec", () => {
  it("weak dims become recs; strengths and unrated are honest", () => {
    const r = analyzeGrowth([
      { dimension: "seo", rating: 1 },
      { dimension: "website", rating: 5 },
    ]);
    expect(r.recommendations[0]?.dimension).toBe("seo");
    expect(r.recommendations[0]?.recommendedService).toBe("SEO Optimization");
    expect(r.strengths[0]?.dimension).toBe("website");
    expect(r.unrated).toContain("reviews");
  });
});

describe("blueprint — 17 sections, honest empties", () => {
  it("assembles all sections; empty ones carry a reason", () => {
    const scores = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
    const growth = analyzeGrowth([{ dimension: "seo", rating: 1 }]);
    const bp = assembleExecutiveBlueprint({
      scores,
      growth,
      recommendations: [
        {
          title: "Fix SEO",
          priority: "critical",
          estimatedRoi: "high",
          recommendedService: "SEO Optimization",
        },
      ],
    });
    expect(bp.sections).toHaveLength(17);
    const roi = bp.sections.find((s) => s.key === "estimated_roi")!;
    expect(roi.hasData).toBe(false);
    expect(roi.note).toBeTruthy();
  });
});

describe("catalog", () => {
  it("has 43 dimensions across 6 domains", () => {
    expect(totalDimensionCount()).toBe(43);
  });
});
