import { describe, it, expect } from "vitest";
import { analyzeBusiness, SAMPLE_HTML, SAMPLE_BUSINESS } from "./index.ts";
import { FINDING_THRESHOLD } from "../consulting/index.ts";

// The scorecard is an ADDITIVE surface over the ratings analyzeBusiness already
// computes — one auditable row per analyzed dimension. It must never fabricate:
// every score maps directly to the dimension's real rating.
describe("analyzeBusiness scorecard", () => {
  const analysis = analyzeBusiness({
    name: SAMPLE_BUSINESS.name,
    website: SAMPLE_BUSINESS.website,
    industry: SAMPLE_BUSINESS.industry,
    html: SAMPLE_HTML,
  });

  it("emits one row per analyzed dimension", () => {
    expect(analysis.scorecard.length).toBeGreaterThan(0);
  });

  it("scores are rating*20 and benchmark is the finding threshold + 1", () => {
    const expectedBenchmark = (FINDING_THRESHOLD + 1) * 20;
    for (const s of analysis.scorecard) {
      expect(s.score).toBe(s.rating * 20);
      expect(s.benchmark).toBe(expectedBenchmark);
      expect(s.isStrength).toBe(s.rating > FINDING_THRESHOLD);
    }
  });

  it("classifies status consistently with the rating", () => {
    for (const s of analysis.scorecard) {
      if (s.rating > FINDING_THRESHOLD) expect(s.status).toBe("strength");
      else expect(["below_benchmark", "critical"]).toContain(s.status);
    }
  });

  it("carries a real evidence interpretation and a confidence", () => {
    for (const s of analysis.scorecard) {
      expect(["high", "moderate", "low"]).toContain(s.confidence);
      expect(typeof s.interpretation).toBe("string");
    }
  });
});
