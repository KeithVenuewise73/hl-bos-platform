// The HL-BTI framework catalog — the 6 intelligence domains, their dimensions,
// and the industry packs. This is CONFIG that mirrors the seeds in migration
// 0026 (bti.intelligence_domains / domain_dimensions / industry_packs). It is
// not customer data; it is the assessment framework itself.

import type { IntelligenceDomain, IndustryPack, DomainKey } from "./types.ts";

export const DOMAINS: IntelligenceDomain[] = [
  {
    key: "business",
    name: "Business Intelligence",
    description:
      "Maturity, leadership, processes, customer experience, growth readiness.",
    transformationWeight: 9,
    dimensions: [
      { key: "business_maturity", name: "Business Maturity", weight: 7 },
      { key: "leadership", name: "Leadership", weight: 6 },
      { key: "processes", name: "Processes", weight: 6 },
      { key: "customer_experience", name: "Customer Experience", weight: 7 },
      { key: "growth_readiness", name: "Growth Readiness", weight: 7 },
    ],
  },
  {
    key: "operations",
    name: "Operations Intelligence",
    description:
      "Operations, supply chain, scheduling, reporting, automation, fleet, utilization, warehouse, transportation.",
    transformationWeight: 8,
    dimensions: [
      { key: "operations", name: "Operations", weight: 7 },
      { key: "supply_chain", name: "Supply Chain", weight: 7 },
      { key: "scheduling", name: "Scheduling", weight: 5 },
      { key: "reporting", name: "Reporting", weight: 5 },
      { key: "automation", name: "Automation", weight: 6 },
      { key: "fleet", name: "Fleet", weight: 5 },
      { key: "resource_utilization", name: "Resource Utilization", weight: 6 },
      { key: "warehouse_operations", name: "Warehouse Operations", weight: 6 },
      { key: "transportation", name: "Transportation", weight: 6 },
    ],
  },
  {
    key: "growth",
    name: "Growth Intelligence",
    description:
      "Website, SEO, AI search, GBP, reviews, content, social, competitors, lead gen, conversion, brand, tech stack.",
    transformationWeight: 8,
    dimensions: [
      { key: "website", name: "Website", weight: 7 },
      { key: "seo", name: "SEO", weight: 7 },
      { key: "ai_search_optimization", name: "AI Search Optimization", weight: 6 },
      { key: "google_business_profile", name: "Google Business Profile", weight: 5 },
      { key: "reviews", name: "Reviews", weight: 5 },
      { key: "content", name: "Content", weight: 5 },
      { key: "social_media", name: "Social Media", weight: 5 },
      { key: "competitors", name: "Competitors", weight: 5 },
      { key: "lead_generation", name: "Lead Generation", weight: 7 },
      { key: "conversion", name: "Conversion", weight: 7 },
      { key: "brand_authority", name: "Brand Authority", weight: 5 },
      { key: "technology_stack", name: "Technology Stack", weight: 5 },
    ],
  },
  {
    key: "technology",
    name: "Technology Intelligence",
    description:
      "Software, security, cloud readiness, architecture, technical debt, scalability, HL-BOS compatibility.",
    transformationWeight: 7,
    dimensions: [
      { key: "software", name: "Software", weight: 6 },
      { key: "security", name: "Security", weight: 7 },
      { key: "cloud_readiness", name: "Cloud Readiness", weight: 6 },
      { key: "architecture", name: "Architecture", weight: 6 },
      { key: "technical_debt", name: "Technical Debt", weight: 6 },
      { key: "scalability", name: "Scalability", weight: 6 },
      { key: "hlbos_compatibility", name: "HL-BOS Compatibility", weight: 6 },
    ],
  },
  {
    key: "ai_readiness",
    name: "AI Readiness",
    description:
      "Automation opportunities, AI assistants, support, marketing automation, internal AI, future AI products.",
    transformationWeight: 7,
    dimensions: [
      { key: "automation_opportunities", name: "Automation Opportunities", weight: 7 },
      { key: "ai_assistants", name: "AI Assistants", weight: 6 },
      { key: "customer_support", name: "Customer Support", weight: 6 },
      { key: "marketing_automation", name: "Marketing Automation", weight: 6 },
      { key: "internal_ai_workflows", name: "Internal AI Workflows", weight: 6 },
      { key: "future_ai_products", name: "Future AI Products", weight: 5 },
    ],
  },
  {
    key: "financial",
    name: "Financial Intelligence",
    description: "Cost reduction, revenue growth, automation ROI, transformation ROI.",
    transformationWeight: 8,
    dimensions: [
      { key: "cost_reduction", name: "Cost Reduction", weight: 7 },
      { key: "revenue_growth", name: "Revenue Growth", weight: 8 },
      { key: "automation_roi", name: "Automation ROI", weight: 7 },
      { key: "transformation_roi", name: "Transformation ROI", weight: 7 },
    ],
  },
];

export const INDUSTRY_PACKS: IndustryPack[] = [
  {
    key: "general",
    name: "General Business",
    description: "Baseline pack — all six domains.",
    applicableDomains: [
      "business",
      "operations",
      "growth",
      "technology",
      "ai_readiness",
      "financial",
    ],
  },
  {
    key: "transportation",
    name: "Transportation & Logistics",
    description: "Warehouses, transportation, distribution, fleet, logistics.",
    applicableDomains: [
      "operations",
      "business",
      "financial",
      "technology",
      "growth",
      "ai_readiness",
    ],
  },
  {
    key: "sports",
    name: "Sports & Media",
    description: "Sports organizations, media, community platforms.",
    applicableDomains: [
      "growth",
      "business",
      "ai_readiness",
      "technology",
      "operations",
      "financial",
    ],
  },
  {
    key: "salon",
    name: "Salon",
    description: "Salons and personal-care services.",
    applicableDomains: [
      "growth",
      "business",
      "operations",
      "financial",
      "ai_readiness",
      "technology",
    ],
  },
  {
    key: "barbershop",
    name: "Barbershop",
    description: "Barbershops and grooming services.",
    applicableDomains: [
      "growth",
      "business",
      "operations",
      "financial",
      "ai_readiness",
      "technology",
    ],
  },
  {
    key: "restaurant",
    name: "Restaurant",
    description: "Restaurants and food service.",
    applicableDomains: [
      "operations",
      "growth",
      "business",
      "financial",
      "ai_readiness",
      "technology",
    ],
  },
  {
    key: "healthcare",
    name: "Healthcare",
    description: "Healthcare and clinical services.",
    applicableDomains: [
      "technology",
      "operations",
      "business",
      "financial",
      "ai_readiness",
      "growth",
    ],
  },
  {
    key: "professional_services",
    name: "Professional Services",
    description: "Consulting, legal, accounting and similar.",
    applicableDomains: [
      "business",
      "growth",
      "financial",
      "technology",
      "ai_readiness",
      "operations",
    ],
  },
  {
    key: "construction",
    name: "Construction",
    description: "Construction and trades.",
    applicableDomains: [
      "operations",
      "business",
      "financial",
      "growth",
      "technology",
      "ai_readiness",
    ],
  },
  {
    key: "manufacturing",
    name: "Manufacturing",
    description: "Manufacturers and producers.",
    applicableDomains: [
      "operations",
      "technology",
      "financial",
      "business",
      "ai_readiness",
      "growth",
    ],
  },
];

export function domainByKey(key: DomainKey): IntelligenceDomain {
  const d = DOMAINS.find((x) => x.key === key);
  if (!d) throw new Error(`unknown domain ${key}`);
  return d;
}

export function totalDimensionCount(): number {
  return DOMAINS.reduce((n, d) => n + d.dimensions.length, 0);
}
