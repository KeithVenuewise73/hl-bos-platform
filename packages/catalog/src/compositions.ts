/**
 * Product Composition Definitions + Commercial Metadata.
 *
 * For every Herman Legacy product: which registered engineering modules it is
 * assembled from, its shared services, AI services, dependencies, edition,
 * deployment requirements, and commercial metadata.
 *
 * HONESTY RULE (platform Principle 10): pricing, licensing, and ownership are
 * CEO decisions. They are NEVER invented here — they carry an explicit
 * `pending-ceo` status. Support tier and subscription model are recorded as
 * *proposed* structures, not commitments. Commercial availability is computed
 * from real readiness, not asserted.
 */

import { moduleByKey, type ModuleDef } from "./modules";

export type PendingOrValue =
  { status: "pending-ceo"; note?: string } | { status: "set"; value: string };

export interface CommercialMetadata {
  /** Honest version; null until something ships. */
  version: string | null;
  /** Proposed support tier structure (not a commitment). */
  supportTier: "standard" | "managed" | "enterprise" | "proposed";
  /** Proposed subscription model. */
  subscriptionModel: "subscription" | "one_time" | "managed_service" | "proposed";
  /** Computed from readiness — never asserted. */
  commercialAvailability:
    "not_yet" | "needs_assembly" | "ready_to_launch" | "available";
  pricing: PendingOrValue;
  licensing: PendingOrValue;
  ownership: PendingOrValue;
}

export interface ProductComposition {
  productKey: string;
  name: string;
  industryTemplate?: string;
  /** Engineering module keys (from MODULE_REGISTRY) this product is built from. */
  requiredModules: string[];
  /** External AI services used. */
  aiServices: string[];
  /** External dependencies (providers, keys). */
  dependencies: string[];
  /** Proposed commercial edition. */
  edition: string;
  deploymentRequirements: string[];
  commercial: CommercialMetadata;
}

const PENDING: PendingOrValue = { status: "pending-ceo" };

const COMMON_SPINE = [
  "identity_core",
  "tenancy",
  "audit",
  "events_bus",
  "entitlements",
  "workflows",
  "billing_core",
  "storage",
  "communications",
];

function commercial(
  availability: CommercialMetadata["commercialAvailability"],
  subscriptionModel: CommercialMetadata["subscriptionModel"] = "proposed",
): CommercialMetadata {
  return {
    version: null,
    supportTier: "proposed",
    subscriptionModel,
    commercialAvailability: availability,
    pricing: PENDING,
    licensing: PENDING,
    ownership: PENDING,
  };
}

export const PRODUCT_COMPOSITIONS: ProductComposition[] = [
  {
    productKey: "hl_bti",
    name: "HL-BTI (Business Transformation Intelligence)",
    industryTemplate: "consulting",
    requiredModules: [
      ...COMMON_SPINE,
      "ai_gateway",
      "discovery_engine",
      "blueprint_engine",
      "commerce_provisioning",
      "bti_platform",
      "scoring_engine",
    ],
    aiServices: ["ai_gateway"],
    dependencies: ["Anthropic (via gateway)", "Stripe (billing)"],
    edition: "Professional",
    deploymentRequirements: [
      "HL-BOS Core database (migrations applied)",
      "app hosting (Coolify/Vercel)",
      "publishable key + auth",
    ],
    commercial: commercial("ready_to_launch", "managed_service"),
  },
  {
    productKey: "visibility_ai",
    name: "VisibilityAI",
    requiredModules: [
      ...COMMON_SPINE,
      "ai_gateway",
      "discovery_engine",
      "website_scanner",
      "blueprint_engine",
      "visibility_assessments",
      "integrations",
    ],
    aiServices: ["ai_gateway"],
    dependencies: ["Anthropic", "PageSpeed / Google Business (integrations)"],
    edition: "Professional",
    deploymentRequirements: [
      "HL-BOS Core database",
      "edge runtime (scan worker) switched on",
      "customer-facing app",
    ],
    commercial: commercial("needs_assembly", "subscription"),
  },
  {
    productKey: "salon_ai",
    name: "SalonAI",
    industryTemplate: "salon",
    requiredModules: [
      ...COMMON_SPINE,
      "discovery_engine",
      "visibility_assessments",
      "bti_platform",
      "scoring_engine",
    ],
    aiServices: ["ai_gateway"],
    dependencies: ["Anthropic", "Stripe"],
    edition: "Professional",
    deploymentRequirements: [
      "HL-BOS Core database",
      "salon industry template applied",
      "app hosting",
    ],
    commercial: commercial("needs_assembly", "subscription"),
  },
  {
    productKey: "review_management",
    name: "Review Management",
    requiredModules: [...COMMON_SPINE, "discovery_engine", "visibility_assessments"],
    aiServices: ["ai_gateway"],
    dependencies: ["review sources (integrations)"],
    edition: "Standard",
    deploymentRequirements: ["HL-BOS Core database", "app hosting"],
    commercial: commercial("needs_assembly", "subscription"),
  },
  {
    productKey: "reputation_recovery",
    name: "Reputation Recovery",
    requiredModules: [...COMMON_SPINE, "discovery_engine", "visibility_assessments"],
    aiServices: ["ai_gateway"],
    dependencies: ["review sources", "comms providers"],
    edition: "Standard",
    deploymentRequirements: ["HL-BOS Core database", "app hosting"],
    commercial: commercial("needs_assembly", "subscription"),
  },
  {
    productKey: "reception_ai",
    name: "ReceptionAI",
    requiredModules: [...COMMON_SPINE, "ai_gateway", "discovery_engine"],
    aiServices: ["ai_gateway"],
    dependencies: ["Anthropic", "telephony provider (future)"],
    edition: "Professional",
    deploymentRequirements: [
      "HL-BOS Core database",
      "AI receptionist engine (net-new)",
      "telephony integration",
    ],
    commercial: commercial("not_yet", "subscription"),
  },
  {
    productKey: "transportation_ai",
    name: "TransportationAI",
    industryTemplate: "transportation",
    requiredModules: [...COMMON_SPINE, "discovery_engine", "scoring_engine"],
    aiServices: ["ai_gateway"],
    dependencies: ["mapping/route provider (future)"],
    edition: "Professional",
    deploymentRequirements: [
      "HL-BOS Core database",
      "route-assessment engine (net-new)",
    ],
    commercial: commercial("not_yet", "subscription"),
  },
  {
    productKey: "home_huddle",
    name: "HomeHuddle",
    industryTemplate: "home_services",
    requiredModules: [...COMMON_SPINE, "discovery_engine", "scoring_engine"],
    aiServices: ["ai_gateway"],
    dependencies: ["Venuewise convergence decision"],
    edition: "Professional",
    deploymentRequirements: [
      "HL-BOS Core database",
      "community domain (re-implement)",
      "Venuewise convergence resolved",
    ],
    commercial: commercial("not_yet", "subscription"),
  },
];

export function compositionByKey(key: string): ProductComposition | undefined {
  return PRODUCT_COMPOSITIONS.find((c) => c.productKey === key);
}

/** Resolve a composition's required module keys to ModuleDefs (skips unknowns). */
export function resolveModules(c: ProductComposition): ModuleDef[] {
  return c.requiredModules
    .map(moduleByKey)
    .filter((m): m is ModuleDef => m !== undefined);
}

/** Shared-spine modules a composition uses (the reuse dividend). */
export function sharedSpineOf(c: ProductComposition): string[] {
  return c.requiredModules.filter((k) => COMMON_SPINE.includes(k));
}
