import { describe, expect, it } from "vitest";

import type { DimensionScore } from "../../../supabase/functions/_shared/discovery/rubric.ts";
import {
  DEFAULT_SCORING_CONFIG,
  SCORING_VERSION,
  scoreOpportunity,
  topFindings,
  validateConfig,
  type ScoreInput,
} from "./score.ts";
import { suggestServices } from "./services.ts";
import type { Finding, FindingStatus, OpportunityScore } from "./types.ts";
import { VERTICALS } from "./verticals.ts";

const fd = (key: string, status: FindingStatus): Finding => ({
  key,
  label: key,
  status,
  source: key.startsWith("places.") ? "google_places" : "website",
  observedAt: "2026-10-14T00:00:00Z",
  evidence: `evidence for ${key}`,
  confidence: "high",
});

const comp = (s: OpportunityScore, k: string) =>
  s.components.find((c) => c.component === k)!;

const dims = (score: number): DimensionScore[] =>
  ["digital_presence", "customer_experience", "security"].map((dimension) => ({
    framework: "maturity" as const,
    dimension,
    score,
    severity: "info" as const,
    confidence: 1,
    evidenceKeys: [],
  }));

const allSite = (st: FindingStatus): Finding[] =>
  [
    "website.reachable",
    "site.rubric",
    "site.https",
    "site.title",
    "site.meta_description",
    "site.structured_data",
    "site.social_links",
    "site.copyright",
    "site.call",
    "site.email",
    "site.form",
    "site.booking",
    "site.ordering",
    "site.menu",
    "site.pricing",
    "site.services",
    "site.directions",
    "site.registration",
  ].map((k) =>
    fd(k, k === "website.reachable" || k === "site.rubric" ? "present" : st),
  );

const allPlaces = (st: FindingStatus) =>
  ["places.website", "places.phone", "places.hours", "places.photos"].map((k) =>
    fd(k, st),
  );

function input(o: Partial<ScoreInput>): ScoreInput {
  return {
    vertical: "contractor",
    websiteStatus: "ok",
    findings: [],
    rubric: undefined,
    reviews: undefined,
    ...o,
  };
}

/** Every awarded point must name a rule and existing findings. */
function assertEvidence(s: OpportunityScore, findings: Finding[]) {
  const keys = new Set(findings.map((f) => f.key));
  for (const c of s.components) {
    const sum = c.contributions.reduce((a, x) => a + x.points, 0);
    expect(sum).toBe(c.awarded);
    for (const x of c.contributions) {
      expect(x.ruleId).toMatch(/^[A-Z]+\.[a-z_]+$/);
      expect(x.points).toBeGreaterThan(0);
      expect(x.findingKeys.length).toBeGreaterThan(0);
      for (const k of x.findingKeys) expect(keys.has(k)).toBe(true);
    }
  }
}

describe("configuration", () => {
  it("is versioned presence-opportunity-0.1.0 and internally consistent", () => {
    expect(SCORING_VERSION).toBe("presence-opportunity-0.1.0");
    expect(DEFAULT_SCORING_CONFIG.version).toBe(SCORING_VERSION);
    expect(validateConfig(DEFAULT_SCORING_CONFIG)).toEqual([]);
  });

  it("catches a config whose weights do not sum to 100", () => {
    const bad = {
      ...DEFAULT_SCORING_CONFIG,
      weights: { ...DEFAULT_SCORING_CONFIG.weights, website: 40 },
    };
    expect(validateConfig(bad).join(" ")).toContain("sum to 110");
  });

  it("every vertical's conversion rules sum to the 20 conversion points", () => {
    for (const v of Object.values(VERTICALS))
      expect(Object.values(v.conversion).reduce((a, b) => a + b, 0)).toBe(20);
  });
});

describe("boundaries", () => {
  it("maximum: no website, no Google profile basics, no reviews -> 100", () => {
    const findings = [
      fd("website.exists", "missing"),
      ...allPlaces("missing"),
      fd("places.reviews", "missing"),
    ];
    const s = scoreOpportunity(
      input({
        websiteStatus: "none",
        findings,
        reviews: { rating: undefined, count: 0, findingKeys: ["places.reviews"] },
      }),
    );
    expect(comp(s, "website").awarded).toBe(30);
    expect(comp(s, "conversion").awarded).toBe(20);
    expect(comp(s, "reviews").awarded).toBe(9);
    expect(comp(s, "profile").awarded).toBe(15); // website 5 + phone 4 + hours 4 + photos 2
    expect(s.total).toBeLessThanOrEqual(100);
    assertEvidence(s, findings);
  });

  it("the best possible presence -> 0, with every component checked", () => {
    const findings = [
      ...allSite("present"),
      ...allPlaces("present"),
      fd("places.reviews", "present"),
    ];
    const s = scoreOpportunity(
      input({
        findings,
        rubric: dims(5),
        reviews: { rating: 4.9, count: 300, findingKeys: ["places.reviews"] },
      }),
    );
    expect(s.total).toBe(0);
    expect(s.checkedMax).toBe(100);
    for (const c of s.components) expect(c.status).toBe("scored");
  });

  it("never exceeds 100 or drops below 0 under any website status", () => {
    for (const ws of [
      "none",
      "social_only",
      "link_in_bio",
      "retired_google_site",
      "ok",
      "unreachable",
      "blocked",
      "not_checked",
    ] as const) {
      const findings = [
        fd("website.exists", "missing"),
        fd("website.social_only", "present"),
        fd("website.link_in_bio", "present"),
        fd("website.retired_google_site", "present"),
        ...allSite("missing"),
        ...allPlaces("missing"),
      ];
      const s = scoreOpportunity(
        input({
          websiteStatus: ws,
          findings,
          rubric: dims(0),
          reviews: { rating: 1, count: 0, findingKeys: ["places.reviews"] },
        }),
      );
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(100);
      expect(s.checkedMax).toBeLessThanOrEqual(100);
    }
  });
});

describe("1. website presence and quality (30)", () => {
  it.each([
    ["none", "website.exists", "W.no_site", 30],
    ["social_only", "website.social_only", "W.social_only", 30],
    ["link_in_bio", "website.link_in_bio", "W.link_in_bio", 27],
    ["retired_google_site", "website.retired_google_site", "W.retired_site", 30],
    ["unreachable", "website.reachable", "W.broken", 24],
  ] as const)("%s -> %s %s", (ws, key, rule, pts) => {
    const findings = [
      fd(key, ws === "none" || ws === "unreachable" ? "missing" : "present"),
    ];
    const s = scoreOpportunity(input({ websiteStatus: ws, findings }));
    const w = comp(s, "website");
    expect(w.awarded).toBe(pts);
    expect(w.contributions[0]!.ruleId).toBe(rule);
    assertEvidence(s, findings);
  });

  it("a working site is judged by the existing HL-BOS rubric, capped at 20", () => {
    const findings = allSite("present");
    expect(
      comp(scoreOpportunity(input({ findings, rubric: dims(0) })), "website").awarded,
    ).toBe(20);
    expect(
      comp(scoreOpportunity(input({ findings, rubric: dims(5) })), "website").awarded,
    ).toBe(0);
    const mid = scoreOpportunity(input({ findings, rubric: dims(2) }));
    expect(comp(mid, "website").awarded).toBe(12);
    expect(comp(mid, "website").contributions[0]!.findingKeys).toEqual(["site.rubric"]);
  });

  it("blocked and unknown websites are not checked, not zero", () => {
    expect(
      comp(
        scoreOpportunity(
          input({
            websiteStatus: "blocked",
            findings: [fd("website.reachable", "blocked")],
          }),
        ),
        "website",
      ).status,
    ).toBe("not_checked");
    expect(
      comp(scoreOpportunity(input({ websiteStatus: "not_checked" })), "website").status,
    ).toBe("not_checked");
  });
});

describe("2. conversion gaps (20), vertical-specific", () => {
  it("contractor: call 5, form 6, services 4, pricing 2, email 3", () => {
    const findings = [
      ...allSite("present"),
      fd("site.call", "not_found"),
      fd("site.form", "not_found"),
    ];
    // later entries override earlier ones in the lookup
    const s = scoreOpportunity(
      input({
        vertical: "contractor",
        findings: [
          ...allSite("present").filter(
            (f) => f.key !== "site.call" && f.key !== "site.form",
          ),
          ...findings.slice(-2),
        ],
        rubric: dims(5),
      }),
    );
    const c = comp(s, "conversion");
    expect(c.awarded).toBe(11);
    expect(c.contributions.map((x) => x.ruleId).sort()).toEqual([
      "C.missing_call",
      "C.missing_form",
    ]);
  });

  it("restaurant: a missing menu and ordering matter; booking a little", () => {
    const findings = allSite("present").map((f) =>
      ["site.menu", "site.ordering"].includes(f.key)
        ? { ...f, status: "not_found" as const }
        : f,
    );
    const c = comp(
      scoreOpportunity(
        input({ vertical: "restaurant_bar", findings, rubric: dims(5) }),
      ),
      "conversion",
    );
    expect(c.awarded).toBe(11);
  });

  it("salon: missing booking is the biggest single gap (7)", () => {
    const findings = allSite("present").map((f) =>
      f.key === "site.booking" ? { ...f, status: "not_found" as const } : f,
    );
    const c = comp(
      scoreOpportunity(input({ vertical: "salon_barber", findings, rubric: dims(5) })),
      "conversion",
    );
    expect(c.awarded).toBe(7);
  });

  it("the same page scores differently per vertical (a menu matters only to restaurants)", () => {
    const findings = allSite("present").map((f) =>
      f.key === "site.menu" ? { ...f, status: "not_found" as const } : f,
    );
    expect(
      comp(
        scoreOpportunity(
          input({ vertical: "restaurant_bar", findings, rubric: dims(5) }),
        ),
        "conversion",
      ).awarded,
    ).toBe(6);
    expect(
      comp(
        scoreOpportunity(input({ vertical: "contractor", findings, rubric: dims(5) })),
        "conversion",
      ).awarded,
    ).toBe(0);
  });

  it("no own website or a broken one -> all 20; link-in-bio -> not checked", () => {
    expect(
      comp(
        scoreOpportunity(
          input({
            websiteStatus: "social_only",
            findings: [fd("website.social_only", "present")],
          }),
        ),
        "conversion",
      ).awarded,
    ).toBe(20);
    expect(
      comp(
        scoreOpportunity(
          input({
            websiteStatus: "unreachable",
            findings: [fd("website.reachable", "missing")],
          }),
        ),
        "conversion",
      ).awarded,
    ).toBe(20);
    expect(
      comp(
        scoreOpportunity(
          input({
            websiteStatus: "link_in_bio",
            findings: [fd("website.link_in_bio", "present")],
          }),
        ),
        "conversion",
      ).status,
    ).toBe("not_checked");
  });

  it("a conversion fact that was not checked is skipped, and the component says partial", () => {
    const findings = allSite("present").filter((f) => f.key !== "site.form");
    const c = comp(
      scoreOpportunity(input({ findings, rubric: dims(5) })),
      "conversion",
    );
    expect(c.status).toBe("partial");
    expect(c.awarded).toBe(0);
  });
});

describe("3. reviews (15)", () => {
  const rv = (rating: number | undefined, count: number | undefined) =>
    comp(
      scoreOpportunity(
        input({
          findings: [fd("places.reviews", "present")],
          reviews: { rating, count, findingKeys: ["places.reviews"] },
        }),
      ),
      "reviews",
    );

  it("review volume tiers", () => {
    expect(rv(undefined, 0).awarded).toBe(9);
    expect(rv(4.8, 9).awarded).toBe(7);
    expect(rv(4.8, 24).awarded).toBe(4);
    expect(rv(4.8, 25).awarded).toBe(0);
  });

  it("rating thresholds (below 4.2, below 3.8)", () => {
    expect(rv(4.2, 100).awarded).toBe(0);
    expect(rv(4.1, 100).awarded).toBe(3);
    expect(rv(3.7, 100).awarded).toBe(6);
    expect(rv(3.0, 5).awarded).toBe(13);
  });

  it("missing review data is 'not checked', never zero reviews", () => {
    const s = scoreOpportunity(input({ reviews: undefined }));
    expect(comp(s, "reviews").status).toBe("not_checked");
    expect(comp(s, "reviews").awarded).toBe(0);
  });

  it("thresholds are configurable", () => {
    const cfg = {
      ...DEFAULT_SCORING_CONFIG,
      version: "test",
      reviews: { ...DEFAULT_SCORING_CONFIG.reviews, fewBelow: 50 },
    };
    const s = scoreOpportunity(
      input({
        findings: [fd("places.reviews", "present")],
        reviews: { rating: 4.8, count: 40, findingKeys: ["places.reviews"] },
      }),
      cfg,
    );
    expect(comp(s, "reviews").awarded).toBe(4);
    expect(s.version).toBe("test");
  });
});

describe("4. Google profile completeness (15)", () => {
  it("awards per missing profile field, with the field as evidence", () => {
    const findings = [
      fd("places.website", "missing"),
      fd("places.phone", "present"),
      fd("places.hours", "missing"),
      fd("places.photos", "present"),
    ];
    const p = comp(scoreOpportunity(input({ findings })), "profile");
    expect(p.awarded).toBe(9);
    expect(p.contributions.map((c) => c.ruleId)).toEqual([
      "P.no_website",
      "P.no_hours",
    ]);
  });

  it("is not checked for an imported business with no Google data", () => {
    expect(comp(scoreOpportunity(input({ findings: [] })), "profile").status).toBe(
      "not_checked",
    );
  });
});

describe("5. search basics (10)", () => {
  it("title 3, meta 3, structured data 2, HTTPS 2", () => {
    const findings = allSite("present").map((f) =>
      ["site.title", "site.https"].includes(f.key)
        ? { ...f, status: "missing" as const }
        : f,
    );
    const s = comp(scoreOpportunity(input({ findings, rubric: dims(5) })), "search");
    expect(s.awarded).toBe(5);
    expect(s.contributions.map((c) => c.ruleId).sort()).toEqual(["S.https", "S.title"]);
  });

  it("no own website -> 10", () => {
    expect(
      comp(
        scoreOpportunity(
          input({ websiteStatus: "none", findings: [fd("website.exists", "missing")] }),
        ),
        "search",
      ).awarded,
    ).toBe(10);
  });
});

describe("6. social presence and freshness (10)", () => {
  it("no social links 6, stale copyright 4", () => {
    const gap = (k: string): FindingStatus =>
      k === "site.copyright" ? "missing" : "not_found";
    const findings = allSite("present").map((f) =>
      ["site.social_links", "site.copyright"].includes(f.key)
        ? { ...f, status: gap(f.key) }
        : f,
    );
    const s = comp(scoreOpportunity(input({ findings, rubric: dims(5) })), "social");
    expect(s.awarded).toBe(10);
  });

  it("a copyright year that could not be read is not counted against them", () => {
    const findings = allSite("present").map((f) =>
      f.key === "site.copyright" ? { ...f, status: "not_checked" as const } : f,
    );
    const s = comp(scoreOpportunity(input({ findings, rubric: dims(5) })), "social");
    expect(s.status).toBe("partial");
    expect(s.awarded).toBe(0);
  });

  it("a Facebook-only business has social presence: 0 points, partially checked", () => {
    const s = comp(
      scoreOpportunity(
        input({
          websiteStatus: "social_only",
          findings: [fd("website.social_only", "present")],
        }),
      ),
      "social",
    );
    expect(s.awarded).toBe(0);
    expect(s.status).toBe("partial");
  });
});

describe("determinism, evidence and services", () => {
  const findings = [
    ...allSite("not_found"),
    ...allPlaces("missing"),
    fd("places.reviews", "present"),
  ];
  const inp = input({
    findings,
    rubric: dims(1),
    reviews: { rating: 3.9, count: 8, findingKeys: ["places.reviews"] },
  });

  it("the same input always gives the same score", () => {
    expect(scoreOpportunity(inp)).toEqual(scoreOpportunity(inp));
  });

  it("every contribution names a rule and real findings", () => {
    assertEvidence(scoreOpportunity(inp), findings);
  });

  it("top findings are the three biggest contributions", () => {
    const top = topFindings(scoreOpportunity(inp));
    expect(top).toHaveLength(3);
    expect(top[0]).toMatch(/\(\+16\)$/);
  });

  it("suggested services come from the BTI growth map, with no prices", () => {
    const services = suggestServices(scoreOpportunity(inp));
    expect(services.map((s) => s.service)).toContain("Website Modernization");
    expect(services.map((s) => s.service)).toContain("Local Presence Management");
    expect(JSON.stringify(services)).not.toMatch(/\$\d/);
  });
});
