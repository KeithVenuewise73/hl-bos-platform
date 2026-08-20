import { describe, it, expect } from "vitest";
import {
  SCORING_VERSION,
  NOT_YET_RESEARCHED_AT_LEVEL_1,
  popularityScore,
  suitabilityScore,
  type ScoringInput,
} from "./scoring";
import { NOT_YET_RESEARCHED_FOR_PAIN, PAIN_ENGINE_VERSION } from "./pain";
import { ALL_PORTFOLIOS } from "./portfolios";

/**
 * Cross-cutting guarantees the whole intelligence layer rests on.
 *
 * Each of these could be broken by a change in any one module while every
 * module's own tests still passed, which is why they live together.
 */

const base: ScoringInput = {
  stars: 500,
  forks: 50,
  openIssues: 20,
  pushedAt: "2026-08-01T00:00:00Z",
  archived: false,
  topics: ["saas"],
  license: "MIT",
  language: "TypeScript",
  category: "crm",
  searchPattern: "POPULAR",
  starsPercentileInCategory: 0.8,
  forksPercentileInCategory: 0.8,
  asOf: "2026-08-20T00:00:00Z",
};

describe("the layer never produces a single blended score", () => {
  it("exposes no combined score anywhere in a score result", () => {
    const results = [
      popularityScore(base),
      suitabilityScore(base, { value: 0.8, basis: "test" }),
    ];
    for (const r of results) {
      for (const forbidden of ["overall", "combined", "total", "composite", "final"]) {
        expect(Object.keys(r)).not.toContain(forbidden);
      }
      // The only numeric field is `score`, plus a status and a breakdown.
      expect(Object.keys(r).sort()).toEqual(["components", "score", "status"]);
    }
  });

  it("gives every portfolio exactly one ranking basis, never a blend", () => {
    for (const p of ALL_PORTFOLIOS) {
      expect(["popularity", "suitability", "pain", "rising"]).toContain(p.rankBy);
    }
  });
});

describe("unresearched fields are enumerated, not left blank", () => {
  it("names the executive-card fields Level-1 triage cannot answer", () => {
    // If a field is added to the card without being added here, it renders as
    // an empty space — which reads as "nothing to report" rather than
    // "nobody has looked".
    for (const f of [
      "target_customer",
      "competitive_landscape",
      "estimated_mvp_effort",
      "monetization_paths",
      "likely_pricing_model",
      "acquisition_potential",
      "partnership_potential",
      "build_and_sell_potential",
      "principal_risks",
      "recommended_action",
    ]) {
      expect(NOT_YET_RESEARCHED_AT_LEVEL_1).toContain(f);
    }
  });

  it("names the pain-cluster fields that cannot come from public complaints", () => {
    for (const f of ["market_size", "willingness_to_pay", "revenue_potential"]) {
      expect(NOT_YET_RESEARCHED_FOR_PAIN).toContain(f);
    }
  });

  it("never claims a market size or a revenue figure as an available output", () => {
    // The scoring module must not gain a component with one of these names.
    const p = popularityScore(base);
    const s = suitabilityScore(base, { value: 0.5, basis: "" });
    const names = [...p.components, ...s.components].map((c) => c.component);
    for (const forbidden of [
      "market_size",
      "revenue",
      "customers",
      "downloads",
      "pricing",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("every engine is versioned", () => {
  it("stamps a version so any stored result can be traced to the rules that made it", () => {
    expect(SCORING_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
    expect(PAIN_ENGINE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });
});
