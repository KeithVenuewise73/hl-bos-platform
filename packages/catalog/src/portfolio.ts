/**
 * THE PRODUCT PORTFOLIO MANAGEMENT SYSTEM (Execution Phase 2, Parts 3–6 + DoD).
 *
 * HLVS, restored and extended into the permanent portfolio engine for the
 * Software Factory. Every software idea moves through ONE standard lifecycle;
 * every opportunity carries a computed assembly picture; the CEO can submit a
 * new idea and immediately learn whether it exists, what can be reused, the
 * assembly %, the required engineering, the commercialization options, and the
 * path to launch.
 *
 * ASSEMBLE, DON'T REBUILD. The assembly maths is the existing cross-platform
 * assembler (`assembleBlueprint`); the reuse check is the existing
 * `duplicateCheck`. This module adds the lifecycle, the standing opportunity
 * catalog, and the single `evaluateIdea` entry point over them.
 *
 * HONESTY (Principle 10). Nothing is fabricated. ROI and market size are
 * `not_estimated` (they require a real assessment), current customers are the
 * true count (0 — nothing is commercially live), pricing/terms stay pending-CEO,
 * and assembly %, net-new work and priority are COMPUTED from the registry, not
 * asserted. Unspecified verticals are labeled `concept`, never invented into
 * fake capabilities.
 */

import {
  assembleBlueprint,
  type FactoryAssemblyBlueprint,
  type Market,
} from "./factory-blueprints";
import { duplicateCheck } from "./capability-reuse";
import type { CommercializationLayer } from "./factory-registry";

// ==========================================================================
// Part 3 — the one standard product lifecycle
// ==========================================================================

export type LifecycleStageId =
  | "idea_discovery"
  | "market_validation"
  | "capability_search"
  | "factory_assembly_estimate"
  | "commercialization_analysis"
  | "ceo_approval"
  | "product_creation"
  | "manufacturing"
  | "launch"
  | "revenue_tracking"
  | "portfolio_review";

export interface LifecycleStage {
  id: LifecycleStageId;
  seq: number;
  name: string;
  /** The existing mechanism that performs this stage (reuse, not rebuild). */
  mechanism: string;
  gated: boolean;
}

export const PORTFOLIO_LIFECYCLE: LifecycleStage[] = [
  {
    id: "idea_discovery",
    seq: 1,
    name: "Idea Discovery",
    mechanism: "portfolio.OPPORTUNITY_CATALOG + evaluateIdea",
    gated: false,
  },
  {
    id: "market_validation",
    seq: 2,
    name: "Market Validation",
    mechanism: "discovery engine + HL-BTI assessment",
    gated: false,
  },
  {
    id: "capability_search",
    seq: 3,
    name: "Capability Search",
    mechanism: "factory-registry findImplementations",
    gated: false,
  },
  {
    id: "factory_assembly_estimate",
    seq: 4,
    name: "Factory Assembly Estimate",
    mechanism: "factory-blueprints assembleBlueprint",
    gated: false,
  },
  {
    id: "commercialization_analysis",
    seq: 5,
    name: "Commercialization Analysis",
    mechanism: "Commercialization Law L1–L5 layer mapping",
    gated: false,
  },
  {
    id: "ceo_approval",
    seq: 6,
    name: "CEO Approval",
    mechanism: "workflows human-approval gate",
    gated: true,
  },
  {
    id: "product_creation",
    seq: 7,
    name: "Product Creation",
    mechanism: "compositions ProductComposition",
    gated: true,
  },
  {
    id: "manufacturing",
    seq: 8,
    name: "Manufacturing",
    mechanism: "HLVS factory lifecycle (creation order → build package)",
    gated: true,
  },
  {
    id: "launch",
    seq: 9,
    name: "Launch",
    mechanism: "app-registry + gated deployment",
    gated: true,
  },
  {
    id: "revenue_tracking",
    seq: 10,
    name: "Revenue Tracking",
    mechanism: "billing + analytics",
    gated: false,
  },
  {
    id: "portfolio_review",
    seq: 11,
    name: "Portfolio Review",
    mechanism: "portfolioDashboard (this module)",
    gated: false,
  },
];

// ==========================================================================
// Part 4/5 — the opportunity/product record
// ==========================================================================

/** An honest estimate placeholder. We never invent ROI or market-size numbers. */
export type Estimate =
  | { status: "not_estimated"; requires: string }
  | { status: "estimated"; value: string; basis: string };

const NOT_ESTIMATED_ASSESSMENT: Estimate = {
  status: "not_estimated",
  requires: "a customer assessment (HL-BTI) — never fabricated",
};
const NOT_ESTIMATED_MARKET: Estimate = {
  status: "not_estimated",
  requires: "market research — never fabricated",
};

export type OpportunityMaturity =
  | "live" // built and running
  | "prototype" // partial build exists
  | "planned" // specified, not built
  | "concept" // identified, requirements not yet specified
  | "legacy"; // exists in the unreachable legacy estate

export type ManufacturingLine =
  | "horizontal"
  | "consulting"
  | "service"
  | "logistics"
  | "sports"
  | "media"
  | "government"
  | "vertical";

/** Curated, honest seed for one opportunity. Assembly figures are COMPUTED, not stored. */
export interface OpportunitySeed {
  key: string;
  name: string;
  description: string;
  targetMarket: string;
  manufacturingLine: ManufacturingLine;
  /** Market this maps to for the assembler. */
  market: Market;
  businessOwner: string; // "unassigned" when genuinely unassigned — never invented
  maturity: OpportunityMaturity;
  /** Capability terms the product needs (resolved against the Factory registry). */
  requiredCapabilities: string[];
  /** Capabilities known to be net-new (unspecified verticals, novel engines). */
  knownNetNew?: string[];
  /** Proposed revenue model — a structure, not a committed price. */
  revenueModel: string;
  dependencies: string[];
  futureOpportunities: string[];
  /** True commercial reality today. Nothing is live, so this is 0 unless proven otherwise. */
  currentCustomers: number;
}

/**
 * THE HERMAN LEGACY SOFTWARE OPPORTUNITY CATALOG (Part 5).
 *
 * Every known software opportunity, drawn from the existing HLVS/catalog record
 * (registry.ts products, PRODUCT_COMPOSITIONS, the Venuewise harvest, and the
 * transformation-intelligence government/asset-recovery work). Unsupported
 * products are NOT invented: opportunities with no specified vertical are marked
 * `concept` and carry only the horizontal spine plus an explicit net-new
 * placeholder, so their low assembly % is honest.
 */
export const OPPORTUNITY_CATALOG: OpportunitySeed[] = [
  {
    key: "hl_bti",
    name: "HL-BTI (Business Transformation Intelligence)",
    description:
      "Assess → blueprint → proposal → implement → ROI. The first Factory product; the engine Herman Legacy sells and runs itself on.",
    targetMarket: "SMB owners and executives seeking transformation",
    manufacturingLine: "consulting",
    market: "consulting",
    businessOwner: "HSCS Consulting",
    maturity: "live",
    requiredCapabilities: [
      "identity",
      "billing",
      "business discovery",
      "blueprint generation",
      "deterministic scoring",
      "executive dashboards",
      "transformation intelligence",
      "communications",
    ],
    revenueModel: "Managed-service retainer (proposed)",
    dependencies: ["ai gateway (advisory)", "Stripe (billing)"],
    futureOpportunities: ["Vertical BTI editions (salon, transportation)"],
    currentCustomers: 0,
  },
  {
    key: "visibility_ai",
    name: "VisibilityAI",
    description:
      "Prospect capture → 16-category visibility assessment → Business Growth Score → recommendations.",
    targetMarket: "Local service businesses needing digital visibility",
    manufacturingLine: "service",
    market: "service",
    businessOwner: "Herman Legacy Digital",
    maturity: "prototype",
    requiredCapabilities: [
      "identity",
      "billing",
      "business discovery",
      "digital visibility",
      "reputation",
      "deterministic scoring",
      "communications",
    ],
    revenueModel: "Subscription (proposed)",
    dependencies: ["ai gateway", "PageSpeed / Google Business (integrations)"],
    futureOpportunities: ["Bundled with Review Management + Reputation Recovery"],
    currentCustomers: 0,
  },
  {
    key: "salon_ai",
    name: "SalonAI",
    description:
      "First HL-BOS service vertical: scheduling, visibility, reputation, reception.",
    targetMarket: "Salons and barbershops",
    manufacturingLine: "service",
    market: "service",
    businessOwner: "Herman Legacy Software Ventures",
    maturity: "planned",
    requiredCapabilities: [
      "identity",
      "billing",
      "scheduling",
      "communications",
      "reputation",
      "digital visibility",
      "ai receptionist",
    ],
    knownNetNew: ["ai receptionist"],
    revenueModel: "Subscription (proposed)",
    dependencies: [
      "Venuewise scheduling (cross-platform)",
      "AI receptionist (net-new)",
    ],
    futureOpportunities: ["Template for other appointment-based verticals"],
    currentCustomers: 0,
  },
  {
    key: "transportation_ai",
    name: "TransportationAI",
    description: "Logistics transformation: discovery, scoring, and route assessment.",
    targetMarket: "Transportation and logistics operators",
    manufacturingLine: "logistics",
    market: "logistics",
    businessOwner: "unassigned",
    maturity: "planned",
    requiredCapabilities: [
      "identity",
      "billing",
      "business discovery",
      "deterministic scoring",
      "communications",
      "route assessment",
    ],
    knownNetNew: ["route assessment"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Route-assessment engine (net-new)"],
    futureOpportunities: ["Freight Intelligence", "FleetHuddle"],
    currentCustomers: 0,
  },
  {
    key: "fleet_huddle",
    name: "FleetHuddle",
    description: "Fleet coordination: scheduling, messaging, facility/asset booking.",
    targetMarket: "Fleet and field-service operators",
    manufacturingLine: "logistics",
    market: "logistics",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "messaging",
      "facility booking",
      "deterministic scoring",
      "fleet telematics",
    ],
    knownNetNew: ["fleet telematics"],
    revenueModel: "Subscription (proposed)",
    dependencies: [
      "Venuewise scheduling/booking (cross-platform)",
      "Telematics (net-new)",
    ],
    futureOpportunities: ["Bundle with TransportationAI"],
    currentCustomers: 0,
  },
  {
    key: "reception_ai",
    name: "ReceptionAI",
    description: "AI front desk: answer, qualify and route inbound contact.",
    targetMarket: "Appointment-based service businesses",
    manufacturingLine: "service",
    market: "service",
    businessOwner: "unassigned",
    maturity: "planned",
    requiredCapabilities: [
      "identity",
      "communications",
      "scheduling",
      "ai receptionist",
    ],
    knownNetNew: ["ai receptionist"],
    revenueModel: "Subscription (proposed)",
    dependencies: [
      "ai gateway",
      "telephony provider (future)",
      "AI receptionist (net-new)",
    ],
    futureOpportunities: ["Embedded in SalonAI and other verticals"],
    currentCustomers: 0,
  },
  {
    key: "contractor_ai",
    name: "ContractorAI",
    description:
      "Home/trade contractor operations: scheduling, estimates, documents, billing.",
    targetMarket: "Home-services contractors",
    manufacturingLine: "service",
    market: "service",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "billing",
      "scheduling",
      "communications",
      "documents",
      "job estimate management",
    ],
    knownNetNew: ["job estimate management"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Venuewise scheduling/documents (cross-platform)"],
    futureOpportunities: ["HomeHuddle convergence"],
    currentCustomers: 0,
  },
  {
    key: "hockey_iq",
    name: "HockeyIQ",
    description:
      "Hockey development platform on the sports capability set + hockey analytics.",
    targetMarket: "Youth/junior hockey organizations and families",
    manufacturingLine: "sports",
    market: "sports",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "messaging",
      "payments",
      "team roster",
      "athlete development",
      "coach management",
      "facility booking",
      "hockey analytics engine",
      "player development index",
    ],
    knownNetNew: ["hockey analytics engine", "player development index"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Venuewise sports capabilities (cross-platform)"],
    futureOpportunities: ["FootballIQ and other sport verticals from the same spine"],
    currentCustomers: 0,
  },
  {
    key: "football_iq",
    name: "FootballIQ",
    description: "Football counterpart to HockeyIQ on the same sports capability set.",
    targetMarket: "Youth/school football organizations",
    manufacturingLine: "sports",
    market: "sports",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "messaging",
      "payments",
      "team roster",
      "athlete development",
      "coach management",
      "facility booking",
      "football analytics engine",
      "recruiting index",
    ],
    knownNetNew: ["football analytics engine", "recruiting index"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Venuewise sports capabilities (cross-platform)"],
    futureOpportunities: ["Multi-sport IQ platform"],
    currentCustomers: 0,
  },
  {
    key: "broadcast_ai",
    name: "BroadcastAI",
    description:
      "Media/broadcast operation over the 5-Star media capability + live production.",
    targetMarket: "Sports media and community broadcasters",
    manufacturingLine: "media",
    market: "sports",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "media operation",
      "communications",
      "live broadcast production",
    ],
    knownNetNew: ["live broadcast production"],
    revenueModel: "Subscription + sponsorship (proposed)",
    dependencies: ["Venuewise media operation (cross-platform)"],
    futureOpportunities: ["Bundle with Sports Intelligence"],
    currentCustomers: 0,
  },
  {
    key: "review_management",
    name: "Review Management",
    description: "Collect, monitor and respond to reviews across sources.",
    targetMarket: "Any business with an online reputation",
    manufacturingLine: "service",
    market: "service",
    businessOwner: "unassigned",
    maturity: "prototype",
    requiredCapabilities: [
      "identity",
      "business discovery",
      "reputation",
      "communications",
    ],
    revenueModel: "Subscription (proposed)",
    dependencies: ["review sources (integrations)"],
    futureOpportunities: ["Bundle with VisibilityAI"],
    currentCustomers: 0,
  },
  {
    key: "reputation_recovery",
    name: "Reputation Recovery",
    description: "Ethical reputation recovery and management workflow.",
    targetMarket: "Businesses recovering from reputation damage",
    manufacturingLine: "service",
    market: "service",
    businessOwner: "unassigned",
    maturity: "prototype",
    requiredCapabilities: [
      "identity",
      "business discovery",
      "reputation",
      "communications",
    ],
    revenueModel: "Subscription (proposed)",
    dependencies: ["review sources", "comms providers"],
    futureOpportunities: ["Bundle with Review Management"],
    currentCustomers: 0,
  },
  {
    key: "government_intelligence",
    name: "Government Intelligence",
    description:
      "Opportunity → win probability → capability gaps → profit → bid/no-bid recommendation.",
    targetMarket: "Government contractors and logistics primes",
    manufacturingLine: "government",
    market: "logistics",
    businessOwner: "HSCS Consulting",
    maturity: "live",
    requiredCapabilities: [
      "identity",
      "government intelligence",
      "deterministic scoring",
      "documents",
    ],
    revenueModel: "License / managed service (proposed)",
    dependencies: ["@hl-bos/transformation-intelligence government module"],
    futureOpportunities: ["Freight Intelligence for government logistics"],
    currentCustomers: 0,
  },
  {
    key: "asset_recovery",
    name: "Asset Recovery",
    description:
      "Legacy asset-recovery product; the legacy implementation had a cross-tenant finding and is out of scope.",
    targetMarket: "Asset-recovery operations",
    manufacturingLine: "vertical",
    market: "consulting",
    businessOwner: "unassigned",
    maturity: "legacy",
    requiredCapabilities: ["identity", "workflow", "documents", "asset tracking"],
    knownNetNew: ["asset tracking"],
    revenueModel: "Subscription (proposed)",
    dependencies: [
      "Rebuild on HL-BOS identity (fixes the legacy finding by construction)",
    ],
    futureOpportunities: ["Rebuilt cleanly via the Factory if prioritized"],
    currentCustomers: 0,
  },
  {
    key: "education",
    name: "Education",
    description:
      "Education vertical (opportunity identified; requirements not yet specified).",
    targetMarket: "Schools / districts",
    manufacturingLine: "vertical",
    market: "service",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "billing",
      "scheduling",
      "communications",
      "forms",
      "documents",
      "education vertical workflows",
    ],
    knownNetNew: ["education vertical workflows"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Vertical requirements definition (net-new)"],
    futureOpportunities: ["School-district industry template already seeded"],
    currentCustomers: 0,
  },
  {
    key: "healthcare",
    name: "Healthcare",
    description:
      "Healthcare vertical (opportunity identified; requirements + compliance not yet specified).",
    targetMarket: "Clinics / practices",
    manufacturingLine: "vertical",
    market: "service",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "billing",
      "scheduling",
      "communications",
      "forms",
      "documents",
      "healthcare vertical + compliance",
    ],
    knownNetNew: ["healthcare vertical + compliance"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Compliance framework (net-new)"],
    futureOpportunities: ["Reuse scheduling/forms/documents spine"],
    currentCustomers: 0,
  },
  {
    key: "ai_persona",
    name: "AI Persona",
    description:
      "Configurable AI persona over the metered AI gateway (opportunity identified).",
    targetMarket: "Businesses wanting a branded AI presence",
    manufacturingLine: "horizontal",
    market: "service",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "ai gateway",
      "communications",
      "persona engine",
    ],
    knownNetNew: ["persona engine"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["ai gateway", "Persona engine (net-new)"],
    futureOpportunities: ["Powers ReceptionAI and Mental Wellness"],
    currentCustomers: 0,
  },
  {
    key: "mental_wellness",
    name: "Mental Wellness",
    description:
      "Wellness engagement vertical (opportunity identified; clinical scope not specified).",
    targetMarket: "Wellness providers",
    manufacturingLine: "vertical",
    market: "service",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "communications",
      "ai gateway",
      "wellness vertical",
    ],
    knownNetNew: ["wellness vertical"],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Clinical scope definition (net-new)"],
    futureOpportunities: ["Shares scheduling + AI persona"],
    currentCustomers: 0,
  },
  {
    key: "freight_intelligence",
    name: "Freight Intelligence",
    description: "Freight scoring and route intelligence for logistics and government.",
    targetMarket: "Freight brokers and government logistics",
    manufacturingLine: "logistics",
    market: "logistics",
    businessOwner: "unassigned",
    maturity: "concept",
    requiredCapabilities: [
      "identity",
      "business discovery",
      "deterministic scoring",
      "route assessment",
      "freight intelligence engine",
    ],
    knownNetNew: ["route assessment", "freight intelligence engine"],
    revenueModel: "License / subscription (proposed)",
    dependencies: ["Shares scoring + route assessment with TransportationAI"],
    futureOpportunities: ["Government logistics bundle"],
    currentCustomers: 0,
  },
  {
    key: "sports_intelligence",
    name: "Sports Intelligence",
    description:
      "Umbrella sports platform over the full Venuewise sports capability set.",
    targetMarket: "Sports organizations and families",
    manufacturingLine: "sports",
    market: "sports",
    businessOwner: "unassigned",
    maturity: "prototype",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "messaging",
      "payments",
      "athlete development",
      "coach management",
      "team roster",
      "facility booking",
      "media operation",
    ],
    revenueModel: "Subscription (proposed)",
    dependencies: ["Venuewise sports capabilities (cross-platform adoption)"],
    futureOpportunities: ["HockeyIQ, FootballIQ and other sport verticals"],
    currentCustomers: 0,
  },
];

// ==========================================================================
// Enrichment — compute the assembly picture for each opportunity
// ==========================================================================

export type EngineeringPriority = "P1" | "P2" | "P3" | "P4";

export interface ProductRecord extends OpportunitySeed {
  // Computed from the Factory registry (never asserted):
  blueprint: FactoryAssemblyBlueprint;
  assemblyPct: number;
  netNewCapabilities: string[];
  reusableCapabilities: string[];
  commercializationLayers: CommercializationLayer[];
  assemblableNow: boolean;
  lifecycleStage: LifecycleStageId;
  status: string;
  engineeringPriority: EngineeringPriority;
  // Honest, never-fabricated commercial fields:
  roi: Estimate;
  marketSize: Estimate;
}

function lifecycleFor(
  maturity: OpportunityMaturity,
  assemblableNow: boolean,
): LifecycleStageId {
  switch (maturity) {
    case "live":
      // Built and running as an engine, but nothing is commercially launched (0
      // customers, terms pending-CEO): it waits at CEO go-to-market approval.
      return "ceo_approval";
    case "prototype":
      return assemblableNow
        ? "commercialization_analysis"
        : "factory_assembly_estimate";
    case "planned":
      return "capability_search";
    case "legacy":
      return "portfolio_review";
    case "concept":
      return "idea_discovery";
  }
}

function statusLabel(maturity: OpportunityMaturity, assemblableNow: boolean): string {
  if (maturity === "legacy") return "Legacy — out of scope (rebuild candidate)";
  if (maturity === "live") return "Manufactured — awaiting CEO go-to-market approval";
  if (assemblableNow) return "Assemblable now — no net-new engineering";
  if (maturity === "prototype") return "Under assembly estimate";
  if (maturity === "planned") return "Capability search / assembly";
  return "Idea — requirements not yet specified";
}

function priorityFor(
  assemblyPct: number,
  netNew: number,
  maturity: OpportunityMaturity,
): EngineeringPriority {
  // Honesty: a `concept` opportunity has UNSPECIFIED requirements — its high
  // assembly % is an artefact of collapsing the whole vertical into one net-new
  // placeholder, so it can never be top engineering-readiness. A `legacy` item
  // is a rebuild candidate, not ready work.
  const base: EngineeringPriority =
    assemblyPct >= 80 && netNew <= 1
      ? "P1"
      : assemblyPct >= 60
        ? "P2"
        : assemblyPct >= 40
          ? "P3"
          : "P4";
  if (maturity === "concept") return worseOf(base, "P2");
  if (maturity === "legacy") return worseOf(base, "P3");
  return base;
}

function worseOf(
  a: EngineeringPriority,
  floor: EngineeringPriority,
): EngineeringPriority {
  const rank: Record<EngineeringPriority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
  return rank[a] >= rank[floor] ? a : floor;
}

function enrich(seed: OpportunitySeed): ProductRecord {
  const blueprint = assembleBlueprint({
    productKey: seed.key,
    name: seed.name,
    market: seed.market,
    targetPlatform: "hlbos_core",
    requiredCapabilities: seed.requiredCapabilities,
    ...(seed.knownNetNew ? { knownNetNew: seed.knownNetNew } : {}),
  });
  const slots = blueprint.slots.length;
  const assemblyPct =
    slots === 0 ? 0 : Math.round(((slots - blueprint.netNewCount) / slots) * 100);
  const reusableCapabilities = blueprint.slots
    .filter((s) => s.disposition !== "net_new")
    .map((s) => s.requested);
  const assemblableNow = blueprint.netNewCount === 0 && seed.maturity !== "legacy";

  return {
    ...seed,
    blueprint,
    assemblyPct,
    netNewCapabilities: blueprint.netNewCapabilities,
    reusableCapabilities,
    commercializationLayers: blueprint.commercializationLayers,
    assemblableNow,
    lifecycleStage: lifecycleFor(seed.maturity, assemblableNow),
    status: statusLabel(seed.maturity, assemblableNow),
    engineeringPriority: priorityFor(assemblyPct, blueprint.netNewCount, seed.maturity),
    roi: NOT_ESTIMATED_ASSESSMENT,
    marketSize: NOT_ESTIMATED_MARKET,
  };
}

/** The full Herman Legacy Product Catalog with computed assembly for every opportunity. */
export function productCatalog(): ProductRecord[] {
  return OPPORTUNITY_CATALOG.map(enrich);
}

export function productByKey(key: string): ProductRecord | undefined {
  return productCatalog().find((p) => p.key === key);
}

// ==========================================================================
// Part 6 — the Executive Portfolio (CEO) Dashboard
// ==========================================================================

export interface PortfolioDashboard {
  total: number;
  /** Products the CEO can greenlight for assembly today (no net-new engineering). */
  assemblableNow: string[];
  /** Products that need engineering before launch. */
  needsEngineering: string[];
  /** Built products awaiting CEO go-to-market approval. */
  awaitingApproval: string[];
  /** Products in creation/manufacturing. */
  underConstruction: string[];
  /** Products with real paying customers (honest: none are live yet). */
  revenueGenerating: string[];
  /** Highest engineering-readiness (P1). Business priority remains a CEO decision. */
  highestPriority: string[];
  byLine: Record<ManufacturingLine, number>;
  byLifecycleStage: Record<LifecycleStageId, number>;
  byPriority: Record<EngineeringPriority, number>;
}

export function portfolioDashboard(): PortfolioDashboard {
  const products = productCatalog();
  const byLine = {} as Record<ManufacturingLine, number>;
  const byStage = {} as Record<LifecycleStageId, number>;
  const byPriority: Record<EngineeringPriority, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
  };
  for (const p of products) {
    byLine[p.manufacturingLine] = (byLine[p.manufacturingLine] ?? 0) + 1;
    byStage[p.lifecycleStage] = (byStage[p.lifecycleStage] ?? 0) + 1;
    byPriority[p.engineeringPriority] += 1;
  }
  return {
    total: products.length,
    assemblableNow: products.filter((p) => p.assemblableNow).map((p) => p.name),
    needsEngineering: products
      .filter((p) => p.netNewCapabilities.length > 0)
      .map((p) => p.name),
    awaitingApproval: products
      .filter((p) => p.lifecycleStage === "ceo_approval")
      .map((p) => p.name),
    underConstruction: products
      .filter(
        (p) =>
          p.lifecycleStage === "product_creation" ||
          p.lifecycleStage === "manufacturing",
      )
      .map((p) => p.name),
    revenueGenerating: products
      .filter((p) => p.currentCustomers > 0)
      .map((p) => p.name),
    highestPriority: products
      .filter((p) => p.engineeringPriority === "P1")
      .map((p) => p.name),
    byLine,
    byLifecycleStage: byStage,
    byPriority,
  };
}

// ==========================================================================
// The Definition of Done — submit an idea, know everything immediately
// ==========================================================================

export interface IdeaInput {
  name: string;
  description?: string;
  /** Capability terms the idea needs. If omitted, only the horizontal spine is assumed. */
  capabilities?: string[];
  market?: Market;
  knownNetNew?: string[];
}

export interface IdeaEvaluation {
  idea: string;
  /** Does a matching product/opportunity already exist in the catalog? */
  alreadyExists: boolean;
  existingMatches: Array<{ key: string; name: string; assemblyPct: number }>;
  capabilitiesSpecified: boolean;
  assembly: FactoryAssemblyBlueprint;
  assemblyPct: number;
  reusableCapabilities: string[];
  requiredEngineering: string[];
  commercializationLayers: CommercializationLayer[];
  suggestedLifecycleEntry: LifecycleStageId;
  /** Remaining lifecycle stages to launch, gates marked. */
  pathToLaunch: string[];
  note: string;
}

/** The default horizontal spine assumed when an idea does not specify capabilities. */
const DEFAULT_SPINE_TERMS = ["identity", "billing", "communications", "workflow"];

/**
 * THE DoD ENTRY POINT. Submit a software idea; immediately learn whether it
 * already exists, what can be reused, the assembly %, the required engineering,
 * the commercialization options, and the path to launch — all computed from the
 * live Factory registry, nothing fabricated.
 */
export function evaluateIdea(idea: IdeaInput): IdeaEvaluation {
  // 1. Does it already exist? Match the idea name's tokens against the catalog.
  const ideaTokens = new Set(
    idea.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
  const catalog = productCatalog();
  const existingMatches = catalog
    .filter((p) => {
      const nameTokens = p.name.toLowerCase();
      if ([...ideaTokens].some((t) => nameTokens.includes(t))) return true;
      // Also treat a strong capability-level duplicate as "related".
      return false;
    })
    .map((p) => ({ key: p.key, name: p.name, assemblyPct: p.assemblyPct }));

  // 2. Assembly picture (over provided capabilities or the default spine).
  const capabilitiesSpecified = Boolean(
    idea.capabilities && idea.capabilities.length > 0,
  );
  const caps = capabilitiesSpecified ? idea.capabilities! : DEFAULT_SPINE_TERMS;
  const assembly = assembleBlueprint({
    productKey: `idea_${[...ideaTokens].join("_") || "new"}`,
    name: idea.name,
    market: idea.market ?? "consulting",
    targetPlatform: "hlbos_core",
    requiredCapabilities: caps,
    ...(idea.knownNetNew ? { knownNetNew: idea.knownNetNew } : {}),
  });
  const slots = assembly.slots.length;
  const assemblyPct =
    slots === 0 ? 0 : Math.round(((slots - assembly.netNewCount) / slots) * 100);
  const reusableCapabilities = assembly.slots
    .filter((s) => s.disposition !== "net_new")
    .map((s) => s.requested);

  // 3. Reuse governance signal (deterministic duplicate check on the idea name).
  const dup = duplicateCheck({
    name: idea.name,
    ...(idea.description !== undefined ? { functionalPurpose: idea.description } : {}),
  });
  const relatedByCapability = dup.matches.slice(0, 3).map((m) => m.displayName);

  // 4. Lifecycle entry + path to launch.
  const entry: LifecycleStageId = existingMatches.length
    ? "capability_search"
    : "idea_discovery";
  const entrySeq = PORTFOLIO_LIFECYCLE.find((s) => s.id === entry)!.seq;
  const launchSeq = PORTFOLIO_LIFECYCLE.find((s) => s.id === "launch")!.seq;
  const pathToLaunch = PORTFOLIO_LIFECYCLE.filter(
    (s) => s.seq >= entrySeq && s.seq <= launchSeq,
  ).map((s) => `${s.seq}. ${s.name}${s.gated ? " (gated)" : ""}`);

  const note = existingMatches.length
    ? `Related existing product(s): ${existingMatches.map((m) => m.name).join(", ")}. Reuse/extend before building.`
    : relatedByCapability.length
      ? `No product match; related capabilities exist (${relatedByCapability.join(", ")}). ${assembly.netNewCount} net-new to build.`
      : `No close match; ${assembly.netNewCount} net-new capabilities to build.`;

  return {
    idea: idea.name,
    alreadyExists: existingMatches.length > 0,
    existingMatches,
    capabilitiesSpecified,
    assembly,
    assemblyPct,
    reusableCapabilities,
    requiredEngineering: assembly.netNewCapabilities,
    commercializationLayers: assembly.commercializationLayers,
    suggestedLifecycleEntry: entry,
    pathToLaunch,
    note: capabilitiesSpecified
      ? note
      : `${note} (Capabilities not specified — assumed the horizontal spine only; specify capabilities for a real assembly estimate.)`,
  };
}
