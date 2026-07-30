/**
 * The Transformation Intelligence pipeline — the single entry point.
 *
 * It composes existing, proven pieces rather than re-implementing them:
 *
 *   Raw Data ─▶ Analysis ─▶ Insights ─▶ Recommendations ─▶ Business Impact
 *            ─▶ CEO Approval ─▶ Execution ─▶ Measurement
 *
 *   - Analysis         → @hl-bos/bti-engine computeScorecard, with CONFIGURABLE
 *                        transformation weights (this is the configurable-scoring
 *                        surface: change the weights, the transformation score
 *                        moves; the per-dimension math is unchanged and honest).
 *   - Insights         → consulting.generateConsultingReport findings (reused).
 *   - Recommendations  → enriched here (impact, reuse, approvals).
 *   - Business Impact   → evidence-gated portfolio impact (this package).
 *   - CEO Approval      → deterministic required approvals (this package).
 *   - Execution         → NOT performed. Represented as the approval-gated action
 *                        set; the engine advises, humans act.
 *   - Measurement       → the success metrics to track post-execution.
 */

import {
  DOMAINS,
  computeScorecard,
  consulting,
  type DomainKey,
  type DimensionRating,
  type DomainWeight,
  type ExecutiveScorecard,
} from "@hl-bos/bti-engine";
import { ENGINE_VERSION, resolveConfig, type EngineConfigOverrides } from "./config";
import { portfolioImpact, type PortfolioImpact } from "./impact";
import { dedupeApprovals, type ApprovalRequirement } from "./approval";
import {
  buildRecommendations,
  type TransformationRecommendation,
} from "./recommendations";
import { softwareOpportunities, type SoftwareOpportunity } from "./hlvs";

export const PIPELINE_STAGES = [
  "raw_data",
  "analysis",
  "insights",
  "recommendations",
  "business_impact",
  "ceo_approval",
  "execution",
  "measurement",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface MeasurementMetric {
  metric: string;
  fromRecommendation: string;
  area: string | null;
}

export interface TransformationIntelligenceResult {
  meta: {
    engineVersion: string;
    configVersion: string;
    stages: readonly PipelineStage[];
    businessName: string;
    industryPack: string;
    mode: consulting.ConsultingReport["mode"];
    sample: boolean;
    dimensionsRated: number;
    findings: number;
    recommendations: number;
  };
  rawData: {
    businessName: string;
    industryPack: string;
    mode: consulting.ConsultingReport["mode"];
    ratedDimensions: number;
    sample: boolean;
  };
  /** What happened — the executive scorecard (configurable transformation weights). */
  analysis: ExecutiveScorecard;
  /** Why — the reused consulting findings (root causes, evidence, claims). */
  insights: consulting.Finding[];
  /** What to do — enriched executive recommendations. */
  recommendations: TransformationRecommendation[];
  /** Estimated business impact — evidence-gated portfolio total. */
  businessImpact: PortfolioImpact;
  /** What approval is required — deterministic, deduplicated. */
  approvals: ApprovalRequirement[];
  /** The software opportunities the assessment implies (HLVS). */
  softwareOpportunities: SoftwareOpportunity[];
  /** What to measure after execution. */
  measurementPlan: MeasurementMetric[];
}

// Canonical (domain.dimension) → weight, straight from the engine catalog.
const DIMENSION_WEIGHT: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  for (const d of DOMAINS) {
    for (const dim of d.dimensions) m.set(`${d.key}.${dim.key}`, dim.weight);
  }
  return m;
})();

function toDimensionRatings(
  ratings: consulting.AssessmentInput["ratings"],
): DimensionRating[] {
  return ratings.map((r) => ({
    domain: r.domain,
    dimension: r.dimension,
    rating: r.rating,
    weight: DIMENSION_WEIGHT.get(`${r.domain}.${r.dimension}`) ?? 5,
  }));
}

function toDomainWeights(
  domainWeights: Partial<Record<DomainKey, number>>,
): DomainWeight[] {
  return (Object.entries(domainWeights) as [DomainKey, number][]).map(
    ([domain, transformationWeight]) => ({ domain, transformationWeight }),
  );
}

/** Run the full pipeline over a scored assessment. Pure and deterministic. */
export function runTransformationIntelligence(
  input: consulting.AssessmentInput,
  overrides?: EngineConfigOverrides,
): TransformationIntelligenceResult {
  const config = resolveConfig(overrides);

  // Analysis — configurable transformation weights.
  const analysis = computeScorecard(
    toDimensionRatings(input.ratings),
    toDomainWeights(config.scoring.domainWeights),
  );

  // Insights — reuse the consulting engine's findings wholesale.
  const report = consulting.generateConsultingReport(input);
  const insights = report.findings;

  // Recommendations — enrich each finding.
  const recommendations = buildRecommendations(insights, input.financial, config);

  // Business impact — evidence-gated portfolio total.
  const businessImpact = portfolioImpact(recommendations.map((r) => r.revenueImpact));

  // CEO approval — deterministic, deduplicated across recommendations.
  const approvals = dedupeApprovals(recommendations.flatMap((r) => r.approvals));

  // HLVS — the implied software opportunities.
  const opportunities = softwareOpportunities(recommendations);

  // Measurement — distinct success metrics to track after execution.
  const seen = new Set<string>();
  const measurementPlan: MeasurementMetric[] = [];
  for (const rec of recommendations) {
    for (const metric of rec.successMetrics) {
      const id = `${rec.id}:${metric}`;
      if (seen.has(id)) continue;
      seen.add(id);
      measurementPlan.push({ metric, fromRecommendation: rec.id, area: rec.area });
    }
  }

  const sample = input.sample === true;

  return {
    meta: {
      engineVersion: ENGINE_VERSION,
      configVersion: config.version,
      stages: PIPELINE_STAGES,
      businessName: input.businessName,
      industryPack: input.industryPack,
      mode: input.mode,
      sample,
      dimensionsRated: input.ratings.length,
      findings: insights.length,
      recommendations: recommendations.length,
    },
    rawData: {
      businessName: input.businessName,
      industryPack: input.industryPack,
      mode: input.mode,
      ratedDimensions: input.ratings.length,
      sample,
    },
    analysis,
    insights,
    recommendations,
    businessImpact,
    approvals,
    softwareOpportunities: opportunities,
    measurementPlan,
  };
}
