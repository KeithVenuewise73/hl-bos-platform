import { productCatalog } from "@hl-bos/catalog";
import { referenceLibrary } from "@hl-bos/transformation-intelligence";

/**
 * Public data — the PUBLIC PROJECTION of the existing portfolio. Internal metrics
 * (assembly %, maturity, net-new, priority, ROI) NEVER cross this boundary; the
 * public sees only name, description, target market and category. Source of truth
 * is the existing product catalog + capability registry (no new store).
 */

export interface PublicSolution {
  key: string;
  name: string;
  description: string;
  targetMarket: string;
  category: string;
}

export const MARKETPLACE_CATEGORIES = [
  "Business Transformation",
  "Marketing and Visibility",
  "CRM and Customer Experience",
  "Automation and Workflow",
  "Analytics and Executive Intelligence",
  "Logistics",
  "Service Industries",
  "Sports and Family Technology",
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

// Deterministic product → category map (public taxonomy). Data, not branching.
const CATEGORY_OF: Record<string, MarketplaceCategory> = {
  hl_bti: "Business Transformation",
  government_intelligence: "Business Transformation",
  visibility_ai: "Marketing and Visibility",
  review_management: "Marketing and Visibility",
  reputation_recovery: "Marketing and Visibility",
  ai_persona: "CRM and Customer Experience",
  reception_ai: "CRM and Customer Experience",
  asset_recovery: "Automation and Workflow",
  transportation_ai: "Logistics",
  fleet_huddle: "Logistics",
  freight_intelligence: "Logistics",
  salon_ai: "Service Industries",
  contractor_ai: "Service Industries",
  education: "Service Industries",
  healthcare: "Service Industries",
  mental_wellness: "Service Industries",
  hockey_iq: "Sports and Family Technology",
  football_iq: "Sports and Family Technology",
  sports_intelligence: "Sports and Family Technology",
  broadcast_ai: "Sports and Family Technology",
};

/** All solutions, public projection only. */
export function publicSolutions(): PublicSolution[] {
  return productCatalog()
    .filter((p) => p.maturity !== "legacy")
    .map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      targetMarket: p.targetMarket,
      category: CATEGORY_OF[p.key] ?? "Business Transformation",
    }));
}

export function solutionsByCategory(): Array<{
  category: MarketplaceCategory;
  solutions: PublicSolution[];
}> {
  const all = publicSolutions();
  return MARKETPLACE_CATEGORIES.map((category) => ({
    category,
    solutions: all.filter((s) => s.category === category),
  }));
}

/** Focus-market → solutions, for the Industries page. */
export function industrySolutions(): Array<{
  market: string;
  solutions: PublicSolution[];
}> {
  const all = publicSolutions();
  return [
    { market: "Logistics", solutions: all.filter((s) => s.category === "Logistics") },
    {
      market: "Service Industries",
      solutions: all.filter((s) => s.category === "Service Industries"),
    },
    {
      market: "Sports",
      solutions: all.filter((s) => s.category === "Sports and Family Technology"),
    },
  ];
}

/**
 * Reference businesses — labeled HONESTLY. No unverified case-study claims: until
 * real execution data exists these are internal reference implementations /
 * transformation blueprints, in progress, baseline pending. Public projection
 * carries NO internal metrics.
 */
export interface ReferenceBusiness {
  org: string;
  label: string;
  status: string;
  solutions: string[];
}

export function referenceBusinesses(): ReferenceBusiness[] {
  return referenceLibrary().implementations.map((r) => ({
    org: r.org,
    label: "Internal reference implementation",
    status: "Transformation blueprint · in progress · baseline pending",
    solutions: r.products.map((p) => p.name),
  }));
}
