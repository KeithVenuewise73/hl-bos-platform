import { describe, expect, it } from "vitest";
import {
  coverage,
  extractNumbers,
  extractYears,
  normalize,
  normalizeNumber,
  stem,
  tokenize,
} from "./text.ts";

describe("normalize", () => {
  it("folds case, accents and punctuation", () => {
    expect(normalize("Café  MANAGER, Inc.")).toBe("cafe manager inc.");
  });

  it("drops apostrophes so possessives collide with plain forms", () => {
    // Regression: a posting asking for a "bachelor's degree" did not match a
    // resume listing one, because the apostrophe survived normalisation.
    expect(normalize("Bachelor's")).toBe(normalize("bachelors"));
  });

  it("keeps the characters that carry meaning in a resume", () => {
    expect(normalize("P&L for $18M at 98.5%")).toBe("p&l for $18m at 98.5%");
  });
});

describe("tokenize", () => {
  it("strips sentence punctuation without breaking abbreviations", () => {
    // Regression: "field." was a different token from "field".
    expect(tokenize("a related field.")).toContain("field");
    expect(tokenize("B.S. Business")).toContain("b.s");
  });

  it("removes stopwords but keeps operational verbs", () => {
    const tokens = tokenize("was responsible for the management of drivers");
    expect(tokens).not.toContain("was");
    expect(tokens).toContain("management");
    expect(tokens).toContain("drivers");
  });
});

describe("stem", () => {
  it("collides the forms of the same word", () => {
    expect(stem("manages")).toBe(stem("managing"));
    expect(stem("deliveries")).toBe(stem("delivery"));
  });
});

describe("extractNumbers", () => {
  it("finds every quantity a sentence asserts", () => {
    expect(extractNumbers("85 routes, 98.5% on-time, $18M budget")).toEqual([
      "85",
      "98.5%",
      "18m",
    ]);
  });

  it("normalises the same quantity written differently", () => {
    expect(normalizeNumber("$2.4 M")).toBe("2.4m");
    expect(normalizeNumber("1,250")).toBe("1250");
    expect(normalizeNumber("40 percent")).toBe("40%");
  });
});

describe("extractYears", () => {
  it("reads a years-of-experience demand", () => {
    expect(extractYears("10+ years of progressive experience")).toBe(10);
    expect(extractYears("no numeric requirement here")).toBeUndefined();
  });
});

describe("coverage", () => {
  it("measures how much of the need the evidence accounts for", () => {
    expect(coverage(new Set(["a", "b", "c", "d"]), new Set(["a", "b"]))).toBe(0.5);
    expect(coverage(new Set(), new Set(["a"]))).toBe(0);
  });
});
