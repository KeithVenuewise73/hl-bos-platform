// Deterministic HL-BTI Growth Intelligence — canonical mirror of the edge
// `_shared/bti/growth.ts`. Every recommendation carries Priority + Estimated ROI
// + a Recommended Herman Legacy service. Data-mapped, no AI, no false precision.

import type { Priority, RoiBand } from "./types.ts";

interface DimensionSpec {
  dimension: string;
  label: string;
  service: string;
  roi: RoiBand;
}

export const GROWTH_MAP: DimensionSpec[] = [
  {
    dimension: "website",
    label: "Website",
    service: "Website Modernization",
    roi: "high",
  },
  { dimension: "seo", label: "SEO", service: "SEO Optimization", roi: "high" },
  {
    dimension: "ai_search_optimization",
    label: "AI Search Optimization",
    service: "AI Search Optimization (AEO)",
    roi: "high",
  },
  {
    dimension: "google_business_profile",
    label: "Google Business Profile",
    service: "Local Presence Management",
    roi: "medium",
  },
  {
    dimension: "reviews",
    label: "Reviews",
    service: "Reputation Management",
    roi: "medium",
  },
  { dimension: "content", label: "Content", service: "Content Engine", roi: "medium" },
  {
    dimension: "social_media",
    label: "Social Media",
    service: "Social Media Management",
    roi: "low",
  },
  {
    dimension: "competitors",
    label: "Competitors",
    service: "Competitive Intelligence",
    roi: "medium",
  },
  {
    dimension: "lead_generation",
    label: "Lead Generation",
    service: "Lead Generation System",
    roi: "high",
  },
  {
    dimension: "conversion",
    label: "Conversion",
    service: "Conversion Optimization",
    roi: "high",
  },
  {
    dimension: "brand_authority",
    label: "Brand Authority",
    service: "Brand Authority Program",
    roi: "medium",
  },
  {
    dimension: "technology_stack",
    label: "Technology Stack",
    service: "Growth Tech Stack Advisory",
    roi: "low",
  },
];

export interface GrowthRating {
  dimension: string;
  rating: number;
}

export interface GrowthRecommendation {
  dimension: string;
  label: string;
  priority: Priority;
  estimatedRoi: RoiBand;
  recommendedService: string;
  rationale: string;
}

export interface GrowthIntelligenceResult {
  recommendations: GrowthRecommendation[];
  strengths: { dimension: string; label: string; rating: number }[];
  unrated: string[];
}

function priorityFor(rating: number): Priority | null {
  if (rating <= 1) return "critical";
  if (rating === 2) return "high";
  if (rating === 3) return "medium";
  if (rating === 4) return "low";
  return null;
}

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const ROI_RANK: Record<RoiBand, number> = { high: 0, medium: 1, low: 2 };

export function analyzeGrowth(ratings: GrowthRating[]): GrowthIntelligenceResult {
  const rated = new Map<string, number>();
  for (const r of ratings) rated.set(r.dimension, r.rating);

  const recommendations: GrowthRecommendation[] = [];
  const strengths: { dimension: string; label: string; rating: number }[] = [];
  const unrated: string[] = [];

  for (const spec of GROWTH_MAP) {
    if (!rated.has(spec.dimension)) {
      unrated.push(spec.dimension);
      continue;
    }
    const rating = rated.get(spec.dimension)!;
    const priority = priorityFor(rating);
    if (priority === null) {
      strengths.push({ dimension: spec.dimension, label: spec.label, rating });
      continue;
    }
    recommendations.push({
      dimension: spec.dimension,
      label: spec.label,
      priority,
      estimatedRoi: spec.roi,
      recommendedService: spec.service,
      rationale: `${spec.label} scored ${rating}/5 — ${spec.service} addresses the gap.`,
    });
  }

  recommendations.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const r = ROI_RANK[a.estimatedRoi] - ROI_RANK[b.estimatedRoi];
    return r !== 0 ? r : a.label.localeCompare(b.label);
  });

  return { recommendations, strengths, unrated };
}
