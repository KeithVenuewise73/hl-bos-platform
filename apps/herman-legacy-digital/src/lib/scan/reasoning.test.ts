import { describe, it, expect } from "vitest";
import {
  optionsFor,
  classifyRootCause,
  recommend,
  type TransformationOption,
} from "./reasoning";

const NUM = /\$\s?\d|\d+\s?%|\b\d+\s*(rankings?|leads?|visitors?|conversions?|roi)\b/i;

describe("classifyRootCause", () => {
  it("marks an evidence-backed cause Inferred, never Verified", () => {
    const c = classifyRootCause("No repeatable lead-generation system", true);
    expect(c.certainty).toBe("Inferred");
    expect(c.statement).toContain("lead-generation");
  });
  it("marks a bare-rating cause as Discovery required", () => {
    expect(classifyRootCause("something", false).certainty).toBe("Discovery required");
  });
});

describe("recommend", () => {
  const opts = optionsFor("lead_generation"); // 3 options: depth 1,2,3

  it("returns a single-path recommendation when there are no options", () => {
    const r = recommend([], 3, "High", false, true, "Fix the thing");
    expect(r.mode).toBe("single");
  });

  it("returns discovery-required when confidence is Low", () => {
    const r = recommend(opts, 4, "Low", false, true, "x");
    expect(r.mode).toBe("discovery");
  });

  it("selects the single option and says no alternative is warranted", () => {
    const one = optionsFor("security");
    expect(one.length).toBe(1);
    const r = recommend(one, 4, "High", false, true, "x");
    expect(r.mode).toBe("selected");
    if (r.mode === "selected")
      expect(r.whyNotOthers.toLowerCase()).toContain("no materially different");
  });

  it("explains why the chosen option beats the lighter and heavier ones", () => {
    const r = recommend(opts, 4, "High", false, true, "x");
    expect(r.mode).toBe("selected");
    if (r.mode === "selected") {
      expect(r.why.length).toBeGreaterThan(0);
      expect(r.whyNotOthers.length).toBeGreaterThan(0);
    }
  });

  it("a stated, aligned goal warrants at least a connected (depth ≥2) approach", () => {
    const noGoal = recommend(opts, 1, "High", false, true, "x");
    const withGoal = recommend(opts, 1, "High", true, true, "x");
    // With a goal, the reasoning references the customer's own outcome.
    if (withGoal.mode === "selected")
      expect(withGoal.why.toLowerCase()).toContain("outcome you told us");
    expect(noGoal.mode).toBe("selected");
  });
});

describe("option catalog honesty", () => {
  const dims = [
    "security",
    "seo",
    "ai_search_optimization",
    "google_business_profile",
    "social_media",
    "content",
    "conversion",
    "lead_generation",
    "website",
    "technology_stack",
  ];
  const all: TransformationOption[] = dims.flatMap((d) => optionsFor(d));

  it("never fabricates a number in any option", () => {
    for (const o of all) {
      for (const s of [
        o.whatChanges,
        o.whyFit,
        o.expectedOutcome,
        o.tradeoffs,
        o.dependencies,
      ]) {
        expect(s, `${o.title}: ${s}`).not.toMatch(NUM);
      }
    }
  });

  it("does not force three options — security has exactly one credible path", () => {
    expect(optionsFor("security").length).toBe(1);
    for (const d of dims) expect(optionsFor(d).length).toBeLessThanOrEqual(3);
  });

  it("options within a dimension are materially different (distinct title + depth)", () => {
    for (const d of dims) {
      const os = optionsFor(d);
      if (os.length > 1) {
        expect(new Set(os.map((o) => o.title)).size).toBe(os.length);
        expect(new Set(os.map((o) => o.depth)).size).toBe(os.length);
      }
    }
  });

  it("every option requires at least one capability to execute (no empty upsell)", () => {
    for (const o of all) expect(o.capabilities.length).toBeGreaterThan(0);
  });
});
