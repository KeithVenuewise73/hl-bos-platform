import { describe, expect, it } from "vitest";
import { MIN_SAMPLE, averageYards, rate, runPassSplit, tendency } from "./tendencies";

const times = (n: number, value: string): string[] =>
  Array.from({ length: n }, () => value);

describe("tendency", () => {
  // This is the module's reason for existing: a percentage from four snaps is
  // noise wearing a percent sign, and a coach cannot tell by looking.
  it("refuses to report a distribution below the sample floor", () => {
    const result = tendency(["Trips Right", "Trips Right", "Doubles"]);
    expect(result.sufficient).toBe(false);
    if (result.sufficient) throw new Error("unreachable");
    expect(result.sample).toBe(3);
    expect(result.required).toBe(MIN_SAMPLE);
    expect(result.message).toContain("not yet have enough confirmed data");
    expect(result.message).toContain("3 confirmed plays");
  });

  it("reports the distribution with its sample size once there is enough", () => {
    const result = tendency([...times(5, "Trips Right"), ...times(3, "Doubles")]);
    expect(result.sufficient).toBe(true);
    if (!result.sufficient) throw new Error("unreachable");
    expect(result.sample).toBe(8);
    expect(result.slices[0]).toEqual({ value: "Trips Right", count: 5, percent: 62.5 });
    expect(result.slices[1]).toEqual({ value: "Doubles", count: 3, percent: 37.5 });
  });

  // A denominator padded with untagged plays measures tagging progress, not
  // football, and reports it as football.
  it("excludes untagged plays from the sample instead of bucketing them", () => {
    const result = tendency([...times(8, "Trips Right"), null, undefined, "   "]);
    expect(result.sufficient).toBe(true);
    if (!result.sufficient) throw new Error("unreachable");
    expect(result.sample).toBe(8);
    expect(result.slices[0]?.percent).toBe(100);
  });

  it("sorts by count, then alphabetically, so the output is stable", () => {
    const result = tendency([...times(4, "Zone"), ...times(4, "Man")]);
    if (!result.sufficient) throw new Error("unreachable");
    expect(result.slices.map((s) => s.value)).toEqual(["Man", "Zone"]);
  });

  it("can be told a different floor for a question that warrants one", () => {
    const result = tendency(["Cover 3", "Cover 1"], { minSample: 2 });
    expect(result.sufficient).toBe(true);
  });

  it("names the subject in its refusal when given one", () => {
    const result = tendency([], { label: "Third and long" });
    if (result.sufficient) throw new Error("unreachable");
    expect(result.message).toContain("Third and long");
    expect(result.message).toContain("0 confirmed plays");
  });
});

describe("runPassSplit", () => {
  it("ignores families that are neither run nor pass", () => {
    const result = runPassSplit([
      ...times(6, "run"),
      ...times(2, "pass"),
      "special_teams",
      "penalty_only",
    ]);
    if (!result.sufficient) throw new Error("unreachable");
    expect(result.sample).toBe(8);
    expect(result.slices).toEqual([
      { value: "run", count: 6, percent: 75 },
      { value: "pass", count: 2, percent: 25 },
    ]);
  });
});

describe("rate", () => {
  it("refuses below the floor and says how short it is", () => {
    const result = rate([true, false, true]);
    expect(result.sufficient).toBe(false);
    expect(result.percent).toBeNull();
    expect(result.hits).toBe(2);
    expect(result.message).toContain("3 plays");
  });

  it("reports a rate once the sample is there", () => {
    const result = rate([
      ...Array.from({ length: 5 }, () => true),
      ...Array.from({ length: 5 }, () => false),
    ]);
    expect(result.sufficient).toBe(true);
    expect(result.percent).toBe(50);
    expect(result.sample).toBe(10);
  });
});

describe("averageYards", () => {
  it("is null, not zero, when there is not enough tagged yardage", () => {
    const result = averageYards([5, 3, null, undefined]);
    expect(result.sufficient).toBe(false);
    expect(result.average).toBeNull();
  });

  it("averages only the plays that carry a yardage tag", () => {
    const result = averageYards([10, 10, 10, 10, 10, 10, 10, 6, null, undefined]);
    expect(result.sufficient).toBe(true);
    expect(result.sample).toBe(8);
    expect(result.average).toBe(9.5);
  });
});
