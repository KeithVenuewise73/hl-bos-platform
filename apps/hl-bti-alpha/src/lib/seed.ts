// The initial Alpha workspace.
//
// Businesses are real configuration (the PCO's portfolio: HSCS, Venuewise,
// HomeHuddle, 5-Star). HSCS is a full-transformation pilot that starts EMPTY —
// ready for Keith to run a real engagement, with no invented scores. Venuewise
// is a clearly-labelled DEMONSTRATION (analysis-only), so the screens have
// something to show without pretending it is a live client. HomeHuddle and
// 5-Star are registered but carry no assessment — the CEO command center shows
// them honestly as "not started".

import {
  type Workspace,
  type Business,
  type Engagement,
  newId,
  completeAssessment,
} from "./store.ts";
import type { DomainKey } from "@hl-bos/bti-engine";

function business(
  key: string,
  name: string,
  industry: string,
  pack: string,
  analysisOnly: boolean,
  demo: boolean,
): Business {
  return {
    id: newId("biz"),
    key,
    name,
    industry,
    pack,
    analysisOnly,
    dashboardVisible: true,
    demo,
  };
}

function rate(
  e: Engagement,
  ratings: Partial<Record<DomainKey, Record<string, number>>>,
): void {
  for (const [domain, dims] of Object.entries(ratings) as [
    DomainKey,
    Record<string, number>,
  ][]) {
    e.assessment.ratings[domain] = { ...dims };
  }
}

export function buildSeed(): Workspace {
  const hscs = business(
    "hscs",
    "Herman Supply Chain Solutions",
    "Logistics",
    "transportation",
    false,
    false,
  );
  const venuewise = business(
    "venuewise",
    "Venuewise",
    "Sports & Media",
    "sports",
    true,
    true,
  );
  const homehuddle = business(
    "homehuddle",
    "HomeHuddle",
    "Sports & Media",
    "sports",
    true,
    false,
  );
  const fivestar = business(
    "5star",
    "5-Star Sports Media",
    "Sports & Media",
    "sports",
    true,
    false,
  );

  const ws: Workspace = {
    version: 3,
    businesses: [hscs, venuewise, homehuddle, fivestar],
    engagements: [],
  };

  // Venuewise — the internal pilot DEMONSTRATION (analysis-only, capped at blueprint).
  const demo: Engagement = {
    id: newId("eng"),
    businessId: venuewise.id,
    mode: "analysis_only",
    stage: "blueprint",
    assessment: { ratings: {}, notes: {}, evidence: [], completed: false },
    projects: [],
    roi: [],
    proposal: null,
    notes:
      "Internal pilot — analysis only. Recommendations for discussion; no proposal, implementation, or billing.",
    demo: true,
    timeline: [
      { at: "", label: "Internal pilot opened (analysis only)" },
      { at: "", label: "Assessment completed" },
      { at: "", label: "Transformation blueprint generated" },
    ],
  };
  rate(demo, {
    business: {
      business_maturity: 4,
      leadership: 4,
      processes: 3,
      customer_experience: 4,
      growth_readiness: 3,
    },
    operations: {
      operations: 3,
      supply_chain: 3,
      scheduling: 3,
      reporting: 2,
      automation: 2,
      fleet: 3,
      resource_utilization: 3,
      warehouse_operations: 3,
      transportation: 3,
    },
    growth: {
      website: 3,
      seo: 2,
      ai_search_optimization: 1,
      google_business_profile: 3,
      reviews: 3,
      content: 3,
      social_media: 4,
      competitors: 3,
      lead_generation: 2,
      conversion: 2,
      brand_authority: 4,
      technology_stack: 3,
    },
    technology: {
      software: 3,
      security: 2,
      cloud_readiness: 3,
      architecture: 2,
      technical_debt: 2,
      scalability: 2,
      hlbos_compatibility: 2,
    },
    ai_readiness: {
      automation_opportunities: 2,
      ai_assistants: 1,
      customer_support: 2,
      marketing_automation: 2,
      internal_ai_workflows: 1,
      future_ai_products: 2,
    },
    financial: {
      cost_reduction: 3,
      revenue_growth: 3,
      automation_roi: 2,
      transformation_roi: 3,
    },
  });
  demo.assessment.evidence.push({
    domain: "growth",
    dimension: "seo",
    label: "Site audit — thin metadata, no schema",
  });
  demo.assessment.notes.growth =
    "Strong social + brand; weak on SEO/AEO and conversion — highest-leverage growth gaps.";
  completeAssessment(demo);
  ws.engagements.push(demo);

  return ws;
}
