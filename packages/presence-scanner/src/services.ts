// Suggested HLG services, from the EXISTING BTI growth map
// (@hl-bos/bti-engine analyzeGrowth / GROWTH_MAP). Each score component is
// expressed as a 0-5 rating on the matching BTI dimension, and the BTI engine
// decides the service and priority -- the same mapping the BTI analyst uses.
// No prices: those are a CEO decision and are shown as "pending".

import { analyzeGrowth, type GrowthRating } from "@hl-bos/bti-engine";
import type { ComponentKey, OpportunityScore, SuggestedService } from "./types.ts";

/** Score component -> BTI growth dimension. */
export const COMPONENT_TO_BTI: Record<ComponentKey, string> = {
  website: "website",
  conversion: "conversion",
  reviews: "reviews",
  profile: "google_business_profile",
  search: "seo",
  social: "social_media",
};

export function suggestServices(score: OpportunityScore): SuggestedService[] {
  const ratings: GrowthRating[] = [];
  for (const c of score.components) {
    if (c.status === "not_checked" || c.max === 0) continue;
    // Full need -> 0/5, no need -> 5/5. Rounded, as BTI ratings are integers.
    ratings.push({
      dimension: COMPONENT_TO_BTI[c.component],
      rating: Math.round(5 * (1 - c.awarded / c.max)),
    });
  }
  return analyzeGrowth(ratings).recommendations.map((r) => ({
    service: r.recommendedService,
    dimension: r.dimension,
    priority: r.priority,
    rationale: r.rationale,
  }));
}
