import { describe, it, expect } from "vitest";
import {
  SCORING_VERSION,
  POPULARITY_WEIGHTS,
  SUITABILITY_WEIGHTS,
  blendGlobalAndCategory,
  buildabilityValue,
  clamp01,
  licenceValue,
  logNormalize,
  maintenanceValue,
  monetizationValue,
  popularityScore,
  recencyValue,
  stackValue,
  suitabilityScore,
  type ScoringInput,
} from "./scoring";

const AS_OF = "2026-08-20T00:00:00Z";

const input = (over: Partial<ScoringInput> = {}): ScoringInput => ({
  stars: 100,
  forks: 10,
  openIssues: 5,
  pushedAt: "2026-08-01T00:00:00Z",
  archived: false,
  topics: [],
  license: "MIT",
  language: "TypeScript",
  category: "developer-tools",
  searchPattern: "POPULAR",
  starsPercentileInCategory: 0.5,
  forksPercentileInCategory: 0.5,
  asOf: AS_OF,
  ...over,
});

describe("the two scores stay two scores", () => {
  it("weights each score to exactly 100, so neither can be padded", () => {
    expect(Object.values(POPULARITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(SUITABILITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("returns popularity and suitability as separate results, never a blend", () => {
    const pop = popularityScore(input());
    const fit = suitabilityScore(input(), { value: 0.9, basis: "test" });
    expect(pop).not.toHaveProperty("overall");
    expect(fit).not.toHaveProperty("overall");
    expect(pop.score).not.toBe(fit.score);
  });

  it("labels suitability estimated and popularity measured — never the reverse", () => {
    expect(popularityScore(input()).status).toBe("measured");
    // Suitability is an inference from observable properties. Calling it
    // measured would be the invention the brief forbids.
    expect(suitabilityScore(input(), { value: 1, basis: "" }).status).toBe("estimated");
  });

  it("has a version, so a past ranking can be re-derived", () => {
    expect(SCORING_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });
});

describe("popularity — unknown is not zero", () => {
  it("scores an opportunity with no repository metrics as unknown, not as bottom of the list", () => {
    const r = popularityScore(
      input({ stars: null, forks: null, openIssues: null, pushedAt: null }),
    );
    expect(r.score).toBeNull();
    expect(r.status).toBe("unknown");
    expect(r.components).toEqual([]);
  });

  it("scores a real repository between 0 and 100 with an auditable breakdown", () => {
    const r = popularityScore(input());
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.components.map((c) => c.component)).toEqual([
      "stars", "forks", "issue_activity", "recency", "topic_breadth",
    ]);
    for (const c of r.components) expect(c.basis).not.toBe("");
  });

  it("ranks a busy recent project above an identical stale one", () => {
    const fresh = popularityScore(input({ pushedAt: "2026-08-19T00:00:00Z" }));
    const stale = popularityScore(input({ pushedAt: "2020-01-01T00:00:00Z" }));
    expect(fresh.score!).toBeGreaterThan(stale.score!);
  });
});

describe("popularity — one giant must not dominate every category", () => {
  it("keeps a category leader competitive with a mid-pack giant", () => {
    // The CEO's instruction, as a test. A 400k-star repo sitting mid-pack in a
    // huge category should not automatically outrank the clear leader of a
    // smaller one, because that would make every category a referendum on
    // whichever project happens to be the most famous.
    const giantMidPack = popularityScore(
      input({ stars: 400_000, forks: 30_000, starsPercentileInCategory: 0.5, forksPercentileInCategory: 0.5 }),
    );
    const categoryLeader = popularityScore(
      input({ stars: 4_000, forks: 400, starsPercentileInCategory: 1, forksPercentileInCategory: 1 }),
    );
    expect(categoryLeader.score!).toBeGreaterThan(0.7 * giantMidPack.score!);
  });

  it("still puts a giant above a nobody — the correction is not an inversion", () => {
    const giant = popularityScore(input({ stars: 400_000, forks: 30_000, starsPercentileInCategory: 1 }));
    const nobody = popularityScore(input({ stars: 2, forks: 0, starsPercentileInCategory: 0.01 }));
    expect(giant.score!).toBeGreaterThan(nobody.score!);
  });

  it("uses the global scale alone when a category percentile is unavailable", () => {
    expect(blendGlobalAndCategory(0.8, null)).toBeCloseTo(0.8);
    expect(blendGlobalAndCategory(0.8, 0.2)).toBeCloseTo(0.5);
  });
});

describe("normalizers", () => {
  it("log-normalizes so the 10-to-1000 gap outweighs the 200k-to-201k gap", () => {
    const small = logNormalize(1_000, 500_000) - logNormalize(10, 500_000);
    const large = logNormalize(201_000, 500_000) - logNormalize(200_000, 500_000);
    expect(small).toBeGreaterThan(large);
  });

  it("treats a missing or negative value as zero rather than throwing", () => {
    expect(logNormalize(null, 100)).toBe(0);
    expect(logNormalize(-5, 100)).toBe(0);
  });

  it("clamps every normalized value into 0-1", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(4)).toBe(1);
    expect(logNormalize(10_000_000, 1_000)).toBe(1);
  });

  it("decays recency to zero over the horizon and never below", () => {
    expect(recencyValue("2026-08-20T00:00:00Z", AS_OF).value).toBeCloseTo(1);
    expect(recencyValue("2010-01-01T00:00:00Z", AS_OF).value).toBe(0);
    expect(recencyValue(null, AS_OF).value).toBe(0);
    expect(recencyValue("not a date", AS_OF).value).toBe(0);
  });
});

describe("HLG suitability components", () => {
  it("prefers licences under which derived work can be commercialized", () => {
    expect(licenceValue("MIT").value).toBe(1);
    expect(licenceValue("Apache-2.0").value).toBe(1);
    expect(licenceValue("AGPL-3.0").value).toBeLessThan(licenceValue("MIT").value);
    // No licence is worse than copyleft: copyleft at least states its terms.
    expect(licenceValue(null).value).toBeLessThan(licenceValue("AGPL-3.0").value);
    expect(licenceValue("NOASSERTION").value).toBe(licenceValue(null).value);
  });

  it("rewards the stack HL-BOS already operates", () => {
    expect(stackValue("TypeScript").value).toBe(1);
    expect(stackValue("Python").value).toBe(1);
    expect(stackValue("Erlang").value).toBeLessThan(1);
    expect(stackValue(null).value).toBeLessThan(1);
  });

  it("peaks buildability at proven-but-matchable scale, not at either extreme", () => {
    const mid = buildabilityValue(3_000).value;
    expect(mid).toBeGreaterThan(buildabilityValue(300_000).value);
    expect(mid).toBeGreaterThan(buildabilityValue(1).value);
    // A giant is still worth understanding — never floored to zero.
    expect(buildabilityValue(400_000).value).toBeGreaterThan(0);
  });

  it("treats a stalled project with real users as an opening", () => {
    const abandonedWithUsers = maintenanceValue("ABANDONED", false, 5_000).value;
    const activeAndHealthy = maintenanceValue("POPULAR", false, 5_000).value;
    expect(abandonedWithUsers).toBeGreaterThan(activeAndHealthy);
    // ...but a stalled project nobody used is a weaker opening than one people did.
    expect(maintenanceValue("ABANDONED", false, 2).value).toBeLessThan(abandonedWithUsers);
  });

  it("reads commercial shape from declared topics and discovery pattern", () => {
    expect(monetizationValue(["saas", "billing", "crm", "multi-tenant"], "POPULAR").value).toBe(1);
    expect(monetizationValue([], "SELF-HOSTED").value).toBeGreaterThan(
      monetizationValue([], "POPULAR").value,
    );
    expect(monetizationValue([], "POPULAR").basis).toContain("no commercial-shape topics");
  });

  it("scores 0-100 with every component carrying its own justification", () => {
    const r = suitabilityScore(input(), { value: 0.8, basis: "logistics category" });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.components).toHaveLength(6);
    for (const c of r.components) {
      expect(c.basis).not.toBe("");
      expect(c.value).toBeGreaterThanOrEqual(0);
      expect(c.value).toBeLessThanOrEqual(1);
    }
  });

  it("separates the four quadrants the CEO asked to be able to see", () => {
    const popularOutsideCore = {
      pop: popularityScore(input({ stars: 90_000, forks: 9_000, starsPercentileInCategory: 0.99 })),
      fit: suitabilityScore(
        input({ stars: 90_000, license: "AGPL-3.0", language: "Erlang" }),
        { value: 0, basis: "no overlap" },
      ),
    };
    const nicheHighFit = {
      pop: popularityScore(input({ stars: 60, forks: 4, starsPercentileInCategory: 0.2 })),
      fit: suitabilityScore(input({ stars: 60 }), { value: 1, basis: "logistics" }),
    };
    expect(popularOutsideCore.pop.score!).toBeGreaterThan(nicheHighFit.pop.score!);
    expect(nicheHighFit.fit.score!).toBeGreaterThan(popularOutsideCore.fit.score!);
  });
});
