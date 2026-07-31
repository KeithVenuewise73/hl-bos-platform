/**
 * THE CANONICAL CAPABILITY LIBRARY (Phase XI-1).
 *
 * One authoritative, evidence-backed record of the reusable functional and
 * technical capabilities HL-BOS owns. It turns "reuse before rebuild" from a
 * documentation guideline into an enforceable platform capability: given a
 * proposed piece of work, the library deterministically answers "does this
 * already exist, and should we reuse / extend / consolidate / build?".
 *
 * ARCHITECTURAL CONTRACT (Phase X): this is NOT a new app, repo, or a second
 * catalog. It is a shared Enterprise-Intelligence capability inside
 * @hl-bos/catalog that LINKS to — never replaces — the Enterprise Catalog
 * (registry.ts) and the Application Registry (app-registry.ts). The three legacy
 * capability-like registries (MODULE_REGISTRY, the catalog's business_capability
 * assets, and the DB-seeded hlvs/discovery catalogs) are preserved and mapped in,
 * not collapsed.
 *
 * HONESTY (Principle 10): every capability cites its repository evidence. A
 * capability that exists only as a plan (a business_capability asset or an
 * architecture doc, with no built module) is classified `planned` — never
 * `implemented` or `reusable`. Nothing here is fabricated.
 */

import { MODULE_REGISTRY, moduleByKey, moduleIsBuilt } from "./modules";
import { PRODUCT_COMPOSITIONS } from "./compositions";
import { APPLICATIONS } from "./app-registry";
import { CATALOG } from "./registry";

// ==========================================================================
// Canonical domain model
// ==========================================================================

export type CapabilityType = "functional" | "technical" | "business";
export type CapabilityDomain =
  | "platform"
  | "identity"
  | "operations"
  | "automation"
  | "ai"
  | "communications"
  | "marketing"
  | "analytics"
  | "commerce"
  | "discovery"
  | "factory"
  | "intelligence"
  | "transportation";

export type Lifecycle = "active" | "planned" | "deprecated" | "superseded";
/** Implementation reality — distinct from lifecycle intent. */
export type CapMaturity = "implemented" | "partial" | "planned" | "deprecated";
export type Reusability = "reusable" | "internal_only" | "not_reusable";
export type StrategicImportance = "core" | "high" | "medium" | "low";
export type RiskLevel = "low" | "medium" | "high";
export type SecurityClassification = "public" | "internal" | "restricted";
export type ApprovalState = "approved" | "proposed" | "unverified";

/** The registries a capability's evidence may come from — the allow-list. */
export const KNOWN_CAPABILITY_SOURCES = [
  "MODULE_REGISTRY",
  "business_capability", // catalog registry.ts cap.* assets
  "hlvs.capabilities",
  "discovery.module_catalog",
  "discovery.service_catalog",
  "package", // an @hl-bos/* package
] as const;
export type CapabilitySource = (typeof KNOWN_CAPABILITY_SOURCES)[number];

export interface Capability {
  // --- Identity ---
  id: string;
  canonicalName: string;
  displayName: string;
  description: string;
  type: CapabilityType;
  domain: CapabilityDomain;
  lifecycle: Lifecycle;
  maturity: CapMaturity;
  reusability: Reusability;
  strategicImportance: StrategicImportance;
  sourceSystems: CapabilitySource[];
  owningBusinessUnit: string;
  owningTeam: string;
  /** Every legacy key this capability is known by across the registries. */
  aliases: string[];

  // --- Technical definition ---
  /** MODULE_REGISTRY keys that provide this capability (may be empty if planned). */
  providedByModules: string[];
  package: string | null;
  schema: string | null;
  edgeFunctions: string[];

  // --- Business definition ---
  businessFunction: string;
  industries: string[];
  monetization: "direct" | "enabling" | "internal";
  licensing: string;
  commercialReadiness: "ready" | "needs_assembly" | "not_yet" | "internal";

  // --- Relationships (peer capability ids; app/product links are computed) ---
  dependsOn: string[];
  alternatives: string[];
  /** Legacy keys/records consolidated into this canonical capability. */
  duplicatesConsolidated: string[];
  supersedes: string | null;
  replacedBy: string | null;

  // --- Governance ---
  owner: string;
  approvalState: ApprovalState;
  verificationState: "verified" | "unverified";
  /** REQUIRED: repository evidence. A capability with no evidence is not admitted. */
  evidence: string;
  lastReviewed: string;
  riskLevel: RiskLevel;
  securityClassification: SecurityClassification;
  deprecationStatus: "active" | "deprecated";
}

// ==========================================================================
// The evidence-backed inventory
// ==========================================================================

const REVIEWED = "2026-07-30"; // Phase XI-1 review date (static; no Date.now in engine)

/** Small builder to keep the inventory readable and the required fields present. */
function cap(base: {
  id: string;
  name: string;
  display: string;
  description: string;
  type: CapabilityType;
  domain: CapabilityDomain;
  maturity: CapMaturity;
  reusability?: Reusability;
  importance?: StrategicImportance;
  sources: CapabilitySource[];
  unit?: string;
  team?: string;
  aliases?: string[];
  modules?: string[];
  package?: string | null;
  schema?: string | null;
  edge?: string[];
  businessFunction: string;
  industries?: string[];
  monetization?: "direct" | "enabling" | "internal";
  licensing?: string;
  commercial?: "ready" | "needs_assembly" | "not_yet" | "internal";
  dependsOn?: string[];
  alternatives?: string[];
  consolidated?: string[];
  supersedes?: string | null;
  replacedBy?: string | null;
  owner?: string;
  approval?: ApprovalState;
  verified?: boolean;
  evidence: string;
  risk?: RiskLevel;
  security?: SecurityClassification;
}): Capability {
  const lifecycle: Lifecycle =
    base.maturity === "planned"
      ? "planned"
      : base.maturity === "deprecated"
        ? "deprecated"
        : "active";
  return {
    id: base.id,
    canonicalName: base.name,
    displayName: base.display,
    description: base.description,
    type: base.type,
    domain: base.domain,
    lifecycle,
    maturity: base.maturity,
    reusability: base.reusability ?? "reusable",
    strategicImportance: base.importance ?? "medium",
    sourceSystems: base.sources,
    owningBusinessUnit: base.unit ?? "Herman Legacy Platform",
    owningTeam: base.team ?? "Platform Engineering",
    aliases: base.aliases ?? [],
    providedByModules: base.modules ?? [],
    package: base.package ?? null,
    schema: base.schema ?? null,
    edgeFunctions: base.edge ?? [],
    businessFunction: base.businessFunction,
    industries: base.industries ?? ["all"],
    monetization: base.monetization ?? "enabling",
    licensing: base.licensing ?? "pending-ceo",
    commercialReadiness: base.commercial ?? "internal",
    dependsOn: base.dependsOn ?? [],
    alternatives: base.alternatives ?? [],
    duplicatesConsolidated: base.consolidated ?? [],
    supersedes: base.supersedes ?? null,
    replacedBy: base.replacedBy ?? null,
    owner: base.owner ?? "Herman Legacy Platform",
    approvalState: base.approval ?? "approved",
    verificationState: base.verified === false ? "unverified" : "verified",
    evidence: base.evidence,
    lastReviewed: REVIEWED,
    riskLevel: base.risk ?? "low",
    securityClassification: base.security ?? "internal",
    deprecationStatus: base.maturity === "deprecated" ? "deprecated" : "active",
  };
}

export const CAPABILITIES: Capability[] = [
  // ---- Platform / technical foundation ----
  cap({
    id: "identity_access",
    name: "identity_access",
    display: "Identity & Access",
    description:
      "Multi-tenant identity, membership, roles and permissions. The authorization spine every subsystem trusts.",
    type: "technical",
    domain: "identity",
    maturity: "implemented",
    importance: "core",
    sources: ["MODULE_REGISTRY", "business_capability", "hlvs.capabilities"],
    aliases: ["identity", "tenancy", "tenant_identity", "tenant-identity"],
    modules: ["identity_core", "tenancy"],
    schema: "identity",
    businessFunction: "Secure multi-tenant access control",
    consolidated: ["cap.tenant-identity", "hlvs:tenant_identity"],
    evidence:
      "MODULE_REGISTRY identity_core+tenancy (live, 100% RLS); registry.ts cap.tenant-identity",
    security: "restricted",
  }),
  cap({
    id: "audit_logging",
    name: "audit_logging",
    display: "Audit & Security Events",
    description: "Append-only, immutable-even-to-admins log across sensitive tables.",
    type: "technical",
    domain: "platform",
    maturity: "implemented",
    importance: "core",
    sources: ["MODULE_REGISTRY"],
    aliases: ["audit"],
    modules: ["audit"],
    schema: "audit",
    businessFunction: "Tamper-evident accountability",
    evidence: "MODULE_REGISTRY audit (live); audit schema append-only",
    security: "restricted",
  }),
  cap({
    id: "event_bus",
    name: "event_bus",
    display: "Event Bus / Automation Backbone",
    description:
      "Transactional outbox with at-least-once delivery; the automation backbone.",
    type: "technical",
    domain: "automation",
    maturity: "implemented",
    importance: "core",
    sources: ["MODULE_REGISTRY"],
    aliases: ["events", "events_bus", "workflow_automation"],
    modules: ["events_bus"],
    schema: "events",
    businessFunction: "Reliable asynchronous automation",
    evidence: "MODULE_REGISTRY events_bus (live); dispatcher built, undeployed",
  }),
  cap({
    id: "human_approval",
    name: "human_approval",
    display: "Human Approval / Workflow Gate",
    description:
      "The reusable human-approval gate before anything risky (deploy, charge, build).",
    type: "technical",
    domain: "operations",
    maturity: "implemented",
    importance: "core",
    sources: ["MODULE_REGISTRY"],
    aliases: ["workflows", "workflow_gate", "human_gate"],
    modules: ["workflows"],
    schema: "workflows",
    businessFunction: "Governance / approval control",
    dependsOn: ["identity_access"],
    evidence: "MODULE_REGISTRY workflows (live)",
  }),
  cap({
    id: "entitlements",
    name: "entitlements",
    display: "Entitlements",
    description: "Feature catalog, plan mapping and module activation (has_feature).",
    type: "technical",
    domain: "operations",
    maturity: "implemented",
    sources: ["MODULE_REGISTRY"],
    aliases: ["entitlements"],
    modules: ["entitlements"],
    schema: "entitlements",
    businessFunction: "Feature gating by plan",
    dependsOn: ["identity_access"],
    evidence: "MODULE_REGISTRY entitlements (live)",
  }),
  cap({
    id: "storage",
    name: "storage",
    display: "Storage & Document Management",
    description: "File registry, retention classes, signed-URL access boundary.",
    type: "technical",
    domain: "operations",
    maturity: "implemented",
    sources: ["MODULE_REGISTRY", "discovery.module_catalog"],
    aliases: ["storage", "document_management"],
    modules: ["storage"],
    schema: "storage_meta",
    businessFunction: "Secure document storage",
    evidence: "MODULE_REGISTRY storage (live); provides storage+document_management",
  }),
  cap({
    id: "integrations",
    name: "integrations",
    display: "Integrations Framework",
    description:
      "Connector/connection/sync/webhook framework. Live framework; connector code still to come.",
    type: "technical",
    domain: "operations",
    maturity: "partial",
    sources: ["MODULE_REGISTRY"],
    aliases: ["integrations"],
    modules: ["integrations"],
    schema: "integrations",
    businessFunction: "External system connectivity",
    evidence: "MODULE_REGISTRY integrations (live framework, no live connectors)",
  }),

  // ---- AI ----
  cap({
    id: "ai_gateway",
    name: "ai_gateway",
    display: "AI Gateway",
    description:
      "The single metered, guard-railed door to every model. Advisory only; never authoritative.",
    type: "technical",
    domain: "ai",
    maturity: "partial",
    importance: "high",
    sources: ["MODULE_REGISTRY"],
    aliases: ["ai_gateway", "ai_enablement"],
    modules: ["ai_gateway"],
    schema: "ai",
    edge: ["ai-gateway"],
    businessFunction: "Governed AI execution",
    dependsOn: ["event_bus"],
    evidence: "MODULE_REGISTRY ai_gateway (built_undeployed); ai schema live, keyless",
  }),
  cap({
    id: "ai_receptionist",
    name: "ai_receptionist",
    display: "AI Receptionist",
    description:
      "Answer, qualify and route inbound contact via AI. Gateway exists; the receptionist engine is net-new.",
    type: "functional",
    domain: "ai",
    maturity: "planned",
    reusability: "reusable",
    importance: "high",
    sources: ["business_capability", "hlvs.capabilities", "discovery.module_catalog"],
    aliases: ["ai_receptionist", "ai-receptionist", "reception_ai"],
    modules: [],
    businessFunction: "Automated front-desk / reception",
    industries: ["salon", "barbershop", "healthcare", "professional_services"],
    monetization: "direct",
    commercial: "not_yet",
    dependsOn: ["ai_gateway", "communications"],
    consolidated: ["cap.ai-receptionist", "hlvs:ai_receptionist"],
    evidence:
      "registry.ts cap.ai-receptionist (reference); no built receptionist module — PLANNED",
    security: "internal",
  }),

  // ---- Communications / billing ----
  cap({
    id: "communications",
    name: "communications",
    display: "Communications",
    description: "Email/SMS templates, consent, suppression, send-with-approval.",
    type: "functional",
    domain: "communications",
    maturity: "partial",
    sources: [
      "MODULE_REGISTRY",
      "business_capability",
      "hlvs.capabilities",
      "discovery.module_catalog",
    ],
    aliases: ["communications", "comms", "cap.communications"],
    modules: ["communications"],
    schema: "comms",
    businessFunction: "Multi-channel customer communication",
    dependsOn: ["event_bus"],
    consolidated: ["cap.communications", "hlvs:communications"],
    evidence:
      "MODULE_REGISTRY communications (built_undeployed); registry.ts cap.communications",
  }),
  cap({
    id: "billing",
    name: "billing",
    display: "Billing & Payments",
    description:
      "Subscriptions, invoices, payments, entitlement reconciliation. Stripe adapter stubbed.",
    type: "functional",
    domain: "commerce",
    maturity: "partial",
    importance: "high",
    sources: ["MODULE_REGISTRY", "discovery.module_catalog"],
    aliases: ["billing", "payments", "billing_core"],
    modules: ["billing_core"],
    schema: "billing",
    businessFunction: "Revenue collection",
    monetization: "enabling",
    dependsOn: ["entitlements", "event_bus"],
    evidence: "MODULE_REGISTRY billing_core (built_undeployed); Stripe adapter stubbed",
    security: "restricted",
  }),

  // ---- Discovery / assessment / marketing ----
  cap({
    id: "business_discovery",
    name: "business_discovery",
    display: "Business Discovery",
    description:
      "Collectors → unified business profile → scored assessment → blueprint.",
    type: "functional",
    domain: "discovery",
    maturity: "implemented",
    importance: "high",
    reusability: "reusable",
    sources: ["MODULE_REGISTRY", "discovery.module_catalog"],
    aliases: ["business_discovery", "lead_capture", "discovery_engine"],
    modules: ["discovery_engine"],
    schema: "discovery",
    businessFunction: "Prospect/business intelligence gathering",
    monetization: "direct",
    commercial: "needs_assembly",
    dependsOn: ["ai_gateway", "event_bus"],
    evidence: "MODULE_REGISTRY discovery_engine (live); discovery schema",
  }),
  cap({
    id: "blueprint_generation",
    name: "blueprint_generation",
    display: "Blueprint Generation",
    description:
      "Assessment → versioned, evidence-traced transformation plan (findings, roadmap, impact).",
    type: "functional",
    domain: "analytics",
    maturity: "implemented",
    importance: "high",
    sources: ["MODULE_REGISTRY"],
    aliases: ["blueprint_engine", "blueprint_generation"],
    modules: ["blueprint_engine"],
    schema: "discovery",
    businessFunction: "Transformation planning",
    monetization: "direct",
    dependsOn: ["business_discovery"],
    evidence: "MODULE_REGISTRY blueprint_engine (live); migration 0023",
  }),
  cap({
    id: "digital_visibility",
    name: "digital_visibility",
    display: "Digital Visibility & SEO",
    description: "SSRF-safe website scanning, local presence and SEO evidence/scoring.",
    type: "functional",
    domain: "marketing",
    maturity: "partial",
    reusability: "reusable",
    sources: ["MODULE_REGISTRY", "discovery.module_catalog"],
    aliases: ["website_scanner", "local_visibility", "seo"],
    modules: ["website_scanner"],
    schema: "discovery",
    businessFunction: "Search/local discoverability",
    industries: ["all"],
    monetization: "direct",
    commercial: "needs_assembly",
    dependsOn: ["business_discovery", "ai_gateway"],
    evidence:
      "MODULE_REGISTRY website_scanner (built_undeployed); provides local_visibility+seo",
  }),
  cap({
    id: "reputation_management",
    name: "reputation_management",
    display: "Reputation & Review Management",
    description: "Reviews and reputation recovery/management.",
    type: "functional",
    domain: "marketing",
    maturity: "partial",
    reusability: "reusable",
    sources: ["MODULE_REGISTRY", "business_capability", "hlvs.capabilities"],
    aliases: ["reviews", "reputation_recovery", "reputation-recovery"],
    modules: ["visibility_assessments"],
    schema: "visibility",
    businessFunction: "Online reputation",
    monetization: "direct",
    commercial: "needs_assembly",
    dependsOn: ["business_discovery"],
    consolidated: ["cap.reputation-recovery", "hlvs:reputation_recovery"],
    evidence:
      "MODULE_REGISTRY visibility_assessments (built_undeployed); registry.ts cap.reputation-recovery",
  }),

  // ---- Analytics / intelligence ----
  cap({
    id: "deterministic_scoring",
    name: "deterministic_scoring",
    display: "Deterministic Scoring",
    description:
      "Weighted, evidence-based scoring engine (null-not-zero). The real intelligence; no AI in the math.",
    type: "technical",
    domain: "analytics",
    maturity: "implemented",
    importance: "core",
    sources: ["MODULE_REGISTRY", "business_capability", "package"],
    aliases: ["scoring_engine", "kpi_scoring", "kpi-scoring"],
    modules: ["scoring_engine"],
    package: "@hl-bos/bti-engine",
    businessFunction: "Deterministic KPI/maturity scoring",
    monetization: "enabling",
    consolidated: ["cap.kpi-scoring"],
    evidence:
      "MODULE_REGISTRY scoring_engine (live); @hl-bos/bti-engine; registry.ts cap.kpi-scoring",
  }),
  cap({
    id: "executive_dashboards",
    name: "executive_dashboards",
    display: "Executive Dashboards",
    description: "Executive scoring, engagement lifecycle, ROI, CEO dashboard.",
    type: "functional",
    domain: "analytics",
    maturity: "implemented",
    sources: ["MODULE_REGISTRY", "discovery.module_catalog"],
    aliases: ["dashboards", "bti_platform"],
    modules: ["bti_platform"],
    schema: "bti",
    businessFunction: "Executive reporting",
    monetization: "direct",
    dependsOn: ["business_discovery", "deterministic_scoring"],
    evidence: "MODULE_REGISTRY bti_platform (live); bti schema",
  }),
  cap({
    id: "transformation_intelligence",
    name: "transformation_intelligence",
    display: "Transformation Intelligence (HL-BTI v2)",
    description:
      "Turns a scored assessment into executive recommendations: what happened, why, what to do, impact, approvals.",
    type: "functional",
    domain: "intelligence",
    maturity: "implemented",
    importance: "high",
    sources: ["package"],
    aliases: ["hl_bti_v2", "transformation_intelligence"],
    modules: ["bti_platform", "scoring_engine"],
    package: "@hl-bos/transformation-intelligence",
    businessFunction: "Business transformation advisory",
    monetization: "direct",
    dependsOn: ["deterministic_scoring", "software_factory"],
    evidence: "packages/transformation-intelligence (Phase VIII); tests green",
  }),
  cap({
    id: "government_intelligence",
    name: "government_intelligence",
    display: "Government Contract Intelligence",
    description:
      "Opportunity → win probability → capability gaps → profit → CEO recommendation (evidence-gated).",
    type: "functional",
    domain: "intelligence",
    maturity: "implemented",
    sources: ["package"],
    aliases: ["gov_intel", "government_intelligence"],
    package: "@hl-bos/transformation-intelligence",
    businessFunction: "Government bid/no-bid intelligence",
    industries: ["government", "transportation", "logistics"],
    monetization: "direct",
    dependsOn: ["deterministic_scoring"],
    evidence: "packages/transformation-intelligence/src/government.ts (Phase VIII)",
    security: "restricted",
  }),

  // ---- Commerce / factory / governance ----
  cap({
    id: "commerce_provisioning",
    name: "commerce_provisioning",
    display: "Commerce & Provisioning",
    description:
      "Proposal → agreement → provisioning request → work order → factory authorization.",
    type: "functional",
    domain: "commerce",
    maturity: "partial",
    sources: ["MODULE_REGISTRY"],
    aliases: ["commerce_provisioning"],
    modules: ["commerce_provisioning"],
    schema: "sales",
    businessFunction: "Sell-to-provision pipeline",
    dependsOn: ["billing", "business_discovery"],
    evidence:
      "MODULE_REGISTRY commerce_provisioning (built_undeployed); sales+provisioning schemas",
  }),
  cap({
    id: "software_factory",
    name: "software_factory",
    display: "Software Factory",
    description:
      "Governed loop: blueprint → creation order → prompt package → dev run → conformance → build package.",
    type: "technical",
    domain: "factory",
    maturity: "implemented",
    importance: "core",
    sources: ["MODULE_REGISTRY", "hlvs.capabilities"],
    aliases: ["hlvs_factory", "software_factory"],
    modules: ["hlvs_factory"],
    schema: "hlvs",
    package: "@hl-bos/catalog",
    businessFunction: "Governed software assembly",
    dependsOn: ["human_approval"],
    evidence: "MODULE_REGISTRY hlvs_factory (live); hlvs schema; catalog assembler",
  }),
  cap({
    id: "enterprise_catalog",
    name: "enterprise_catalog",
    display: "Enterprise Catalog",
    description:
      "The single source of truth for every Herman Legacy software asset + reuse governance.",
    type: "technical",
    domain: "factory",
    maturity: "implemented",
    importance: "core",
    sources: ["package"],
    aliases: ["catalog", "enterprise_catalog"],
    package: "@hl-bos/catalog",
    businessFunction: "Software estate governance",
    dependsOn: [],
    evidence: "packages/catalog (Phase II/IV); registry.ts + completeness",
  }),
  cap({
    id: "application_registry",
    name: "application_registry",
    display: "Application Registry",
    description:
      "Authoritative operational/deployment projection of every application.",
    type: "technical",
    domain: "factory",
    maturity: "implemented",
    sources: ["package"],
    aliases: ["app_registry", "application_registry"],
    package: "@hl-bos/catalog",
    businessFunction: "Deployment governance",
    dependsOn: ["enterprise_catalog"],
    evidence: "packages/catalog/src/app-registry.ts (Phase IX)",
  }),

  // ---- Planned functional capabilities (evidence: reference assets, no built module) ----
  cap({
    id: "scheduling",
    name: "scheduling",
    display: "Scheduling",
    description:
      "Appointment and resource scheduling. No built scheduling module today.",
    type: "functional",
    domain: "operations",
    maturity: "planned",
    reusability: "reusable",
    importance: "high",
    sources: ["business_capability", "hlvs.capabilities"],
    aliases: ["scheduling"],
    modules: [],
    businessFunction: "Appointment/resource scheduling",
    industries: ["salon", "barbershop", "healthcare", "professional_services"],
    monetization: "direct",
    commercial: "not_yet",
    consolidated: ["cap.scheduling", "hlvs:scheduling"],
    evidence:
      "registry.ts cap.scheduling (reference); hlvs.capabilities — no built module — PLANNED",
  }),
  cap({
    id: "route_assessment",
    name: "route_assessment",
    display: "Route Assessment",
    description:
      "Assess and score delivery/logistics routes. Net-new for TransportationAI.",
    type: "functional",
    domain: "transportation",
    maturity: "planned",
    importance: "high",
    sources: ["business_capability", "hlvs.capabilities"],
    aliases: ["route-assessment", "route_assessment"],
    modules: [],
    businessFunction: "Logistics route optimization",
    industries: ["transportation", "logistics"],
    monetization: "direct",
    commercial: "not_yet",
    consolidated: ["cap.route-assessment"],
    evidence: "registry.ts cap.route-assessment (reference); no built module — PLANNED",
  }),
  cap({
    id: "event_management",
    name: "event_management",
    display: "Event Management",
    description:
      "Manage events, registration and logistics. Reference capability; no built module.",
    type: "functional",
    domain: "operations",
    maturity: "planned",
    sources: ["business_capability"],
    aliases: ["event-management", "registration"],
    modules: [],
    businessFunction: "Event & registration management",
    industries: ["sports", "community"],
    monetization: "direct",
    commercial: "not_yet",
    consolidated: ["cap.event-management", "cap.registration"],
    evidence:
      "registry.ts cap.event-management + cap.registration (reference) — PLANNED",
  }),
  cap({
    id: "document_extraction",
    name: "document_extraction",
    display: "Document Extraction",
    description:
      "Extract structured data from documents. Reference capability; no built extractor.",
    type: "functional",
    domain: "operations",
    maturity: "planned",
    sources: ["business_capability"],
    aliases: ["document-extraction"],
    modules: [],
    businessFunction: "Document data extraction",
    monetization: "enabling",
    commercial: "not_yet",
    consolidated: ["cap.document-extraction"],
    alternatives: ["storage"],
    evidence: "registry.ts cap.document-extraction (reference) — PLANNED",
  }),
];

// ==========================================================================
// Lookups + computed relationships (links, never merges)
// ==========================================================================

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

const ALIAS_INDEX: ReadonlyMap<string, Capability> = (() => {
  const m = new Map<string, Capability>();
  for (const c of CAPABILITIES) {
    m.set(c.id.toLowerCase(), c);
    m.set(c.canonicalName.toLowerCase(), c);
    for (const a of c.aliases) m.set(a.toLowerCase(), c);
  }
  return m;
})();

export function capabilityByAlias(alias: string): Capability | undefined {
  return ALIAS_INDEX.get(alias.trim().toLowerCase());
}

/** The canonical capability a MODULE_REGISTRY module provides (by module key or its provides[]). */
export function capabilityForModule(moduleKey: string): Capability | undefined {
  const direct = CAPABILITIES.find((c) => c.providedByModules.includes(moduleKey));
  if (direct) return direct;
  const m = moduleByKey(moduleKey);
  if (!m) return undefined;
  for (const p of m.provides) {
    const hit = capabilityByAlias(p);
    if (hit) return hit;
  }
  return undefined;
}

/** Products (compositions) that use a capability, via its providing modules. */
export function productsForCapability(id: string): string[] {
  const c = capabilityById(id);
  if (!c) return [];
  const mods = new Set(c.providedByModules);
  return PRODUCT_COMPOSITIONS.filter((p) =>
    p.requiredModules.some((k) => mods.has(k)),
  ).map((p) => p.productKey);
}

/** Applications that use a capability, via their reusableModules. */
export function applicationsForCapability(id: string): string[] {
  const c = capabilityById(id);
  if (!c) return [];
  const mods = new Set(c.providedByModules);
  return APPLICATIONS.filter((a) => a.reusableModules.some((k) => mods.has(k))).map(
    (a) => a.key,
  );
}

// ==========================================================================
// Governance reconciliation — prevents new parallel registries + silent gaps
// ==========================================================================

export interface CapabilityReconciliation {
  ok: boolean;
  /** MODULE_REGISTRY modules not mapped to any canonical capability. */
  unmappedModules: string[];
  /** catalog business_capability assets not mapped to any canonical capability. */
  unmappedBusinessCapabilities: string[];
  /** Source systems referenced by capabilities that are NOT in the allow-list. */
  unknownSources: string[];
}

/**
 * Prove the canonical library covers the legacy registries and introduces no
 * unknown source. A new parallel registry cannot pass unless it is added to
 * KNOWN_CAPABILITY_SOURCES *and* its rows are mapped — a conscious, reviewed act.
 */
export function reconcileCapabilities(): CapabilityReconciliation {
  const unmappedModules = MODULE_REGISTRY.filter(
    (m) => capabilityForModule(m.key) === undefined,
  ).map((m) => m.key);

  const bizCaps = CATALOG.assets.filter((a) => a.kind === "business_capability");
  const unmappedBusinessCapabilities = bizCaps
    .filter((a) => {
      const key = a.id.replace(/^cap\./, "");
      return (
        capabilityByAlias(key) === undefined &&
        !CAPABILITIES.some((c) => c.duplicatesConsolidated.includes(a.id))
      );
    })
    .map((a) => a.id);

  const allowed = new Set<string>(KNOWN_CAPABILITY_SOURCES);
  const unknownSources = [
    ...new Set(CAPABILITIES.flatMap((c) => c.sourceSystems)),
  ].filter((s) => !allowed.has(s));

  return {
    ok:
      unmappedModules.length === 0 &&
      unmappedBusinessCapabilities.length === 0 &&
      unknownSources.length === 0,
    unmappedModules,
    unmappedBusinessCapabilities,
    unknownSources,
  };
}

/** Inventory counts by implementation status (for the completion report + portal). */
export function capabilityInventory() {
  const by = (m: CapMaturity) => CAPABILITIES.filter((c) => c.maturity === m).length;
  return {
    total: CAPABILITIES.length,
    implemented: by("implemented"),
    partial: by("partial"),
    planned: by("planned"),
    deprecated: by("deprecated"),
    reusable: CAPABILITIES.filter((c) => c.reusability === "reusable").length,
    consolidatedLegacyKeys: CAPABILITIES.reduce(
      (n, c) => n + c.duplicatesConsolidated.length,
      0,
    ),
  };
}

/** A capability counts as reusable-now only if implemented/partial AND flagged reusable. */
export function isReusableNow(c: Capability): boolean {
  return (
    c.reusability === "reusable" &&
    (c.maturity === "implemented" || c.maturity === "partial") &&
    c.providedByModules.some((k) => {
      const m = moduleByKey(k);
      return m ? moduleIsBuilt(m) : false;
    })
  );
}
