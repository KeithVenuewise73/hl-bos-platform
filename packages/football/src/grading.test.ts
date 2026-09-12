import { describe, expect, it } from "vitest";
import {
  GRADE_SYMBOLS,
  gradeLabel,
  gradeMark,
  gradeTone,
  summarizeGrades,
  symbolToNumeric,
} from "./grading";

describe("the symbol ladder", () => {
  it("has the five rungs from the brief, in order", () => {
    expect(GRADE_SYMBOLS.map((g) => g.value)).toEqual([
      "exceptional",
      "positive",
      "neutral",
      "negative",
      "major_error",
    ]);
  });

  it("is monotonic: a better grade is never worth fewer points", () => {
    const points = GRADE_SYMBOLS.map((g) => g.points);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i - 1]!).toBeGreaterThan(points[i]!);
    }
  });

  it("renders marks and labels", () => {
    expect(gradeMark("exceptional")).toBe("++");
    expect(gradeMark("positive")).toBe("+");
    expect(gradeMark("neutral")).toBe("0");
    expect(gradeLabel("major_error")).toBe("Major Error");
  });

  it("splits tone the way a player page reports it", () => {
    expect(gradeTone("exceptional")).toBe("positive");
    expect(gradeTone("positive")).toBe("positive");
    expect(gradeTone("neutral")).toBe("neutral");
    expect(gradeTone("negative")).toBe("negative");
    expect(gradeTone("major_error")).toBe("negative");
  });

  it("maps to points for reporting only", () => {
    expect(symbolToNumeric("exceptional")).toBe(100);
    expect(symbolToNumeric("major_error")).toBe(0);
  });
});

describe("summarizeGrades", () => {
  // An ungraded player is not a zero-graded player. Rendering 0 on a page
  // where nobody has graded them is the dashboard telling a lie about a kid.
  it("returns a null average when nothing is graded", () => {
    expect(summarizeGrades([])).toEqual({
      graded: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      average: null,
    });
  });

  it("counts only the reps that carry a grade", () => {
    const summary = summarizeGrades([
      { symbol: "positive" },
      { symbol: "neutral" },
      { symbol: "exceptional" },
      { symbol: undefined },
      {},
    ]);
    expect(summary.graded).toBe(3);
    expect(summary.positive).toBe(2);
    expect(summary.neutral).toBe(1);
    expect(summary.negative).toBe(0);
    expect(summary.average).toBe(80);
  });

  it("handles the numeric scale", () => {
    const summary = summarizeGrades([
      { numericValue: 90 },
      { numericValue: 60 },
      { numericValue: 30 },
    ]);
    expect(summary.positive).toBe(1);
    expect(summary.neutral).toBe(1);
    expect(summary.negative).toBe(1);
    expect(summary.average).toBe(60);
  });
});
