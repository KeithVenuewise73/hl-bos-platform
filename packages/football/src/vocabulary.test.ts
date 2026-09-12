import { describe, expect, it } from "vitest";
import {
  ALL_CONCEPTS,
  COVERAGES,
  FORMATIONS,
  PASS_CONCEPTS,
  RUN_CONCEPTS,
  conceptFamily,
  isCanonicalCoverage,
  isCanonicalFormation,
  isCanonicalPersonnel,
  personnelBreakdown,
} from "./vocabulary";

describe("the canonical lists", () => {
  it("carries the concepts the brief names", () => {
    for (const concept of [
      "Inside Zone",
      "Outside Zone",
      "Power",
      "Counter",
      "Read Option",
    ]) {
      expect(RUN_CONCEPTS).toContain(concept);
    }
    for (const concept of ["Mesh", "Flood", "Four Verticals", "RPO", "Play Action"]) {
      expect(PASS_CONCEPTS).toContain(concept);
    }
    for (const coverage of [
      "Cover 0",
      "Cover 1",
      "Cover 2",
      "Cover 3",
      "Cover 4",
      "Cover 6",
    ]) {
      expect(COVERAGES).toContain(coverage);
    }
    for (const formation of ["Trips", "Empty", "Bunch", "I Formation", "Pistol"]) {
      expect(FORMATIONS).toContain(formation);
    }
  });

  it("has no concept in both families", () => {
    const overlap = RUN_CONCEPTS.filter((c) =>
      (PASS_CONCEPTS as readonly string[]).includes(c),
    );
    expect(overlap).toEqual([]);
    expect(ALL_CONCEPTS.length).toBe(RUN_CONCEPTS.length + PASS_CONCEPTS.length);
  });
});

describe("conceptFamily", () => {
  it("classifies canonical concepts", () => {
    expect(conceptFamily("Inside Zone")).toBe("run");
    expect(conceptFamily("mesh")).toBe("pass");
  });

  // Guessing here would corrupt every run/pass split downstream, which is a
  // number coaches call plays from.
  it("returns null for a concept it does not know, rather than guessing", () => {
    expect(conceptFamily("Stretch")).toBeNull();
    expect(conceptFamily("Storm")).toBeNull();
  });
});

describe("membership checks", () => {
  it("is case-insensitive and ignores surrounding space", () => {
    expect(isCanonicalFormation("  trips right ")).toBe(true);
    expect(isCanonicalCoverage("COVER 2")).toBe(true);
    expect(isCanonicalPersonnel("11")).toBe(true);
    expect(isCanonicalFormation("Wildcat")).toBe(false);
  });
});

describe("personnelBreakdown", () => {
  it("expands the standard digits", () => {
    expect(personnelBreakdown("11")).toEqual({ backs: 1, tightEnds: 1, receivers: 3 });
    expect(personnelBreakdown("21")).toEqual({ backs: 2, tightEnds: 1, receivers: 2 });
    expect(personnelBreakdown("10")).toEqual({ backs: 1, tightEnds: 0, receivers: 4 });
    expect(personnelBreakdown("00")).toEqual({ backs: 0, tightEnds: 0, receivers: 5 });
  });

  it("is null for anything that is not a two-digit grouping", () => {
    expect(personnelBreakdown("Empty")).toBeNull();
    expect(personnelBreakdown("1")).toBeNull();
    expect(personnelBreakdown("99")).toBeNull();
  });
});
