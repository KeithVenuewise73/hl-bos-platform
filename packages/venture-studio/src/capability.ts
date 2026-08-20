/**
 * Capability extraction — what does this software actually DO?
 *
 * The Top-100 pages lead with a repository name. `googlemaps/js-route-
 * optimization-app` is excellent provenance and poor intelligence: it asks the
 * reader to already know the project. This file turns metadata HLVS already
 * holds into a capability the CEO can read first, with the repository still
 * underneath it and still traceable.
 *
 * ---------------------------------------------------------------------------
 * THE VOCABULARY IS BORROWED ON PURPOSE
 * ---------------------------------------------------------------------------
 * `@hl-bos/catalog` already defines HLG's own capability model — CapabilityType
 * and thirteen CapabilityDomain values. This engine uses those exact strings
 * for third-party software rather than inventing a parallel taxonomy, because
 * the bridge we are building
 *
 *     MARKET NEED <-> CAPABILITY <-> EXISTING TECHNOLOGY <-> HLG MODULE
 *
 * is a join. Two vocabularies means it never matches.
 *
 * ---------------------------------------------------------------------------
 * THE HARD RULES
 * ---------------------------------------------------------------------------
 *   * Every claim names the artifact it was read from and the text that matched.
 *   * A match on the repository NAME is the weakest evidence there is and is
 *     labelled `name`, never quietly presented as a described capability.
 *   * Confidence is always `estimated`. Extraction is a structured inference
 *     over real metadata; it is never a measurement, and the database CHECK
 *     makes `estimated` the only storable status.
 *   * A repository with no evidence for any capability gets NO capability. An
 *     honest blank beats a guess, and "unknown" is a legitimate answer.
 */

import { containsTerm } from "./portfolios";

/** Bump when the vocabulary, the rules or the scoring below change. */
export const CAPABILITY_ENGINE_VERSION = "2026-08-20-v1" as const;

/** Mirrors @hl-bos/catalog CapabilityType. */
export type CapabilityType = "functional" | "technical" | "business";

/** Mirrors @hl-bos/catalog CapabilityDomain, value for value. */
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

export type HlgVertical =
  | "supply_chain_logistics"
  | "business_transformation"
  | "sports"
  | "service_industry"
  | "hld_digital_services"
  | "cross_vertical"
  | "outside_hlg_core";

/** Which artifact a claim was read from, weakest first. */
export type EvidenceKind =
  | "name"
  | "description"
  | "topics"
  | "language"
  | "license"
  | "readme"
  | "manifest"
  | "structure";

/**
 * How much a match is worth, by where it was found.
 *
 * A word in a written description is a deliberate statement about what the
 * software does. The same word in a repository slug may be branding, a person's
 * surname, or coincidence. The gap between 0.9 and 0.35 is that difference, and
 * it is why `name` alone can never reach high confidence.
 */
export const EVIDENCE_WEIGHT: Record<EvidenceKind, number> = {
  description: 0.9,
  readme: 0.9,
  topics: 0.8,
  manifest: 0.6,
  structure: 0.5,
  name: 0.35,
  language: 0.3,
  license: 0.2,
};

export interface CapabilityDef {
  slug: string;
  label: string;
  capType: CapabilityType;
  domain: CapabilityDomain;
  description: string;
  hlgVertical: HlgVertical;
  /** Unambiguous evidence. One of these alone can carry a claim. */
  strongTerms: readonly string[];
  /** Corroborating only. Never enough on its own — see extractCapabilities. */
  weakTerms: readonly string[];
}

/**
 * The capability vocabulary.
 *
 * Deliberately broad rather than HLG-only: discovery stays wide and relevance
 * is a later classification, so a capability outside HLG's core markets is
 * recorded with `outside_hlg_core` rather than dropped.
 *
 * Terms are matched on word boundaries by containsTerm, the same matcher the
 * portfolio engine uses — so "ical" cannot match inside "automatically".
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  {
    slug: "route-optimization",
    label: "Route Optimization",
    capType: "functional",
    domain: "transportation",
    description:
      "Plans and sequences multi-stop journeys under constraints such as vehicle capacity, time windows and driver availability.",
    hlgVertical: "supply_chain_logistics",
    strongTerms: [
      "route optimization",
      "route optimisation",
      "vehicle routing",
      "route planning",
      "vrp",
      "travelling salesman",
      "traveling salesman",
      "last mile",
      "last-mile",
      "route sequencing",
      "dispatch optimization",
    ],
    weakTerms: ["routing", "dispatch", "delivery", "fleet", "logistics", "eta"],
  },
  {
    slug: "fleet-management",
    label: "Fleet Management",
    capType: "functional",
    domain: "transportation",
    description:
      "Tracks vehicles, drivers and assets, including telematics, utilisation and maintenance.",
    hlgVertical: "supply_chain_logistics",
    strongTerms: [
      "fleet management",
      "fleet tracking",
      "telematics",
      "vehicle tracking",
      "driver tracking",
      "gps tracking",
      "asset tracking",
    ],
    weakTerms: ["fleet", "vehicle", "driver", "gps", "tracking"],
  },
  {
    slug: "inventory-warehouse",
    label: "Inventory & Warehouse Management",
    capType: "functional",
    domain: "operations",
    description:
      "Tracks stock levels, locations and movement through storage and fulfilment.",
    hlgVertical: "supply_chain_logistics",
    strongTerms: [
      "inventory management",
      "warehouse management",
      "stock management",
      "wms",
      "stock control",
      "order fulfilment",
      "order fulfillment",
      "barcode scanning",
    ],
    weakTerms: ["inventory", "warehouse", "stock", "fulfilment", "fulfillment", "sku"],
  },
  {
    slug: "scheduling-dispatch",
    label: "Scheduling & Dispatch",
    capType: "functional",
    domain: "operations",
    description:
      "Assigns work, people or appointments to time slots and dispatches them to the field.",
    hlgVertical: "service_industry",
    strongTerms: [
      "scheduling",
      "appointment booking",
      "shift scheduling",
      "work order",
      "field service",
      "dispatching",
      "resource scheduling",
      "calendar booking",
      "rostering",
    ],
    weakTerms: ["schedule", "calendar", "booking", "appointment", "roster", "shift"],
  },
  {
    slug: "crm-customer",
    label: "Customer Relationship Management",
    capType: "business",
    domain: "commerce",
    description:
      "Holds customer records, interactions and pipeline through the sales and service lifecycle.",
    hlgVertical: "business_transformation",
    strongTerms: [
      "crm",
      "customer relationship management",
      "sales pipeline",
      "lead management",
      "contact management",
      "deal tracking",
    ],
    weakTerms: ["customer", "lead", "pipeline", "sales", "contact"],
  },
  {
    slug: "billing-payments",
    label: "Billing & Payments",
    capType: "business",
    domain: "commerce",
    description:
      "Issues invoices, prices work and moves money, including subscriptions and payment processing.",
    hlgVertical: "business_transformation",
    strongTerms: [
      "invoicing",
      "billing",
      "payment processing",
      "subscription billing",
      "payment gateway",
      "point of sale",
      "checkout",
      "recurring billing",
    ],
    weakTerms: ["invoice", "payment", "payments", "subscription", "pricing", "stripe"],
  },
  {
    slug: "workflow-automation",
    label: "Workflow Automation",
    capType: "functional",
    domain: "automation",
    description:
      "Runs multi-step business processes automatically, connecting triggers to actions across systems.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "workflow automation",
      "business process",
      "workflow engine",
      "process automation",
      "rpa",
      "no-code automation",
      "task automation",
      "orchestration",
    ],
    weakTerms: ["workflow", "automation", "automate", "pipeline", "trigger"],
  },
  {
    slug: "system-integration",
    label: "System Integration",
    capType: "technical",
    domain: "platform",
    description:
      "Connects separate systems so data moves between them without manual re-entry.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "api integration",
      "data integration",
      "etl",
      "ipaas",
      "webhook",
      "connector",
      "middleware",
      "data sync",
      "synchronization",
      "message queue",
    ],
    weakTerms: ["integration", "api", "sync", "connect", "import", "export"],
  },
  {
    slug: "analytics-reporting",
    label: "Analytics & Reporting",
    capType: "functional",
    domain: "analytics",
    description:
      "Turns captured operational data into dashboards, reports and answerable questions.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "business intelligence",
      "data visualization",
      "data visualisation",
      "dashboard",
      "reporting",
      "analytics platform",
      "metrics",
      "olap",
    ],
    weakTerms: ["analytics", "report", "chart", "insights", "kpi"],
  },
  {
    slug: "ai-agents",
    label: "AI Agents & LLM Tooling",
    capType: "technical",
    domain: "ai",
    description:
      "Builds, runs or orchestrates language-model agents, prompts and tool use.",
    hlgVertical: "hld_digital_services",
    strongTerms: [
      "llm",
      "large language model",
      "ai agent",
      "agentic",
      "rag",
      "retrieval augmented",
      "prompt engineering",
      "fine-tuning",
      "vector database",
      "embeddings",
    ],
    weakTerms: ["ai", "gpt", "chatbot", "model", "inference", "openai"],
  },
  {
    slug: "document-processing",
    label: "Document Processing",
    capType: "functional",
    domain: "automation",
    description:
      "Extracts, converts or generates structured information from documents.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "ocr",
      "document parsing",
      "pdf generation",
      "document extraction",
      "text extraction",
      "document management",
      "e-signature",
      "esignature",
    ],
    weakTerms: ["document", "pdf", "parse", "extract", "scan"],
  },
  {
    slug: "communications-messaging",
    label: "Communications & Messaging",
    capType: "functional",
    domain: "communications",
    description:
      "Sends or routes messages between a business and its people or customers.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "email marketing",
      "sms gateway",
      "push notification",
      "chat application",
      "video conferencing",
      "notification service",
      "messaging platform",
      "voip",
    ],
    weakTerms: ["email", "sms", "chat", "messaging", "notification"],
  },
  {
    slug: "sports-team-management",
    label: "Sports & Team Management",
    capType: "functional",
    domain: "operations",
    description:
      "Runs teams, leagues, fixtures, rosters and player or athlete performance.",
    hlgVertical: "sports",
    strongTerms: [
      "league management",
      "team management",
      "sports analytics",
      "player development",
      "tournament bracket",
      "fixture",
      "roster management",
      "athlete tracking",
      "youth sports",
    ],
    weakTerms: ["sports", "team", "league", "player", "athlete", "tournament"],
  },
  {
    slug: "identity-access",
    label: "Identity & Access Management",
    capType: "technical",
    domain: "identity",
    description: "Authenticates people and decides what each of them is allowed to do.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "authentication",
      "authorization",
      "single sign-on",
      "sso",
      "oauth",
      "identity provider",
      "access control",
      "rbac",
      "multi-tenant",
    ],
    weakTerms: ["auth", "login", "identity", "permission", "session"],
  },
  {
    slug: "search-discovery",
    label: "Search & Discovery",
    capType: "technical",
    domain: "discovery",
    description: "Indexes content and retrieves it by relevance.",
    hlgVertical: "cross_vertical",
    strongTerms: [
      "full-text search",
      "search engine",
      "elasticsearch",
      "semantic search",
      "faceted search",
      "web scraping",
      "crawler",
      "indexing",
    ],
    weakTerms: ["search", "scraper", "crawl", "index", "query"],
  },
  {
    slug: "monitoring-observability",
    label: "Monitoring & Observability",
    capType: "technical",
    domain: "platform",
    description: "Watches running systems and reports when something is wrong.",
    hlgVertical: "hld_digital_services",
    strongTerms: [
      "monitoring",
      "observability",
      "uptime monitoring",
      "log aggregation",
      "alerting",
      "tracing",
      "apm",
      "incident management",
    ],
    weakTerms: ["monitor", "alert", "logs", "metrics", "uptime"],
  },
  {
    slug: "content-management",
    label: "Content Management",
    capType: "functional",
    domain: "marketing",
    description: "Authors, stores and publishes web or product content.",
    hlgVertical: "hld_digital_services",
    strongTerms: [
      "content management",
      "cms",
      "headless cms",
      "static site generator",
      "page builder",
      "website builder",
      "blogging platform",
    ],
    weakTerms: ["cms", "content", "blog", "website", "publish"],
  },
  {
    slug: "project-collaboration",
    label: "Project & Collaboration Management",
    capType: "functional",
    domain: "operations",
    description: "Coordinates work, tasks and documents across a group of people.",
    hlgVertical: "business_transformation",
    strongTerms: [
      "project management",
      "task management",
      "issue tracking",
      "kanban",
      "team collaboration",
      "knowledge base",
      "wiki",
    ],
    weakTerms: ["project", "task", "kanban", "collaboration", "notes"],
  },
];

export interface CapabilityInput {
  title: string;
  summary?: string | null;
  topics?: readonly string[] | null;
  language?: string | null;
  license?: string | null;
  repositoryUrl?: string | null;
}

export interface CapabilityClaim {
  slug: string;
  label: string;
  isPrimary: boolean;
  evidenceKind: EvidenceKind;
  evidenceExcerpt: string;
  evidenceLocator: string;
  confidence: number;
}

/** Normalise to one lowercase haystack, separators flattened to spaces. */
function haystackOf(text: string): string {
  return text.toLowerCase().replace(/[_/\\.-]+/g, " ");
}

/** The repository slug only — `owner/name` minus the host. */
function nameHaystack(input: CapabilityInput): string {
  const url = input.repositoryUrl ?? "";
  const path = url.replace(/^https?:\/\/github\.com\//i, "");
  return haystackOf(path || input.title);
}

/**
 * At most this many capabilities per repository.
 *
 * Software that appears to do fifteen things usually does one thing and
 * mentions fourteen. Keeping the strongest few is the difference between a
 * capability list and a keyword cloud.
 */
export const MAX_CAPABILITIES_PER_OPPORTUNITY = 4;

/** Below this, the evidence is too thin to make the claim at all. */
export const MIN_CAPABILITY_CONFIDENCE = 30;

/**
 * Extract capabilities from metadata HLVS already holds. No network, no model.
 *
 * A STRONG term is an unambiguous statement — "route optimization" means what
 * it says. A WEAK term is corroboration only: "routing" alone could be network
 * routing, React routing or a courier. So weak terms never carry a claim by
 * themselves; they raise the confidence of a claim a strong term already made.
 * That single rule is what stops every web framework in the corpus being
 * labelled a logistics product.
 */
export function extractCapabilities(input: CapabilityInput): CapabilityClaim[] {
  // `summary` ONLY. In this corpus `title` is literally "owner/repo", so
  // folding it in here would let a repository-name match score as though it
  // were a written description — inflating precisely what the evidence
  // weighting exists to suppress. The name is scored separately, as `name`.
  const description = haystackOf(input.summary ?? "");
  const topics = haystackOf((input.topics ?? []).join(" "));
  const name = nameHaystack(input);

  const claims: CapabilityClaim[] = [];

  for (const def of CAPABILITIES) {
    // Find the strongest artifact that carries a strong term.
    let best: { kind: EvidenceKind; term: string } | null = null;
    for (const [kind, hay] of [
      ["description", description],
      ["topics", topics],
      ["name", name],
    ] as const) {
      for (const term of def.strongTerms) {
        if (containsTerm(hay, term)) {
          const better =
            best === null || EVIDENCE_WEIGHT[kind] > EVIDENCE_WEIGHT[best.kind];
          if (better) best = { kind, term };
          break;
        }
      }
    }
    if (!best) continue;

    // Corroboration raises confidence but can never create a claim.
    const weakHits = def.weakTerms.filter(
      (t) => containsTerm(description, t) || containsTerm(topics, t),
    ).length;
    const corroboration = Math.min(1, weakHits / 3);

    const raw = EVIDENCE_WEIGHT[best.kind] * (0.7 + 0.3 * corroboration);
    const confidence = Math.round(Math.max(0, Math.min(1, raw)) * 100);
    if (confidence < MIN_CAPABILITY_CONFIDENCE) continue;

    claims.push({
      slug: def.slug,
      label: def.label,
      isPrimary: false,
      evidenceKind: best.kind,
      evidenceExcerpt: best.term,
      evidenceLocator:
        best.kind === "description"
          ? "repository description"
          : best.kind === "topics"
            ? "repository topics"
            : "repository name",
      confidence,
    });
  }

  claims.sort((a, b) => b.confidence - a.confidence || a.slug.localeCompare(b.slug));
  const kept = claims.slice(0, MAX_CAPABILITIES_PER_OPPORTUNITY);
  if (kept.length > 0) kept[0]!.isPrimary = true;
  return kept;
}

// ---------------------------------------------------------------------------
// Reusable assets
// ---------------------------------------------------------------------------

export type AssetKind =
  | "algorithm"
  | "api_integration"
  | "backend_service"
  | "ui_component"
  | "data_model"
  | "reference_architecture"
  | "sdk_client"
  | "pipeline"
  | "ruleset"
  | "dataset"
  | "protocol_implementation";

export interface AssetRule {
  kind: AssetKind;
  label: string;
  terms: readonly string[];
}

/**
 * What could actually be lifted out of a project, as opposed to what it does.
 *
 * Distinct from packages/venture-studio/src/reuse.ts, which answers the
 * opposite question — which HLG modules we already own that would serve a need.
 */
export const ASSET_RULES: readonly AssetRule[] = [
  {
    kind: "algorithm",
    label: "Optimization Engine",
    terms: [
      "optimization",
      "optimisation",
      "solver",
      "heuristic",
      "genetic algorithm",
      "constraint programming",
    ],
  },
  {
    kind: "algorithm",
    label: "Scheduling Algorithm",
    terms: ["scheduling algorithm", "bin packing", "job shop"],
  },
  {
    kind: "api_integration",
    label: "Third-party API Integration",
    terms: ["api client", "sdk", "api wrapper", "rest client", "graphql client"],
  },
  {
    kind: "api_integration",
    label: "Maps Integration",
    terms: ["google maps", "mapbox", "openstreetmap", "leaflet", "geocoding"],
  },
  {
    kind: "api_integration",
    label: "Payment Integration",
    terms: ["stripe", "paypal", "adyen", "payment gateway"],
  },
  {
    kind: "backend_service",
    label: "Backend Service",
    terms: ["microservice", "rest api", "graphql api", "grpc", "backend"],
  },
  {
    kind: "ui_component",
    label: "UI Component Library",
    terms: [
      "component library",
      "design system",
      "ui kit",
      "react components",
      "widgets",
    ],
  },
  {
    kind: "ui_component",
    label: "Reference UI",
    terms: ["dashboard ui", "admin panel", "web ui", "frontend"],
  },
  {
    kind: "data_model",
    label: "Domain Data Model",
    terms: ["data model", "schema", "entity model", "database schema", "migrations"],
  },
  {
    kind: "reference_architecture",
    label: "Reference Architecture",
    terms: [
      "reference implementation",
      "boilerplate",
      "starter kit",
      "template",
      "scaffold",
      "example app",
    ],
  },
  {
    kind: "sdk_client",
    label: "Client SDK",
    terms: ["client library", "python sdk", "javascript sdk", "typescript sdk"],
  },
  {
    kind: "pipeline",
    label: "Data Pipeline",
    terms: ["data pipeline", "etl", "stream processing", "batch processing", "airflow"],
  },
  {
    kind: "ruleset",
    label: "Rules / Policy Set",
    terms: ["ruleset", "policy engine", "validation rules", "detection rules"],
  },
  {
    kind: "dataset",
    label: "Dataset",
    terms: ["dataset", "corpus", "training data", "benchmark"],
  },
  {
    kind: "protocol_implementation",
    label: "Protocol Implementation",
    terms: [
      "protocol implementation",
      "mqtt",
      "modbus",
      "ethercat",
      "opc ua",
      "webrtc",
    ],
  },
];

/**
 * Licences that permit commercial reuse without copyleft obligations.
 * NULL — not false — when the licence is unknown or unrecognised: "we do not
 * know" and "we know it is not permitted" are different answers and only one
 * of them should stop a conversation.
 */
export function licencePermitsCommercial(
  licence: string | null | undefined,
): boolean | null {
  if (!licence || licence === "NOASSERTION") return null;
  const permissive = [
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "0BSD",
    "Unlicense",
    "MPL-2.0",
    "Zlib",
    "BSL-1.0",
    "PostgreSQL",
    "Artistic-2.0",
    "CC0-1.0",
  ];
  const copyleft = [
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
    "EUPL-1.2",
    "OSL-3.0",
  ];
  if (permissive.includes(licence)) return true;
  if (copyleft.includes(licence)) return false;
  return null;
}

export interface AssetClaim {
  kind: AssetKind;
  label: string;
  evidenceKind: EvidenceKind;
  evidenceExcerpt: string;
  licence: string | null;
  licencePermitsCommercial: boolean | null;
  confidence: number;
}

export const MAX_ASSETS_PER_OPPORTUNITY = 5;

export function extractReusableAssets(input: CapabilityInput): AssetClaim[] {
  // summary only, for the same reason as extractCapabilities.
  const description = haystackOf(input.summary ?? "");
  const topics = haystackOf((input.topics ?? []).join(" "));
  const licence = input.license ?? null;

  const out = new Map<string, AssetClaim>();
  for (const rule of ASSET_RULES) {
    for (const [kind, hay] of [
      ["description", description],
      ["topics", topics],
    ] as const) {
      const hit = rule.terms.find((t) => containsTerm(hay, t));
      if (!hit) continue;
      const confidence = Math.round(EVIDENCE_WEIGHT[kind] * 100);
      const key = `${rule.kind}|${rule.label}`;
      const prev = out.get(key);
      if (!prev || confidence > prev.confidence) {
        out.set(key, {
          kind: rule.kind,
          label: rule.label,
          evidenceKind: kind,
          evidenceExcerpt: hit,
          licence,
          licencePermitsCommercial: licencePermitsCommercial(licence),
          confidence,
        });
      }
      break;
    }
  }
  return [...out.values()]
    .sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label))
    .slice(0, MAX_ASSETS_PER_OPPORTUNITY);
}
