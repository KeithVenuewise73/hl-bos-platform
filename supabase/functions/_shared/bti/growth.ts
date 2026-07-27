// Deterministic HL-BTI Growth Intelligence engine (Deliverable 5).
//
// Given the ratings of the Growth Intelligence domain dimensions (0-5), it
// produces prioritized recommendations. Per the PCO, EVERY recommendation
// carries: Priority, an Estimated ROI band, and a Recommended Herman Legacy
// service. Mapping is DATA (below), so it is transparent and testable — no AI,
// no opaque list, no false precision.
//
// ROI bands are ILLUSTRATIVE and assumption-based (like the blueprint impact
// engine), never a guaranteed outcome. A dimension that scores well is reported
// as a STRENGTH, not padded into a fake recommendation.

export const BTI_GROWTH_VERSION = "bti-growth-0.1.0";

export type Priority = "critical" | "high" | "medium" | "low";
export type RoiBand = "high" | "medium" | "low";

interface DimensionSpec {
  dimension: string;
  label: string;
  service: string; // Recommended Herman Legacy service
  roi: RoiBand; // opportunity size when the dimension is weak
}

// The Growth domain's dimensions → recommended Herman Legacy service + ROI band.
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
  rating: number; // 0-5
}

export interface GrowthRecommendation {
  dimension: string;
  label: string;
  priority: Priority;
  estimatedRoi: RoiBand;
  recommendedService: string;
  rationale: string;
}

export interface GrowthStrength {
  dimension: string;
  label: string;
  rating: number;
}

export interface GrowthIntelligenceResult {
  recommendations: GrowthRecommendation[]; // sorted: critical → low
  strengths: GrowthStrength[];
  unrated: string[]; // dimensions with no rating — reported honestly, not scored
}

// Weakness → priority. Strong dimensions (>= 4) are not recommendations.
function priorityFor(rating: number): Priority | null {
  if (rating <= 1) return "critical";
  if (rating === 2) return "high";
  if (rating === 3) return "medium";
  if (rating === 4) return "low";
  return null; // 5 = strength
}

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function analyzeGrowth(ratings: GrowthRating[]): GrowthIntelligenceResult {
  const rated = new Map<string, number>();
  for (const r of ratings) rated.set(r.dimension, r.rating);

  const recommendations: GrowthRecommendation[] = [];
  const strengths: GrowthStrength[] = [];
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
    // tie-break by ROI band then label for stable, deterministic ordering
    const roiRank: Record<RoiBand, number> = { high: 0, medium: 1, low: 2 };
    const r = roiRank[a.estimatedRoi] - roiRank[b.estimatedRoi];
    return r !== 0 ? r : a.label.localeCompare(b.label);
  });

  return { recommendations, strengths, unrated };
}
