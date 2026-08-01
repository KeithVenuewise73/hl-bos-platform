/**
 * HERMAN LEGACY DIGITAL — information architecture (Execution Phase 5).
 *
 * Herman Legacy Digital is the flagship customer-facing operating company — the
 * public face of Herman Legacy's Business Transformation practice. (It is NOT the
 * holding company; Herman Legacy Group remains the parent.)
 *
 * THIS PHASE IS ARCHITECTURE ONLY. No visual design, no frontend, no CSS, no
 * deployment. This module encodes the information architecture as tested DATA —
 * the site map, customer journey, navigation hierarchy, capability reuse
 * assessment, Innovation Marketplace and Customer Portal specifications — so the
 * "reuse before creating" rule is machine-checkable, not asserted.
 *
 * ASSEMBLE, DON'T REBUILD. Every site surface is backed by a capability that
 * ALREADY EXISTS. The only net-new work is the public presentation surface itself,
 * which this phase explicitly defers until CEO approval. HONESTY (Principle 10):
 * a surface with no existing backing is marked `net_new`, never glossed.
 */

import { buildCatalog, findImplementations } from "@hl-bos/catalog";

// ==========================================================================
// Deliverable 4 — capability reuse assessment (the foundation)
// ==========================================================================

export type DigitalReuseVerdict = "reuse" | "reuse_cross_platform" | "net_new";

export interface DigitalCapability {
  name: string;
  purpose: string;
  catalogAsset?: string;
  capabilityTerm?: string;
  verdict: DigitalReuseVerdict;
  backing: string;
}

const BUILT = new Set(["production", "functional", "partial"]);

function resolve(def: {
  name: string;
  purpose: string;
  catalogAsset?: string;
  capabilityTerm?: string;
  backing: string;
}): DigitalCapability {
  if (def.catalogAsset) {
    const exists = buildCatalog().assets.some((a) => a.id === def.catalogAsset);
    return { ...def, verdict: exists ? "reuse" : "net_new" };
  }
  if (def.capabilityTerm) {
    const hits = findImplementations(def.capabilityTerm).filter((i) =>
      BUILT.has(i.maturity),
    );
    const hlbos = hits.find((i) => i.platform === "hlbos_core");
    if (hlbos) return { ...def, verdict: "reuse" };
    if (hits.length > 0) return { ...def, verdict: "reuse_cross_platform" };
    return { ...def, verdict: "net_new" };
  }
  return { ...def, verdict: "net_new" };
}

/** The 15 capabilities the brief names, resolved to their existing backing. */
export function digitalCapabilities(): DigitalCapability[] {
  return [
    resolve({
      name: "Customer authentication",
      purpose: "Sign in / accounts.",
      catalogAsset: "svc.identity",
      backing: "Identity & Auth",
    }),
    resolve({
      name: "CRM",
      purpose: "Prospects and accounts.",
      catalogAsset: "svc.discovery",
      backing: "Intelligence CRM (Phase 3)",
    }),
    resolve({
      name: "Customer Manufacturing",
      purpose: "The customer lifecycle.",
      catalogAsset: "prod.hl-bti",
      backing: "Customer Manufacturing System (Phase 3)",
    }),
    resolve({
      name: "VisibilityAI",
      purpose: "Assessment entry point.",
      catalogAsset: "prod.visibility-ai",
      backing: "VisibilityAI",
    }),
    resolve({
      name: "HL-BTI",
      purpose: "Transformation entry point.",
      catalogAsset: "prod.hl-bti",
      backing: "HL-BTI",
    }),
    resolve({
      name: "Marketing",
      purpose: "Marketing & growth surfaces.",
      catalogAsset: "app.executive-portal",
      backing: "Herman Legacy Marketing (Phase 3A)",
    }),
    resolve({
      name: "Portfolio",
      purpose: "Product catalog for the marketplace.",
      catalogAsset: "pkg.catalog",
      backing: "Portfolio engine (Phase 2)",
    }),
    resolve({
      name: "Knowledge Graph",
      purpose: "Relationships / knowledge center.",
      catalogAsset: "pkg.catalog",
      backing: "Knowledge Graph",
    }),
    resolve({
      name: "Innovation Marketplace",
      purpose: "Product discovery.",
      catalogAsset: "pkg.catalog",
      backing: "Portfolio productCatalog surfaced",
    }),
    resolve({
      name: "Customer dashboards",
      purpose: "Client-facing dashboards.",
      backing:
        "Data exists (portfolio/CRM); customer-facing surface is net-new (deferred)",
    }),
    resolve({
      name: "Executive dashboards",
      purpose: "Internal marketplace / ops.",
      catalogAsset: "mod.bti-platform",
      backing: "BTI executive dashboards",
    }),
    resolve({
      name: "Documents",
      purpose: "Proposals, collateral, case studies.",
      capabilityTerm: "documents",
      backing: "Documents engine (Venuewise, cross-platform)",
    }),
    resolve({
      name: "Workflow",
      purpose: "Booking / approval flows.",
      catalogAsset: "svc.workflows",
      backing: "Workflows human-approval gate",
    }),
    resolve({
      name: "Communications",
      purpose: "Contact / nurture.",
      catalogAsset: "svc.comms",
      backing: "Communications",
    }),
    resolve({
      name: "Portal framework",
      purpose: "The app shell for authenticated surfaces.",
      catalogAsset: "app.executive-portal",
      backing: "Executive Portal (Next.js) framework",
    }),
  ];
}

export interface DigitalReuseAssessment {
  capabilities: DigitalCapability[];
  total: number;
  reuseCount: number;
  crossPlatformCount: number;
  netNewCount: number;
  netNewCapabilities: string[];
  reusePct: number;
}

export function digitalCapabilityReuse(): DigitalReuseAssessment {
  const capabilities = digitalCapabilities();
  const reuseCount = capabilities.filter((c) => c.verdict === "reuse").length;
  const crossPlatformCount = capabilities.filter(
    (c) => c.verdict === "reuse_cross_platform",
  ).length;
  const netNewCount = capabilities.filter((c) => c.verdict === "net_new").length;
  return {
    capabilities,
    total: capabilities.length,
    reuseCount,
    crossPlatformCount,
    netNewCount,
    netNewCapabilities: capabilities
      .filter((c) => c.verdict === "net_new")
      .map((c) => c.name),
    reusePct: Math.round(
      ((capabilities.length - netNewCount) / capabilities.length) * 100,
    ),
  };
}

// ==========================================================================
// Deliverable 1 — the site map
// ==========================================================================

export type AuthLevel = "public" | "authenticated" | "internal";

export interface SiteNode {
  name: string;
  path: string;
  purpose: string;
  auth: AuthLevel;
  /** The capability (by name) that backs this page. */
  backedBy: string;
}

/** The complete Herman Legacy Digital site map. */
export const SITE_MAP: SiteNode[] = [
  {
    name: "Home",
    path: "/",
    purpose: "Lead-gen landing + value proposition.",
    auth: "public",
    backedBy: "Marketing",
  },
  {
    name: "About",
    path: "/about",
    purpose: "The Herman Legacy story and practice.",
    auth: "public",
    backedBy: "Marketing",
  },
  {
    name: "Industries",
    path: "/industries",
    purpose: "Industry-specific transformation.",
    auth: "public",
    backedBy: "Portfolio",
  },
  {
    name: "Solutions",
    path: "/solutions",
    purpose: "The product portfolio, framed by outcome.",
    auth: "public",
    backedBy: "Portfolio",
  },
  {
    name: "Business Transformation",
    path: "/transformation",
    purpose: "The HL-BTI practice + methodology.",
    auth: "public",
    backedBy: "HL-BTI",
  },
  {
    name: "VisibilityAI",
    path: "/visibility-ai",
    purpose: "The free assessment entry point.",
    auth: "public",
    backedBy: "VisibilityAI",
  },
  {
    name: "Marketing & Growth",
    path: "/marketing",
    purpose: "The marketing service offering.",
    auth: "public",
    backedBy: "Marketing",
  },
  {
    name: "Innovation Marketplace",
    path: "/marketplace",
    purpose: "Discover products/capabilities.",
    auth: "public",
    backedBy: "Innovation Marketplace",
  },
  {
    name: "Customer Portal",
    path: "/portal",
    purpose: "The authenticated client home.",
    auth: "authenticated",
    backedBy: "Customer Manufacturing",
  },
  {
    name: "Book Assessment",
    path: "/book",
    purpose: "Start a VisibilityAI / HL-BTI assessment.",
    auth: "public",
    backedBy: "Workflow",
  },
  {
    name: "Resources",
    path: "/resources",
    purpose: "Knowledge center / guides.",
    auth: "public",
    backedBy: "Knowledge Graph",
  },
  {
    name: "Case Studies",
    path: "/case-studies",
    purpose: "Reference implementations as proof.",
    auth: "public",
    backedBy: "Documents",
  },
  {
    name: "Contact",
    path: "/contact",
    purpose: "Talk to Herman Legacy.",
    auth: "public",
    backedBy: "Communications",
  },
  {
    name: "AI Assistant",
    path: "/assistant",
    purpose: "Guided help across the site (gated).",
    auth: "public",
    backedBy: "HL-BTI",
  },
];

// ==========================================================================
// Deliverable 2 — the customer journey
// ==========================================================================

export interface JourneyStage {
  seq: number;
  name: string;
  /** The site surface where this happens. */
  surface: string;
  /** The existing system that performs it. */
  backing: string;
}

/** The complete Visitor → Renewal journey, mapped to surfaces + existing systems. */
export const DIGITAL_JOURNEY: JourneyStage[] = [
  { seq: 1, name: "Visitor", surface: "Home / Solutions", backing: "Marketing" },
  {
    seq: 2,
    name: "Visibility Assessment",
    surface: "VisibilityAI / Book",
    backing: "VisibilityAI",
  },
  {
    seq: 3,
    name: "CRM",
    surface: "(captured) Customer Portal",
    backing: "Intelligence CRM",
  },
  { seq: 4, name: "HL-BTI", surface: "Business Transformation", backing: "HL-BTI" },
  {
    seq: 5,
    name: "Proposal",
    surface: "Customer Portal",
    backing: "Commerce & Provisioning",
  },
  {
    seq: 6,
    name: "Transformation",
    surface: "Customer Portal",
    backing: "Customer Manufacturing",
  },
  {
    seq: 7,
    name: "Customer Portal",
    surface: "Customer Portal",
    backing: "Portal framework",
  },
  {
    seq: 8,
    name: "Innovation Marketplace",
    surface: "Marketplace (authenticated)",
    backing: "Portfolio",
  },
  {
    seq: 9,
    name: "Expansion",
    surface: "Marketplace / Portal",
    backing: "Portfolio (evaluateIdea)",
  },
  { seq: 10, name: "Renewal", surface: "Customer Portal", backing: "Billing" },
];

// ==========================================================================
// Deliverable 3 — the navigation hierarchy
// ==========================================================================

export interface NavGroup {
  group: string;
  items: string[];
}

export const NAV_HIERARCHY: NavGroup[] = [
  {
    group: "Primary",
    items: [
      "Home",
      "Business Transformation",
      "VisibilityAI",
      "Innovation Marketplace",
    ],
  },
  {
    group: "Company",
    items: ["About", "Industries", "Solutions", "Marketing & Growth"],
  },
  { group: "Client", items: ["Customer Portal", "Book Assessment"] },
  { group: "Knowledge", items: ["Resources", "Case Studies", "AI Assistant"] },
  { group: "Utility", items: ["Contact"] },
];

// ==========================================================================
// Deliverable 5 — the Innovation Marketplace (three experiences)
// ==========================================================================

export interface MarketplaceExperience {
  tier: "public" | "authenticated_client" | "internal";
  audience: string;
  shows: string[];
  backing: string;
}

export const MARKETPLACE_EXPERIENCES: MarketplaceExperience[] = [
  {
    tier: "public",
    audience: "Any visitor",
    shows: [
      "General product discovery",
      "Outcomes and industries",
      "Book-assessment CTA",
    ],
    backing: "Portfolio productCatalog (public projection — no internal metrics)",
  },
  {
    tier: "authenticated_client",
    audience: "Signed-in customers",
    shows: [
      "Personalized recommendations",
      "Their transformation roadmap",
      "Products already owned",
      "Suggested next capabilities",
    ],
    backing: "Portfolio evaluateIdea + Customer Manufacturing + CRM (per-account)",
  },
  {
    tier: "internal",
    audience: "Herman Legacy staff",
    shows: [
      "Product maturity",
      "Commercialization layers",
      "Assembly percentage",
      "Factory readiness",
    ],
    backing: "Portfolio productCatalog + Factory registry (full internal metrics)",
  },
];

// ==========================================================================
// Deliverable 6 — the Customer Portal specification
// ==========================================================================

export interface PortalSection {
  name: string;
  purpose: string;
  backing: string;
}

export const CUSTOMER_PORTAL_SECTIONS: PortalSection[] = [
  {
    name: "Overview",
    purpose: "Engagement status + next step.",
    backing: "Customer Manufacturing lifecycle",
  },
  {
    name: "My Products",
    purpose: "Products owned + entitlements.",
    backing: "Portfolio + Entitlements",
  },
  {
    name: "Transformation Roadmap",
    purpose: "The HL-BTI blueprint + progress.",
    backing: "HL-BTI",
  },
  {
    name: "Marketplace",
    purpose: "Authenticated marketplace (next capabilities).",
    backing: "Portfolio evaluateIdea",
  },
  {
    name: "Documents",
    purpose: "Proposals, agreements, reports.",
    backing: "Documents (Venuewise)",
  },
  {
    name: "Dashboards",
    purpose: "Client-facing growth/ROI dashboards.",
    backing: "Executive dashboards (customer surface net-new)",
  },
  {
    name: "Support",
    purpose: "Requests + communications.",
    backing: "Communications + Workflow",
  },
];

// ==========================================================================
// The assembled information architecture (entry point)
// ==========================================================================

export interface HermanLegacyDigitalIA {
  siteMap: SiteNode[];
  journey: JourneyStage[];
  navHierarchy: NavGroup[];
  reuse: DigitalReuseAssessment;
  marketplace: MarketplaceExperience[];
  portalSections: PortalSection[];
  /** Every site node is backed by a named capability (no orphan surfaces). */
  allNodesBacked: boolean;
}

export function hermanLegacyDigital(): HermanLegacyDigitalIA {
  const reuse = digitalCapabilityReuse();
  const backedNames = new Set(reuse.capabilities.map((c) => c.name));
  const allNodesBacked = SITE_MAP.every((n) => backedNames.has(n.backedBy));
  return {
    siteMap: SITE_MAP,
    journey: DIGITAL_JOURNEY,
    navHierarchy: NAV_HIERARCHY,
    reuse,
    marketplace: MARKETPLACE_EXPERIENCES,
    portalSections: CUSTOMER_PORTAL_SECTIONS,
    allNodesBacked,
  };
}
