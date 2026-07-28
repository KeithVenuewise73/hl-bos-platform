// HL-BTI Consulting Intelligence Framework — orchestrator.
//
// generateConsultingReport(assessment) turns a scored assessment into the full
// structured consulting package: evidence-traced findings (12-part), a
// prioritized roadmap, Herman Legacy solution mapping, an evidence-gated
// financial view, a deterministic executive narrative, and a CEO review package.
// Deterministic end to end; nothing is fabricated.

import { computeScorecard, type DimensionRating } from "../scoring.ts";
import { DOMAINS, DOMAIN_WEIGHTS } from "../index.ts";
import type { AssessmentInput, ConsultingReport, Claim } from "./types.ts";
import { buildFindings } from "./findings.ts";
import { buildRoadmap } from "./roadmap.ts";
import { mapSolutions } from "./solutions.ts";
import { buildFinancial } from "./financial.ts";
import { buildNarrative } from "./narrative.ts";
import { buildReview } from "./review.ts";

export * from "./types.ts";
export * from "./knowledge.ts";
export * from "./priority.ts";
export * from "./findings.ts";
export * from "./roadmap.ts";
export * from "./solutions.ts";
export * from "./financial.ts";
export * from "./narrative.ts";
export * from "./review.ts";
export * from "./industry.ts";
export * from "./render.ts";

export const CONSULTING_ENGINE_VERSION = "bti-consulting-0.1.0";

function toDimensionRatings(input: AssessmentInput): DimensionRating[] {
  const out: DimensionRating[] = [];
  for (const r of input.ratings) {
    const domain = DOMAINS.find((d) => d.key === r.domain);
    const dim = domain?.dimensions.find((d) => d.key === r.dimension);
    if (dim)
      out.push({
        domain: r.domain,
        dimension: r.dimension,
        rating: r.rating,
        weight: dim.weight,
      });
  }
  return out;
}

export function generateConsultingReport(input: AssessmentInput): ConsultingReport {
  const scores = computeScorecard(toDimensionRatings(input), DOMAIN_WEIGHTS);
  const findings = buildFindings(input);
  const roadmap = buildRoadmap(findings);
  const solutions = mapSolutions(findings);
  const financial = buildFinancial(input.financial);
  const narrative = buildNarrative(
    input.businessName,
    scores,
    findings,
    solutions,
    financial,
  );
  const review = buildReview(input, findings);

  const allClaims: Claim[] = findings.flatMap((f) => f.claims);
  const count = (t: Claim["type"]) => allClaims.filter((c) => c.type === t).length;

  const assessedDomains = new Set(input.ratings.map((r) => r.domain)).size;

  return {
    generatedFor: input.businessName,
    mode: input.mode,
    transformationScore: scores.transformation,
    findings,
    roadmap,
    solutions,
    financial,
    narrative,
    review,
    meta: {
      engineVersion: CONSULTING_ENGINE_VERSION,
      domainsAssessed: assessedDomains,
      dimensionsRated: input.ratings.length,
      findingsGenerated: findings.length,
      factCount: count("fact"),
      inferenceCount: count("inference"),
      opinionCount: count("opinion"),
    },
  };
}
