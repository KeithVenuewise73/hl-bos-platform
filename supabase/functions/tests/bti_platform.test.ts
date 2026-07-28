// HL-BTI (PCO #1) edge-layer unit tests (Deno).
//
// Covers the deterministic, offline half of HL-BTI that lives in the edge layer:
//   * scoring.ts   — executive 7-score engine; MUST match the DB authority
//                    bti.compute_scores (business 80 / operations 70 /
//                    growth null / transformation 75 for the shared fixture)
//   * lifecycle.ts — engagement stage machine + Venuewise analysis-only cap
//   * growth.ts    — Growth Intelligence: priority + estimated ROI + service
//   * blueprint.ts — deterministic executive blueprint assembly, honest empties
//
// The DB half (RLS, permissions, workflow gate, tenant isolation, audit) is
// covered by supabase/tests/28_bti_platform.sql. Self-contained: imports only
// local _shared modules, so it runs offline. CI runs `deno test`; where Deno is
// unavailable the identical file runs under Node 22 via the `tsx` Deno.test shim.

import {
  computeScorecard,
  type DimensionRating,
  type DomainWeight,
} from "../_shared/bti/scoring.ts";
import { canAdvance, nextStage, stageRank } from "../_shared/bti/lifecycle.ts";
import { analyzeGrowth } from "../_shared/bti/growth.ts";
import { assembleExecutiveBlueprint } from "../_shared/bti/blueprint.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b)
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// The same fixture the DB test uses: business dims all 4, operations 5 & 2.
const BUSINESS_DIMS = [
  { dimension: "business_maturity", weight: 7 },
  { dimension: "leadership", weight: 6 },
  { dimension: "processes", weight: 6 },
  { dimension: "customer_experience", weight: 7 },
  { dimension: "growth_readiness", weight: 7 },
];
const RATINGS: DimensionRating[] = [
  ...BUSINESS_DIMS.map((d) => ({
    domain: "business" as const,
    dimension: d.dimension,
    rating: 4,
    weight: d.weight,
  })),
  { domain: "operations", dimension: "operations", rating: 5, weight: 7 },
  { domain: "operations", dimension: "supply_chain", rating: 2, weight: 7 },
];
const DOMAIN_WEIGHTS: DomainWeight[] = [
  { domain: "business", transformationWeight: 9 },
  { domain: "operations", transformationWeight: 8 },
  { domain: "growth", transformationWeight: 8 },
  { domain: "technology", transformationWeight: 7 },
  { domain: "ai_readiness", transformationWeight: 7 },
  { domain: "financial", transformationWeight: 8 },
];

Deno.test("scoring: mirrors the DB authority deterministically (80 / 70)", () => {
  const s = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
  assertEquals(s.businessHealth, 80, "business health");
  assertEquals(s.operations, 70, "operations");
  assertEquals(s.domainScores.business, 80, "business domain score");
  assertEquals(s.domainScores.operations, 70, "operations domain score");
});

Deno.test("scoring: unrated domains are honest nulls, never fabricated", () => {
  const s = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
  assertEquals(s.growth, null, "growth null");
  assertEquals(s.technology, null, "technology null");
  assertEquals(s.aiReadiness, null, "ai_readiness null");
  assertEquals(s.financialOpportunity, null, "financial null");
});

Deno.test(
  "scoring: transformation is the weighted mean of present domains (75)",
  () => {
    const s = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
    // (80*9 + 70*8) / (9+8) = 1280/17 = 75.29 → 75
    assertEquals(s.transformation, 75, "transformation");
  },
);

Deno.test(
  "scoring: no ratings yields an all-null scorecard (no invented numbers)",
  () => {
    const s = computeScorecard([], DOMAIN_WEIGHTS);
    assertEquals(s.transformation, null, "transformation null");
    assertEquals(s.businessHealth, null, "business null");
    assertEquals(Object.keys(s.domainScores).length, 0, "no domain scores");
  },
);

Deno.test("lifecycle: forward one step ok; skipping blocked", () => {
  assert(
    canAdvance("prospect", "lead_qualification", "full_transformation").ok,
    "one step",
  );
  const skip = canAdvance("prospect", "blueprint", "full_transformation");
  assert(!skip.ok && skip.code === "not_one_step", "skip blocked");
});

Deno.test("lifecycle: analysis-only cap blocks past blueprint (Venuewise)", () => {
  const capped = canAdvance("blueprint", "proposal", "analysis_only");
  assert(!capped.ok && capped.code === "analysis_only_cap", "cap enforced");
  // full transformation may proceed past blueprint
  assert(
    canAdvance("blueprint", "proposal", "full_transformation").ok,
    "full proceeds",
  );
  assertEquals(
    nextStage("blueprint", "analysis_only"),
    null,
    "no next for analysis-only at cap",
  );
  assertEquals(
    nextStage("blueprint", "full_transformation"),
    "proposal",
    "full next is proposal",
  );
});

Deno.test("lifecycle: side states reachable; forward from a side state blocked", () => {
  assert(
    canAdvance("lead_qualification", "on_hold", "full_transformation").ok,
    "on_hold reachable",
  );
  const fwd = canAdvance("on_hold", "assessment", "full_transformation");
  assert(!fwd.ok && fwd.code === "from_side_state", "no forward from side state");
  assertEquals(stageRank("on_hold"), 0, "side state rank 0");
});

Deno.test(
  "growth: weak dimensions become prioritized, ROI-tagged, service-mapped recs",
  () => {
    const r = analyzeGrowth([
      { dimension: "seo", rating: 1 },
      { dimension: "conversion", rating: 2 },
      { dimension: "website", rating: 5 },
      // 'reviews' intentionally omitted → unrated
    ]);
    assertEquals(r.recommendations.length, 2, "two recommendations");
    assertEquals(r.recommendations[0].dimension, "seo", "critical seo first");
    assertEquals(r.recommendations[0].priority, "critical", "seo critical");
    assertEquals(
      r.recommendations[0].recommendedService,
      "SEO Optimization",
      "seo service",
    );
    assert(r.recommendations[0].estimatedRoi === "high", "seo high ROI");
    assertEquals(r.strengths.length, 1, "website is a strength");
    assertEquals(r.strengths[0].dimension, "website", "website strength");
    assert(r.unrated.includes("reviews"), "reviews reported unrated, not scored");
  },
);

Deno.test(
  "growth: every recommendation carries priority + ROI + a Herman Legacy service",
  () => {
    const r = analyzeGrowth([
      { dimension: "website", rating: 1 },
      { dimension: "seo", rating: 3 },
      { dimension: "lead_generation", rating: 2 },
    ]);
    for (const rec of r.recommendations) {
      assert(!!rec.priority, "has priority");
      assert(!!rec.estimatedRoi, "has ROI band");
      assert(!!rec.recommendedService, "has recommended service");
    }
  },
);

Deno.test("blueprint: assembles all mandated sections; empties are honest", () => {
  const scores = computeScorecard(RATINGS, DOMAIN_WEIGHTS);
  const growth = analyzeGrowth([{ dimension: "seo", rating: 1 }]);
  const bp = assembleExecutiveBlueprint({
    scores,
    growth,
    recommendations: [
      {
        title: "Fix SEO",
        priority: "critical",
        estimatedRoi: "high",
        recommendedService: "SEO Optimization",
      },
    ],
  });
  assertEquals(bp.sections.length, 17, "all 17 sections present");
  const summary = bp.sections.find((s) => s.key === "executive_summary")!;
  assert(summary.hasData, "summary has data");
  const roi = bp.sections.find((s) => s.key === "estimated_roi")!;
  assert(!roi.hasData && !!roi.note, "roi empty is explained, not faked");
});

Deno.test(
  "blueprint: no scores → summary marked empty with a reason (never fabricated)",
  () => {
    const scores = computeScorecard([], DOMAIN_WEIGHTS);
    const growth = analyzeGrowth([]);
    const bp = assembleExecutiveBlueprint({ scores, growth, recommendations: [] });
    const summary = bp.sections.find((s) => s.key === "executive_summary")!;
    assert(!summary.hasData, "summary empty");
    assert(!!summary.note, "empty summary has a stated reason");
    assert(!bp.complete, "blueprint not complete with no data");
  },
);
