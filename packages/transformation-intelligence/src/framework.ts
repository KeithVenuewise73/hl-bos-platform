/**
 * The modular Assessment Framework — 15 executive assessment areas.
 *
 * This is a data-driven VIEW over the canonical bti-engine dimensions, not a new
 * scoring system. Each assessment area references existing (domain, dimension)
 * pairs that are already defined, weighted and scored by @hl-bos/bti-engine. We
 * do not re-weight or re-score here; we only group the canonical dimensions into
 * the 15 areas the executive brief asks for. Adding an area, or pointing one at
 * different dimensions, is a row change — never new logic.
 *
 * `validateFramework()` proves every reference resolves against the canonical
 * DOMAINS, so the framework cannot silently drift from the engine.
 */

import { DOMAINS, type DomainKey } from "@hl-bos/bti-engine";

export interface DimensionRef {
  domain: DomainKey;
  dimension: string;
}

export interface AssessmentArea {
  key: string;
  name: string;
  description: string;
  /** Canonical (domain, dimension) pairs this area rolls up. */
  refs: DimensionRef[];
}

/** The 15 assessment areas, each mapped to canonical engine dimensions. */
export const ASSESSMENT_AREAS: AssessmentArea[] = [
  {
    key: "website",
    name: "Website",
    description: "The primary web property — presence, quality, technical health.",
    refs: [{ domain: "growth", dimension: "website" }],
  },
  {
    key: "seo",
    name: "SEO",
    description: "Search and AI-search discoverability.",
    refs: [
      { domain: "growth", dimension: "seo" },
      { domain: "growth", dimension: "ai_search_optimization" },
    ],
  },
  {
    key: "google_business_profile",
    name: "Google Business Profile",
    description: "Local presence and map/listing visibility.",
    refs: [{ domain: "growth", dimension: "google_business_profile" }],
  },
  {
    key: "reputation",
    name: "Reputation",
    description: "Public reputation and brand authority.",
    refs: [
      { domain: "growth", dimension: "reviews" },
      { domain: "growth", dimension: "brand_authority" },
    ],
  },
  {
    key: "reviews",
    name: "Reviews",
    description: "Review volume, recency and response.",
    refs: [{ domain: "growth", dimension: "reviews" }],
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Content, social and demand generation.",
    refs: [
      { domain: "growth", dimension: "content" },
      { domain: "growth", dimension: "social_media" },
    ],
  },
  {
    key: "sales_funnel",
    name: "Sales Funnel",
    description: "Lead capture through conversion.",
    refs: [
      { domain: "growth", dimension: "lead_generation" },
      { domain: "growth", dimension: "conversion" },
    ],
  },
  {
    key: "crm",
    name: "CRM",
    description: "Customer relationship management and reporting.",
    refs: [
      { domain: "business", dimension: "customer_experience" },
      { domain: "operations", dimension: "reporting" },
    ],
  },
  {
    key: "operations",
    name: "Operations",
    description: "Core operating processes, scheduling and automation.",
    refs: [
      { domain: "operations", dimension: "operations" },
      { domain: "operations", dimension: "scheduling" },
      { domain: "operations", dimension: "automation" },
    ],
  },
  {
    key: "customer_experience",
    name: "Customer Experience",
    description: "The end-to-end customer experience.",
    refs: [{ domain: "business", dimension: "customer_experience" }],
  },
  {
    key: "ai_readiness",
    name: "AI Readiness",
    description: "Readiness to adopt automation and AI assistants.",
    refs: [
      { domain: "ai_readiness", dimension: "automation_opportunities" },
      { domain: "ai_readiness", dimension: "ai_assistants" },
      { domain: "ai_readiness", dimension: "customer_support" },
    ],
  },
  {
    key: "financial_opportunities",
    name: "Financial Opportunities",
    description: "Cost reduction and revenue growth levers.",
    refs: [
      { domain: "financial", dimension: "cost_reduction" },
      { domain: "financial", dimension: "revenue_growth" },
      { domain: "financial", dimension: "automation_roi" },
    ],
  },
  {
    key: "digital_presence",
    name: "Digital Presence",
    description: "The combined digital footprint across web, social and software.",
    refs: [
      { domain: "growth", dimension: "website" },
      { domain: "growth", dimension: "social_media" },
      { domain: "technology", dimension: "software" },
    ],
  },
  {
    key: "competitive_position",
    name: "Competitive Position",
    description: "Standing versus competitors and readiness to grow.",
    refs: [
      { domain: "growth", dimension: "competitors" },
      { domain: "business", dimension: "growth_readiness" },
    ],
  },
  {
    key: "internal_process_efficiency",
    name: "Internal Process Efficiency",
    description: "Process maturity, automation and technical drag.",
    refs: [
      { domain: "operations", dimension: "automation" },
      { domain: "business", dimension: "processes" },
      { domain: "technology", dimension: "technical_debt" },
    ],
  },
];

export interface FrameworkValidation {
  ok: boolean;
  areaCount: number;
  referencedDimensions: number;
  /** References that do not resolve to a canonical (domain, dimension). */
  unresolved: DimensionRef[];
}

/** Prove every area reference resolves against the canonical engine dimensions. */
export function validateFramework(): FrameworkValidation {
  const canonical = new Set<string>();
  for (const d of DOMAINS) {
    for (const dim of d.dimensions) canonical.add(`${d.key}.${dim.key}`);
  }
  const unresolved: DimensionRef[] = [];
  let referenced = 0;
  for (const area of ASSESSMENT_AREAS) {
    for (const ref of area.refs) {
      referenced += 1;
      if (!canonical.has(`${ref.domain}.${ref.dimension}`)) unresolved.push(ref);
    }
  }
  return {
    ok: unresolved.length === 0,
    areaCount: ASSESSMENT_AREAS.length,
    referencedDimensions: referenced,
    unresolved,
  };
}

/** The distinct canonical dimensions an assessment must rate to cover all 15 areas. */
export function requiredDimensions(): DimensionRef[] {
  const seen = new Set<string>();
  const out: DimensionRef[] = [];
  for (const area of ASSESSMENT_AREAS) {
    for (const ref of area.refs) {
      const id = `${ref.domain}.${ref.dimension}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(ref);
      }
    }
  }
  return out;
}
