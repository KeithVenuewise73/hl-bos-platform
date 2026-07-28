// Industry consulting templates — reusable CONFIGURATION, not hardcoded logic.
// A template names the domains a given industry should emphasize (in order) and
// a short consulting lens. The framework runs the same deterministic engine for
// every industry; the template only re-weights emphasis and framing. Adding an
// industry is a row.

import type { DomainKey } from "../types.ts";

export interface IndustryTemplate {
  key: string;
  name: string;
  emphasis: DomainKey[]; // domains to foreground, in priority order
  lens: string; // consulting framing for the executive narrative
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    key: "transportation",
    name: "Transportation & Logistics",
    emphasis: [
      "operations",
      "financial",
      "technology",
      "business",
      "growth",
      "ai_readiness",
    ],
    lens: "Cost per mile, on-time delivery, fleet utilization, and dispatch/routing efficiency.",
  },
  {
    key: "sports",
    name: "Sports Organizations",
    emphasis: [
      "growth",
      "business",
      "ai_readiness",
      "operations",
      "technology",
      "financial",
    ],
    lens: "Audience growth, community engagement, and content/media operations.",
  },
  {
    key: "salon",
    name: "Salons",
    emphasis: [
      "growth",
      "operations",
      "business",
      "financial",
      "ai_readiness",
      "technology",
    ],
    lens: "Local visibility, booking/retention, and reviews-driven acquisition.",
  },
  {
    key: "barbershop",
    name: "Barbershops",
    emphasis: [
      "growth",
      "operations",
      "business",
      "financial",
      "ai_readiness",
      "technology",
    ],
    lens: "Local search, walk-in vs. booked utilization, and repeat visits.",
  },
  {
    key: "landscaping",
    name: "Landscaping",
    emphasis: [
      "operations",
      "growth",
      "financial",
      "business",
      "ai_readiness",
      "technology",
    ],
    lens: "Crew scheduling/routing, seasonal demand, and local lead generation.",
  },
  {
    key: "mechanics",
    name: "Mechanics / Auto Repair",
    emphasis: [
      "operations",
      "growth",
      "business",
      "technology",
      "financial",
      "ai_readiness",
    ],
    lens: "Bay utilization, service reviews, and estimate-to-close conversion.",
  },
  {
    key: "collision_repair",
    name: "Collision Repair",
    emphasis: [
      "operations",
      "business",
      "technology",
      "financial",
      "growth",
      "ai_readiness",
    ],
    lens: "Cycle time, insurance/DRP workflows, and throughput.",
  },
  {
    key: "restaurant",
    name: "Restaurants",
    emphasis: [
      "operations",
      "growth",
      "business",
      "financial",
      "ai_readiness",
      "technology",
    ],
    lens: "Local presence, reviews, ordering flow, and labor efficiency.",
  },
  {
    key: "professional_services",
    name: "Professional Services",
    emphasis: [
      "business",
      "growth",
      "financial",
      "technology",
      "ai_readiness",
      "operations",
    ],
    lens: "Authority, pipeline, delivery consistency, and utilization.",
  },
  {
    key: "manufacturing",
    name: "Manufacturing",
    emphasis: [
      "operations",
      "technology",
      "financial",
      "business",
      "ai_readiness",
      "growth",
    ],
    lens: "Throughput, quality, supply chain, and automation.",
  },
  {
    key: "healthcare",
    name: "Healthcare",
    emphasis: [
      "technology",
      "operations",
      "business",
      "financial",
      "ai_readiness",
      "growth",
    ],
    lens: "Security/compliance, scheduling, and patient experience.",
  },
  {
    key: "general",
    name: "General Business",
    emphasis: [
      "business",
      "operations",
      "growth",
      "technology",
      "ai_readiness",
      "financial",
    ],
    lens: "Balanced transformation across all six domains.",
  },
];

export function templateFor(industryPack: string): IndustryTemplate {
  return (
    INDUSTRY_TEMPLATES.find((t) => t.key === industryPack) ??
    INDUSTRY_TEMPLATES[INDUSTRY_TEMPLATES.length - 1]!
  );
}
