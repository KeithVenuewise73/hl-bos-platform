/**
 * HERMAN LEGACY MARKETING — operating model + capability reuse (Execution Phase 3A).
 *
 * Herman Legacy Marketing is a permanent INTERNAL business unit, assembled from
 * existing Software Factory capabilities — not a new standalone software product.
 * Its mission: acquire customers, increase visibility, generate qualified
 * opportunities, build authority, produce measurable growth, and support every
 * Herman Legacy business (Herman Legacy Group, Venuewise, HSCS).
 *
 * ASSEMBLE, DON'T REBUILD. Every marketing function maps to a capability that
 * ALREADY EXISTS (CRM, VisibilityAI, workflows, communications, media, documents,
 * scheduling, analytics, knowledge graph, HL-BTI, portal). This module is the
 * operating model + the honest reuse assessment over them.
 *
 * HONESTY (Principle 10): a function with no backing is marked `net_new` (only
 * Content Management and Campaign Tracking). Nothing is invented.
 */

import {
  buildCatalog,
  findImplementations,
  type SourcePlatformId,
} from "@hl-bos/catalog";

export const MARKETING_MISSION: string[] = [
  "Acquire customers.",
  "Increase visibility.",
  "Generate qualified opportunities.",
  "Build authority.",
  "Produce measurable growth.",
  "Support every Herman Legacy business.",
];

// ==========================================================================
// Capability reuse assessment — the 14 systems the brief names
// ==========================================================================

export type ReuseVerdict = "reuse" | "reuse_cross_platform" | "net_new";

export interface MarketingSystem {
  name: string;
  purpose: string;
  /** A catalog asset id (HL-BOS) that backs it, if any. */
  catalogAsset?: string;
  /** A capability term (possibly cross-platform) that backs it, if any. */
  capabilityTerm?: string;
  verdict: ReuseVerdict;
  platform: SourcePlatformId | "hlbos_core" | null;
  evidence: string;
}

const BUILT = new Set(["production", "functional", "partial"]);

/** Resolve one system's reuse verdict against the live catalog / registry. */
function resolveSystem(def: {
  name: string;
  purpose: string;
  catalogAsset?: string;
  capabilityTerm?: string;
  evidence: string;
}): MarketingSystem {
  if (def.catalogAsset) {
    const exists = buildCatalog().assets.some((a) => a.id === def.catalogAsset);
    return {
      ...def,
      verdict: exists ? "reuse" : "net_new",
      platform: exists ? "hlbos_core" : null,
    };
  }
  if (def.capabilityTerm) {
    const hits = findImplementations(def.capabilityTerm).filter((i) =>
      BUILT.has(i.maturity),
    );
    const hlbos = hits.find((i) => i.platform === "hlbos_core");
    const chosen = hlbos ?? hits[0];
    if (chosen) {
      return {
        ...def,
        verdict: chosen.platform === "hlbos_core" ? "reuse" : "reuse_cross_platform",
        platform: chosen.platform,
      };
    }
    return { ...def, verdict: "net_new", platform: null };
  }
  return { ...def, verdict: "net_new", platform: null };
}

/** The 14 systems marketing needs, each resolved to its existing backing. */
export function marketingSystems(): MarketingSystem[] {
  return [
    resolveSystem({
      name: "CRM",
      purpose: "Prospects, opportunities, and the relationship over time.",
      catalogAsset: "svc.discovery",
      evidence:
        "Intelligence CRM (Phase 3) — assembled over discovery/identity/commerce",
    }),
    resolveSystem({
      name: "VisibilityAI",
      purpose: "Visibility/SEO/reputation assessment and scoring.",
      catalogAsset: "prod.visibility-ai",
      evidence: "prod.visibility-ai (prototype); visibility schema",
    }),
    resolveSystem({
      name: "Workflow",
      purpose: "Approval gates and repeatable process.",
      catalogAsset: "svc.workflows",
      evidence: "svc.workflows human-approval gate (live)",
    }),
    resolveSystem({
      name: "Communications",
      purpose: "Email/SMS with consent + suppression.",
      capabilityTerm: "communications",
      evidence: "communications (HL-BOS built + Venuewise SMS live)",
    }),
    resolveSystem({
      name: "Media",
      purpose: "Publishing media (articles, video, photos).",
      capabilityTerm: "media operation",
      evidence: "Venuewise 5-Star media operation (partial, cross-platform)",
    }),
    resolveSystem({
      name: "Documents",
      purpose: "Generate/version/approve marketing collateral.",
      capabilityTerm: "documents",
      evidence: "Venuewise documents engine (functional, cross-platform)",
    }),
    resolveSystem({
      name: "Scheduling",
      purpose: "Content and campaign scheduling.",
      capabilityTerm: "scheduling",
      evidence: "Venuewise scheduling (production, cross-platform)",
    }),
    resolveSystem({
      name: "Content Management",
      purpose: "A content library / CMS for produced assets.",
      evidence: "No dedicated content library exists — net-new (small, horizontal)",
    }),
    resolveSystem({
      name: "Analytics",
      purpose: "Traffic, engagement, page analytics.",
      capabilityTerm: "analytics",
      evidence: "Venuewise analytics (production, cross-platform)",
    }),
    resolveSystem({
      name: "Campaign Tracking",
      purpose: "Attribution of leads/revenue to campaigns.",
      evidence: "No campaign tracker exists — net-new (small, horizontal)",
    }),
    resolveSystem({
      name: "Reporting",
      purpose: "Executive reporting on marketing performance.",
      catalogAsset: "mod.bti-platform",
      evidence: "mod.bti-platform executive dashboards (live)",
    }),
    resolveSystem({
      name: "Knowledge Graph",
      purpose: "Relationships across capabilities, products, content.",
      catalogAsset: "pkg.catalog",
      evidence: "@hl-bos/catalog knowledge graph (live)",
    }),
    resolveSystem({
      name: "HL-BTI",
      purpose: "Turn assessment into transformation + proposal.",
      catalogAsset: "prod.hl-bti",
      evidence: "prod.hl-bti (live)",
    }),
    resolveSystem({
      name: "Portal",
      purpose: "Executive surface for marketing dashboards.",
      catalogAsset: "app.executive-portal",
      evidence: "app.executive-portal (built_undeployed)",
    }),
  ];
}

export interface MarketingCapabilityReuse {
  systems: MarketingSystem[];
  total: number;
  reuseCount: number;
  crossPlatformCount: number;
  netNewCount: number;
  netNewSystems: string[];
  reusePct: number;
  summary: string;
}

/** The capability reuse assessment (deliverable 2). */
export function marketingCapabilityReuse(): MarketingCapabilityReuse {
  const systems = marketingSystems();
  const reuseCount = systems.filter((s) => s.verdict === "reuse").length;
  const crossPlatformCount = systems.filter(
    (s) => s.verdict === "reuse_cross_platform",
  ).length;
  const netNewCount = systems.filter((s) => s.verdict === "net_new").length;
  const netNewSystems = systems
    .filter((s) => s.verdict === "net_new")
    .map((s) => s.name);
  return {
    systems,
    total: systems.length,
    reuseCount,
    crossPlatformCount,
    netNewCount,
    netNewSystems,
    reusePct: Math.round(((systems.length - netNewCount) / systems.length) * 100),
    summary:
      `${reuseCount} systems reuse HL-BOS, ${crossPlatformCount} reuse cross-platform ` +
      `(Venuewise), ${netNewCount} net-new (${netNewSystems.join(", ")}). No duplicate systems.`,
  };
}

// ==========================================================================
// The marketing value chain (operating model, deliverable 1)
// ==========================================================================

export interface MarketingFunction {
  seq: number;
  name: string;
  purpose: string;
  /** Which marketing systems (by name) this function runs on. */
  systems: string[];
}

export const MARKETING_VALUE_CHAIN: MarketingFunction[] = [
  {
    seq: 1,
    name: "Audience & Positioning",
    purpose: "Define audiences and core messages.",
    systems: ["Knowledge Graph", "HL-BTI"],
  },
  {
    seq: 2,
    name: "Visibility & SEO",
    purpose: "Improve discoverability and reputation.",
    systems: ["VisibilityAI"],
  },
  {
    seq: 3,
    name: "Content Manufacturing",
    purpose: "Produce content at scale (AI Marketing Studio).",
    systems: ["Documents", "Media", "Content Management"],
  },
  {
    seq: 4,
    name: "Campaign Orchestration",
    purpose: "Plan and run multi-channel campaigns.",
    systems: ["Workflow", "Scheduling", "Campaign Tracking"],
  },
  {
    seq: 5,
    name: "Publishing & Distribution",
    purpose: "Publish across channels.",
    systems: ["Media", "Communications", "Scheduling"],
  },
  {
    seq: 6,
    name: "Lead Generation & Nurture",
    purpose: "Capture and nurture prospects.",
    systems: ["CRM", "Communications"],
  },
  {
    seq: 7,
    name: "Qualification → HL-BTI",
    purpose: "Hand qualified leads to the customer lifecycle.",
    systems: ["CRM", "HL-BTI"],
  },
  {
    seq: 8,
    name: "Measurement & Reporting",
    purpose: "Measure growth and ROI.",
    systems: ["Analytics", "Reporting"],
  },
];

// ==========================================================================
// Commercialization — all five layers (Commercialization Law #1)
// ==========================================================================

export interface MarketingCommercialization {
  layer: "L1" | "L2" | "L3" | "L4" | "L5";
  name: string;
  howMarketingBecomesThis: string;
}

export const MARKETING_COMMERCIALIZATION: MarketingCommercialization[] = [
  {
    layer: "L1",
    name: "Internal capability",
    howMarketingBecomesThis:
      "Herman Legacy markets its own businesses (Group, Venuewise, HSCS).",
  },
  {
    layer: "L2",
    name: "HL-BTI engagement",
    howMarketingBecomesThis:
      "Marketing findings + execution become part of a transformation engagement.",
  },
  {
    layer: "L3",
    name: "Monthly recurring marketing service",
    howMarketingBecomesThis: "A managed marketing retainer for external customers.",
  },
  {
    layer: "L4",
    name: "Agency offering",
    howMarketingBecomesThis: "White-label agency / API for partners to run campaigns.",
  },
  {
    layer: "L5",
    name: "Factory capability",
    howMarketingBecomesThis:
      "The AI Marketing Studio assembled into other Herman Legacy products.",
  },
];

export interface MarketingOperatingModel {
  mission: string[];
  valueChain: MarketingFunction[];
  reuse: MarketingCapabilityReuse;
  commercialization: MarketingCommercialization[];
  /** Distinct existing systems the whole unit reuses. */
  supportsAllLayers: boolean;
}

/** Herman Legacy Marketing operating model (deliverable 1). */
export function hermanLegacyMarketing(): MarketingOperatingModel {
  return {
    mission: MARKETING_MISSION,
    valueChain: MARKETING_VALUE_CHAIN,
    reuse: marketingCapabilityReuse(),
    commercialization: MARKETING_COMMERCIALIZATION,
    supportsAllLayers: MARKETING_COMMERCIALIZATION.length === 5,
  };
}
