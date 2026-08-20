import { describe, it, expect } from "vitest";
import {
  ALL_PORTFOLIOS,
  CORE_PORTFOLIOS,
  LOGISTICS,
  OUTSIDE_CORE,
  QUALIFICATION_THRESHOLD,
  SPORTS,
  TRANSFORMATION,
  bestCoreMatch,
  matchPortfolio,
  qualifiesOutsideCore,
  type MatchSubject,
} from "./portfolios";
import { DISCOVERY_CATEGORIES } from "./discovery-matrix";

const subject = (over: Partial<MatchSubject> = {}): MatchSubject => ({
  category: null,
  title: "",
  summary: "",
  topics: [],
  ...over,
});

describe("portfolio definitions", () => {
  it("defines the four repository portfolios the CEO named", () => {
    expect(ALL_PORTFOLIOS.map((p) => p.key)).toEqual([
      "logistics", "transformation", "sports", "outside-core",
    ]);
  });

  it("ranks outside-core on popularity — ranking it on HLG fit would defeat its purpose", () => {
    expect(OUTSIDE_CORE.rankBy).toBe("popularity");
    for (const p of CORE_PORTFOLIOS) expect(p.rankBy).toBe("suitability");
  });

  it("names only discovery categories that actually exist in the corpus", () => {
    // A category key that no query ever produced would silently contribute
    // nothing, and the portfolio would look thin for no visible reason.
    const real = new Set(DISCOVERY_CATEGORIES.map((c) => c.key));
    for (const p of CORE_PORTFOLIOS) {
      for (const key of p.categories) expect(real.has(key)).toBe(true);
    }
  });

  it("records HLG product context so overlap is reported rather than resolved", () => {
    // Overlap with HomeHuddle may mean reuse, integrate, acquire, partner,
    // improve — or pass. It must never silently mean "build".
    expect(SPORTS.hlgContext).toContain("HomeHuddle");
    expect(SPORTS.hlgContext).toContain("Venuewise");
    expect(TRANSFORMATION.hlgContext).toContain("Herman Legacy Digital");
    expect(LOGISTICS.hlgContext).toContain("HSCS");
  });
});

describe("matching is deterministic and explicable", () => {
  it("counts a discovery category as the strongest evidence, because it is provenance", () => {
    const m = matchPortfolio(subject({ category: "logistics" }), LOGISTICS);
    expect(m.categoryMatch).toBe(true);
    expect(m.value).toBeGreaterThanOrEqual(0.6);
    expect(m.basis).toContain("logistics");
  });

  it("matches vocabulary in the name, description and topics", () => {
    const m = matchPortfolio(
      subject({
        title: "acme/route-planner",
        summary: "Route optimization and dispatch for delivery fleets",
        topics: ["logistics", "fleet"],
      }),
      LOGISTICS,
    );
    expect(m.matchedTerms).toContain("route optimization");
    expect(m.matchedTerms).toContain("dispatch");
    expect(m.value).toBeGreaterThan(QUALIFICATION_THRESHOLD);
  });

  it("respects word boundaries, so a substring is not a match", () => {
    // "crm" inside "scrmble" is not a CRM.
    const m = matchPortfolio(subject({ summary: "a scrmble of letters" }), TRANSFORMATION);
    expect(m.matchedTerms).not.toContain("crm");
  });

  it("saturates: repeating a word does not make a project more logistics", () => {
    const four = matchPortfolio(
      subject({ summary: "delivery dispatch routing warehouse" }),
      LOGISTICS,
    );
    const eight = matchPortfolio(
      subject({ summary: "delivery dispatch routing warehouse fleet driver inventory shipping" }),
      LOGISTICS,
    );
    expect(eight.value).toBe(four.value);
  });

  it("explains every match in words the CEO can check", () => {
    const m = matchPortfolio(subject({ summary: "team roster and tournament brackets" }), SPORTS);
    expect(m.basis).toMatch(/matched/);
    const none = matchPortfolio(subject({ summary: "a rust compiler" }), SPORTS);
    expect(none.basis).toBe("no domain terms matched");
    expect(none.value).toBe(0);
  });
});

describe("outside-core is defined by exclusion", () => {
  it("excludes anything a core domain already claims", () => {
    expect(
      qualifiesOutsideCore(subject({ category: "logistics", summary: "fleet dispatch" })),
    ).toBe(false);
    expect(
      qualifiesOutsideCore(subject({ category: "sports-technology", summary: "team roster" })),
    ).toBe(false);
  });

  it("admits strong opportunities from unfamiliar markets without penalising them", () => {
    const astronomy = subject({
      category: "3d-graphics",
      title: "org/telescope-control",
      summary: "Automated telescope control for amateur astronomers",
      topics: ["astronomy"],
    });
    expect(qualifiesOutsideCore(astronomy)).toBe(true);
    expect(bestCoreMatch(astronomy).portfolio).toBeNull();
  });

  it("leaves no record in limbo — every record is core-eligible or outside-eligible", () => {
    const cases = [
      subject({ category: "logistics" }),
      subject({ category: "parenting", summary: "chore chart" }),
      subject({ summary: "" }),
      subject({ category: "crm", summary: "customer records" }),
    ];
    for (const s of cases) {
      const core = bestCoreMatch(s).value >= QUALIFICATION_THRESHOLD;
      expect(core || qualifiesOutsideCore(s)).toBe(true);
    }
  });
});
