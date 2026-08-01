import { describe, it, expect } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  summarizeEvaluation,
  isDimensionKey,
  type DimensionScore,
} from "./evaluation";

function score(
  dimension: DimensionScore["dimension"],
  s: number,
  status: DimensionScore["status"] = "estimated",
): DimensionScore {
  return {
    dimension,
    score: s,
    status,
    confidence: "medium",
    methodology: "test",
    evidenceBasis: "test",
  };
}

describe("evaluation", () => {
  it("has 11 weighted dimensions", () => {
    expect(EVALUATION_DIMENSIONS.length).toBe(11);
  });

  it("returns a null composite and no data when nothing is scored", () => {
    const s = summarizeEvaluation([]);
    expect(s.composite).toBeNull();
    expect(s.scoredCount).toBe(0);
    expect(s.complete).toBe(false);
  });

  it("ignores unknown-status dimensions (absent is not zero)", () => {
    const withUnknown = summarizeEvaluation([
      score("market_pain", 80),
      score("strategic_fit", 0, "unknown"),
    ]);
    const withoutUnknown = summarizeEvaluation([score("market_pain", 80)]);
    expect(withUnknown.composite).toBe(withoutUnknown.composite);
    expect(withUnknown.scoredCount).toBe(1);
  });

  it("composite is a weighted mean over scored dimensions", () => {
    const s = summarizeEvaluation([
      score("market_pain", 100),
      score("strategic_fit", 0),
    ]);
    // weights 1.2 and 1.3 → (100*1.2 + 0*1.3)/(2.5) ≈ 48
    expect(s.composite).toBe(48);
  });

  it("overall confidence is the lowest among scored dimensions", () => {
    const s = summarizeEvaluation([
      { ...score("market_pain", 50), confidence: "high" },
      { ...score("strategic_fit", 50), confidence: "low" },
    ]);
    expect(s.confidence).toBe("low");
  });

  it("marks complete only when every dimension is scored", () => {
    const all = EVALUATION_DIMENSIONS.map((d) => score(d.key, 50));
    expect(summarizeEvaluation(all).complete).toBe(true);
  });

  it("validates dimension keys", () => {
    expect(isDimensionKey("market_pain")).toBe(true);
    expect(isDimensionKey("nope")).toBe(false);
  });
});
