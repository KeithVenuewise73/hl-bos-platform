// Deterministic HL-BTI Executive Blueprint assembly — canonical mirror of the
// edge `_shared/bti/blueprint.ts`. Structure is code; narrative is advisory AI
// (added elsewhere). Sections with no data are emitted empty-with-a-reason.

import type { DomainKey } from "./types.ts";
import type { ExecutiveScorecard } from "./scoring.ts";
import type { GrowthIntelligenceResult } from "./growth.ts";

export const BLUEPRINT_SECTIONS = [
  "executive_summary",
  "current_state",
  "strengths",
  "weaknesses",
  "quick_wins",
  "transformation_opportunities",
  "operational_improvements",
  "growth_strategy",
  "marketing_strategy",
  "seo_strategy",
  "ai_strategy",
  "roadmap_90_day",
  "roadmap_6_month",
  "vision_12_month",
  "estimated_roi",
  "recommended_services",
  "implementation_plan",
] as const;

export type BlueprintSectionKey = (typeof BLUEPRINT_SECTIONS)[number];

export interface BlueprintSection {
  key: BlueprintSectionKey;
  title: string;
  hasData: boolean;
  content: Record<string, unknown>;
  note?: string;
}

export interface ExecutiveBlueprint {
  scores: ExecutiveScorecard;
  sections: BlueprintSection[];
  complete: boolean;
}

const TITLES: Record<BlueprintSectionKey, string> = {
  executive_summary: "Executive Summary",
  current_state: "Current State",
  strengths: "Strengths",
  weaknesses: "Weaknesses",
  quick_wins: "Quick Wins",
  transformation_opportunities: "Transformation Opportunities",
  operational_improvements: "Operational Improvements",
  growth_strategy: "Growth Strategy",
  marketing_strategy: "Marketing Strategy",
  seo_strategy: "SEO Strategy",
  ai_strategy: "AI Strategy",
  roadmap_90_day: "90-Day Roadmap",
  roadmap_6_month: "6-Month Roadmap",
  vision_12_month: "12-Month Vision",
  estimated_roi: "Estimated ROI",
  recommended_services: "Recommended Herman Legacy Services",
  implementation_plan: "Implementation Plan",
};

const DOMAIN_LABEL: Record<DomainKey, string> = {
  business: "Business",
  operations: "Operations",
  growth: "Growth",
  technology: "Technology",
  ai_readiness: "AI Readiness",
  financial: "Financial",
};

export interface BlueprintRecommendation {
  title: string;
  priority: string;
  estimatedRoi?: string;
  recommendedService?: string;
}

export interface BlueprintInputs {
  scores: ExecutiveScorecard;
  growth: GrowthIntelligenceResult;
  recommendations: BlueprintRecommendation[];
  roiMetrics?: {
    label: string;
    baseline?: number;
    projected?: number;
    unit?: string;
  }[];
}

export function assembleExecutiveBlueprint(input: BlueprintInputs): ExecutiveBlueprint {
  const { scores, growth, recommendations, roiMetrics } = input;

  const scoredDomains = (Object.keys(scores.domainScores) as DomainKey[]).map((d) => ({
    domain: d,
    label: DOMAIN_LABEL[d],
    score: scores.domainScores[d] as number,
  }));
  const strengths = scoredDomains.filter((d) => d.score >= 70);
  const weaknesses = scoredDomains.filter((d) => d.score < 55);

  const section = (
    key: BlueprintSectionKey,
    hasData: boolean,
    content: Record<string, unknown>,
    note?: string,
  ): BlueprintSection =>
    note === undefined
      ? { key, title: TITLES[key], hasData, content }
      : { key, title: TITLES[key], hasData, content, note };

  const empty = (key: BlueprintSectionKey, why: string) => section(key, false, {}, why);

  const sections: BlueprintSection[] = [
    scores.transformation === null
      ? empty("executive_summary", "No domains scored yet — assessment incomplete.")
      : section("executive_summary", true, {
          transformationScore: scores.transformation,
          domainsScored: scoredDomains.length,
        }),
    scoredDomains.length
      ? section("current_state", true, { domainScores: scoredDomains })
      : empty("current_state", "No domain scores available."),
    strengths.length
      ? section("strengths", true, { strengths })
      : empty("strengths", "No domain scored at or above 70."),
    weaknesses.length
      ? section("weaknesses", true, { weaknesses })
      : empty("weaknesses", "No domain scored below 55."),
    growth.recommendations.length
      ? section("quick_wins", true, {
          items: growth.recommendations.filter(
            (r) => r.priority === "critical" || r.priority === "high",
          ),
        })
      : empty("quick_wins", "No growth weaknesses identified."),
    recommendations.length
      ? section("transformation_opportunities", true, { items: recommendations })
      : empty("transformation_opportunities", "No recommendations recorded."),
    scores.operations !== null
      ? section("operational_improvements", true, {
          operationsScore: scores.operations,
        })
      : empty("operational_improvements", "Operations domain not scored."),
    scores.growth !== null
      ? section("growth_strategy", true, {
          growthScore: scores.growth,
          recommendations: growth.recommendations,
        })
      : empty("growth_strategy", "Growth domain not scored."),
    growth.recommendations.length
      ? section("marketing_strategy", true, {
          items: growth.recommendations.filter((r) =>
            ["content", "social_media", "brand_authority", "reviews"].includes(
              r.dimension,
            ),
          ),
        })
      : empty("marketing_strategy", "No growth ratings for marketing dimensions."),
    growth.recommendations.some(
      (r) => r.dimension === "seo" || r.dimension === "ai_search_optimization",
    )
      ? section("seo_strategy", true, {
          items: growth.recommendations.filter(
            (r) => r.dimension === "seo" || r.dimension === "ai_search_optimization",
          ),
        })
      : empty("seo_strategy", "SEO / AI-search dimensions not rated as weaknesses."),
    scores.aiReadiness !== null
      ? section("ai_strategy", true, { aiReadinessScore: scores.aiReadiness })
      : empty("ai_strategy", "AI Readiness domain not scored."),
    recommendations.length
      ? section("roadmap_90_day", true, {
          items: recommendations.filter(
            (r) => r.priority === "critical" || r.priority === "high",
          ),
        })
      : empty("roadmap_90_day", "No recommendations to sequence."),
    recommendations.length
      ? section("roadmap_6_month", true, {
          items: recommendations.filter((r) => r.priority === "medium"),
        })
      : empty("roadmap_6_month", "No recommendations to sequence."),
    recommendations.length
      ? section("vision_12_month", true, {
          items: recommendations.filter((r) => r.priority === "low"),
        })
      : empty("vision_12_month", "No long-horizon recommendations."),
    roiMetrics && roiMetrics.length
      ? section("estimated_roi", true, { metrics: roiMetrics })
      : empty(
          "estimated_roi",
          "No ROI metrics captured — illustrative ROI requires inputs.",
        ),
    recommendations.some((r) => r.recommendedService)
      ? section("recommended_services", true, {
          services: [
            ...new Set(
              recommendations.map((r) => r.recommendedService).filter(Boolean),
            ),
          ],
        })
      : empty("recommended_services", "No services recommended yet."),
    recommendations.length
      ? section("implementation_plan", true, {
          phased: true,
          count: recommendations.length,
        })
      : empty("implementation_plan", "No recommendations to implement."),
  ];

  return { scores, sections, complete: sections.every((s) => s.hasData) };
}
