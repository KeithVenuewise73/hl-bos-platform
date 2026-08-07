/**
 * THE ENTERPRISE CATALOG REGISTRY — the single source of truth.
 *
 * Every entry here is a real Herman Legacy software asset, verified during the
 * Project Atlas Phase I assessment and cross-checked against the live HL-BOS
 * Core database (2026-07-29). Nothing aspirational is marked `live`; dormant
 * objects are marked `dormant`.
 *
 * Governance: when a repository scan discovers an asset that is not registered
 * here, the catalog reports the gap. New development registers its assets here
 * FIRST — this file, version-controlled and reviewed, is the authority.
 *
 * Evidence base: docs/architecture-audit/hlvs-phase-1-atlas/ and the live
 * catalog census. Legacy assets live in an unreachable project and are marked
 * `legacy` / out of scope.
 */

import type { Asset, Catalog } from "./types";

const ASSETS: Asset[] = [
  // ======================================================================
  // PRODUCTS
  // ======================================================================
  {
    id: "prod.hl-bos",
    kind: "product",
    name: "HL-BOS",
    summary:
      "The Herman Legacy Business Operating System — the shared, multi-tenant platform every product is assembled from. 27 migrations, 124 tables, 17 schemas, 100% RLS.",
    maturity: "live",
    reuse: ["reusable", "internal_only"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    location: "this repository",
    tags: ["platform", "foundation", "multi-tenant"],
    metrics: { schemas: 17, tables: 124, migrations: 27 },
    relationships: [
      { kind: "provides", to: "svc.identity" },
      { kind: "provides", to: "svc.ai-gateway" },
      { kind: "provides", to: "svc.billing" },
      { kind: "provides", to: "svc.discovery" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "live census 2026-07-29; docs/architecture-audit/hlvs-phase-1-atlas/04",
  },
  {
    id: "prod.hl-bti",
    kind: "product",
    name: "HL-BTI (Business Transformation Intelligence)",
    summary:
      "The first product produced by the HLVS Factory. Assess → blueprint → proposal → implement → ROI, assembled on HL-BOS. Reuses the shared spine wholesale.",
    maturity: "live",
    reuse: ["commercial", "reusable"],
    owner: "HSCS Consulting",
    layer: "HL-BTI",
    location: "apps/hl-bti, bti schema",
    tags: ["consulting", "assessment", "executive"],
    metrics: { tables: 14, tests: "47 db + 11 edge" },
    relationships: [
      { kind: "uses", to: "svc.identity" },
      { kind: "uses", to: "svc.ai-gateway" },
      { kind: "uses", to: "svc.discovery" },
      { kind: "uses", to: "svc.commerce-provisioning" },
      { kind: "uses", to: "svc.billing" },
      { kind: "uses", to: "svc.comms" },
      { kind: "uses", to: "pkg.bti-engine" },
      { kind: "extends", to: "mod.discovery-engine" },
      { kind: "owned_by", to: "prod.hl-bos" },
      { kind: "provides", to: "api.bti-public" },
    ],
    evidence: "apps/hl-bti; migrations 0026-0027; registry.ts",
  },
  {
    id: "prod.visibility-ai",
    kind: "product",
    name: "VisibilityAI",
    summary:
      "Prospect capture → 16-category assessment → Business Growth Score → recommendations. A partial prototype: database and workflow exist; no customer UI or scanning yet.",
    maturity: "prototype",
    reuse: ["commercial", "requires_testing"],
    owner: "Herman Legacy Digital",
    layer: "HL-BOS",
    location: "visibility schema",
    tags: ["assessment", "prospect", "growth-score"],
    metrics: { tables: 8 },
    relationships: [
      { kind: "uses", to: "svc.identity" },
      { kind: "uses", to: "svc.ai-gateway" },
      { kind: "uses", to: "mod.visibility-assessments" },
      { kind: "owned_by", to: "prod.hl-bos" },
    ],
    evidence: "migrations 0014/0017; hlvs-phase-1-atlas/03",
  },
  {
    id: "prod.hlvs-venture-studio",
    kind: "product",
    name: "HLVS Venture Studio (legacy)",
    summary:
      "Live legacy product in the unreachable legacy project (hlvs schema, 59 tables). Preserved, out of scope; its correct patterns were generalized into HL-BOS.",
    maturity: "legacy",
    reuse: ["internal_only", "requires_refactor"],
    owner: "Herman Legacy (legacy)",
    layer: "Legacy",
    location: "legacy project (unreachable)",
    tags: ["legacy", "out-of-scope"],
    relationships: [{ kind: "owned_by", to: "repo.legacy-herman-platform" }],
    evidence: "docs/architecture/current-state-audit.md",
  },
  {
    id: "prod.hscs-government-logistics",
    kind: "product",
    name: "HSCS Government Logistics (legacy)",
    summary:
      "Live legacy product (hscs_glp schema, 74 tables). Its multi-org authorization model was the strongest legacy asset and became the basis for HL-BOS identity.",
    maturity: "legacy",
    reuse: ["internal_only"],
    owner: "Herman Supply Chain Solutions (legacy)",
    layer: "Legacy",
    location: "legacy project (unreachable)",
    tags: ["legacy", "government", "out-of-scope"],
    relationships: [
      { kind: "owned_by", to: "repo.legacy-herman-platform" },
      {
        kind: "replaced_by",
        to: "svc.identity",
        note: "authorization model generalized into identity",
      },
    ],
    evidence: "docs/architecture/current-state-audit.md",
  },
  {
    id: "prod.ai-asset-recovery",
    kind: "product",
    name: "AI Asset Recovery (legacy)",
    summary:
      "Live legacy product with an open cross-tenant security finding (SEC-2). Out of scope and unreachable; the rebuild fixed the class of defect by construction.",
    maturity: "legacy",
    reuse: ["deprecated"],
    owner: "Herman Legacy (legacy)",
    layer: "Legacy",
    location: "legacy project (unreachable)",
    tags: ["legacy", "security-finding", "out-of-scope"],
    relationships: [{ kind: "owned_by", to: "repo.legacy-herman-platform" }],
    evidence: "docs/architecture/current-state-audit.md SEC-2",
  },
  {
    id: "prod.salon-ai",
    kind: "product",
    name: "SalonAI",
    summary:
      "Planned first HL-BOS vertical. No code yet — to be assembled from existing modules via the Factory, not hand-built.",
    maturity: "planned",
    reuse: ["commercial"],
    owner: "Herman Legacy Software Ventures",
    layer: "HL-BOS",
    tags: ["planned", "vertical"],
    relationships: [
      { kind: "uses", to: "ind.salon" },
      { kind: "owned_by", to: "prod.hl-bos" },
    ],
    evidence: "apps/control-center registry.ts (not-started)",
  },

  // ======================================================================
  // APPLICATIONS
  // ======================================================================
  {
    id: "app.control-center",
    kind: "application",
    name: "CEO Development Control Center",
    summary:
      "The permanent, localhost-only executive console: build/test/merge/approve without a terminal, plain-English failure translation, honest portfolio — and now the Enterprise Catalog.",
    maturity: "live",
    reuse: ["internal_only", "reusable"],
    owner: "CEO / Product Owner",
    layer: "Tooling",
    key: "control-center",
    location: "apps/control-center",
    tags: ["executive", "console", "local-only"],
    relationships: [
      { kind: "consumes", to: "pkg.catalog" },
      { kind: "provides", to: "wf.catalog-governance" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "apps/control-center",
  },
  {
    id: "app.hl-bti",
    kind: "application",
    name: "HL-BTI App",
    summary:
      "Authenticated, cloud-persistent BTI front end. Thin RLS-trusting client over the public bti_* RPCs — the reference shape for future product UIs.",
    maturity: "built_undeployed",
    reuse: ["commercial", "reusable"],
    owner: "HSCS Consulting",
    layer: "HL-BTI",
    key: "hl-bti",
    location: "apps/hl-bti",
    tags: ["spa", "authenticated", "deployable"],
    relationships: [
      { kind: "uses", to: "api.bti-public" },
      { kind: "uses", to: "pkg.bti-engine" },
      { kind: "uses", to: "svc.identity" },
      { kind: "provides", to: "prod.hl-bti" },
    ],
    evidence: "apps/hl-bti",
  },
  {
    id: "app.hl-bti-alpha",
    kind: "application",
    name: "HL-BTI Alpha (demo)",
    summary:
      "Offline, browser-storage demo of the same engine (EO-001 demonstration). Maps 1:1 to future bti.* RPCs; shares @hl-bos/bti-engine so the math can't drift.",
    maturity: "built_undeployed",
    reuse: ["internal_only"],
    owner: "HSCS Consulting",
    layer: "HL-BTI",
    key: "hl-bti-alpha",
    location: "apps/hl-bti-alpha",
    tags: ["demo", "offline"],
    relationships: [
      { kind: "uses", to: "pkg.bti-engine" },
      { kind: "provides", to: "prod.hl-bti" },
    ],
    evidence: "apps/hl-bti-alpha",
  },
  {
    id: "app.executive-portal",
    kind: "application",
    name: "Herman Legacy Executive Portal",
    summary:
      "Secure, read-only, cloud-deployable executive view over the Enterprise Catalog and Software Factory. Reuses @hl-bos/catalog; contains no shell/git/pnpm/filesystem command surface. Authenticated via HL-BOS identity; separate from the localhost-only Control Center.",
    maturity: "built_undeployed",
    reuse: ["internal_only", "reusable"],
    owner: "Herman Legacy Platform",
    layer: "Tooling",
    key: "executive-portal",
    location: "apps/executive-portal",
    tags: ["executive", "read-only", "authenticated", "cloud"],
    relationships: [
      { kind: "consumes", to: "pkg.catalog" },
      { kind: "uses", to: "svc.identity" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "apps/executive-portal (Phase VII)",
  },
  {
    id: "app.herman-legacy-digital",
    kind: "application",
    name: "Herman Legacy Digital",
    summary:
      "The customer-facing AI-powered Business Transformation company (hermanlegacydigital.com): a public marketing + assessment-intake site and an authenticated client portal, assembled on HL-BOS. Reuses @hl-bos/catalog, @hl-bos/transformation-intelligence and HL-BOS identity; introduces no duplicate identity/CRM/workflow/portal systems. Release 1 built, not deployed.",
    maturity: "built_undeployed",
    reuse: ["commercial", "reusable"],
    owner: "Herman Legacy Digital",
    layer: "HL-BTI",
    key: "herman-legacy-digital",
    location: "apps/herman-legacy-digital",
    tags: ["customer-facing", "website", "portal", "cloud"],
    relationships: [
      { kind: "consumes", to: "pkg.catalog" },
      { kind: "uses", to: "pkg.transformation-intelligence" },
      { kind: "uses", to: "svc.identity" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "apps/herman-legacy-digital (Phase 6, Release 1); built, not deployed",
  },
  {
    id: "app.venture-studio",
    kind: "application",
    name: "Herman Legacy Venture Studio (HLVS V2)",
    summary:
      "Internal executive opportunity-intelligence app (HLVS V2), assembled on HL-BOS. Reuses @hl-bos/catalog, @hl-bos/venture-studio and HL-BOS identity; reads the hlvs Factory for readiness preview only. V2-1 foundation built; vstudio migration unapplied pending CEO approval; not deployed.",
    maturity: "built_undeployed",
    reuse: ["commercial", "reusable"],
    owner: "Herman Legacy Venture Studio",
    layer: "HL-BTI",
    key: "venture-studio",
    location: "apps/venture-studio",
    tags: ["executive", "intelligence", "internal", "opportunity"],
    relationships: [
      { kind: "consumes", to: "pkg.catalog" },
      { kind: "uses", to: "pkg.venture-studio" },
      { kind: "uses", to: "svc.identity" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "apps/venture-studio (HLVS V2, V2-1); not deployed",
  },
  {
    id: "pkg.venture-studio",
    kind: "package",
    name: "@hl-bos/venture-studio",
    summary:
      "Pure, tested domain logic for HLVS V2: opportunity statuses, evaluation dimensions, deterministic reuse scoring over @hl-bos/catalog, advisory-recommendation vs authoritative-decision separation, and read-only Factory readiness. No I/O.",
    maturity: "live",
    reuse: ["reusable"],
    owner: "Herman Legacy Venture Studio",
    layer: "HL-BTI",
    key: "venture-studio",
    location: "packages/venture-studio",
    tags: ["package", "domain-logic", "reuse-scoring"],
    relationships: [
      { kind: "consumes", to: "pkg.catalog" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "packages/venture-studio (HLVS V2, V2-1); tested",
  },

  // ======================================================================
  // SHARED PACKAGES
  // ======================================================================
  {
    id: "pkg.config",
    kind: "package",
    name: "@hl-bos/config",
    summary:
      "The only sanctioned reader of process.env — Zod-validated, classified, ESLint-enforced. A leaked secret fails the boot rather than reaching a browser.",
    maturity: "live",
    reuse: ["reusable"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    key: "config",
    location: "packages/config",
    tags: ["config", "secrets", "utility"],
    relationships: [{ kind: "owned_by", to: "repo.hl-bos-platform" }],
    evidence: "packages/config",
  },
  {
    id: "pkg.bti-engine",
    kind: "package",
    name: "@hl-bos/bti-engine",
    summary:
      "Canonical deterministic scoring/lifecycle/growth/blueprint engine for HL-BTI, mirrored by the DB authority and edge layer — one algorithm, same numbers everywhere.",
    maturity: "live",
    reuse: ["reusable", "commercial"],
    owner: "HSCS Consulting",
    layer: "HL-BTI",
    key: "bti-engine",
    location: "packages/bti-engine",
    tags: ["engine", "scoring", "deterministic"],
    relationships: [
      { kind: "provides", to: "ai.deterministic-scoring" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "packages/bti-engine",
  },
  {
    id: "pkg.transformation-intelligence",
    kind: "package",
    name: "@hl-bos/transformation-intelligence",
    summary:
      "HL-BTI v2 — the reusable Business Transformation Intelligence engine. A composition layer over @hl-bos/bti-engine (scoring/consulting) and @hl-bos/catalog (Software Factory): configurable scoring, evidence-gated impact/ROI, factory reuse %, CEO-approval gating, HLVS software-opportunity and government-contracts intelligence. No hardcoded industries; nothing fabricated.",
    maturity: "built_undeployed",
    reuse: ["reusable", "commercial"],
    owner: "HSCS Consulting",
    layer: "HL-BTI",
    key: "transformation-intelligence",
    location: "packages/transformation-intelligence",
    tags: ["engine", "intelligence", "recommendations", "deterministic", "reuse"],
    relationships: [
      { kind: "uses", to: "pkg.bti-engine" },
      { kind: "uses", to: "pkg.catalog" },
      { kind: "provides", to: "ai.recommendation-engine" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "packages/transformation-intelligence (Phase VIII)",
  },
  {
    id: "pkg.bte-pipeline",
    kind: "package",
    name: "@hl-bos/bte-pipeline",
    summary:
      "The Business Transformation Engine automated intake pipeline core: deterministic, DB-agnostic orchestration (12-state processing machine, evidence-status + finding-confidence model, 11-section draft report reusing @hl-bos/bti-engine, never-overwrite-approved versioning). Persistence, notification and delivery bind through injected adapters; no I/O and nothing sent on its own.",
    maturity: "built_undeployed",
    reuse: ["reusable", "commercial"],
    owner: "Herman Legacy Digital",
    layer: "HL-BTI",
    key: "bte-pipeline",
    location: "packages/bte-pipeline",
    tags: ["package", "pipeline", "domain-logic", "deterministic"],
    relationships: [
      { kind: "uses", to: "pkg.bti-engine" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence: "packages/bte-pipeline; 35 tests; docs/products/hld-bte-intake",
  },
  {
    id: "pkg.bti-cycle",
    kind: "package",
    name: "@hl-bos/bti-cycle",
    summary:
      "BTI V1 — one transformation cycle, Customer Goal → Measurement Contract, implementing the approved BTI constitution (Reasoning Ledger, Confidence State Machine, Evidence Appetite, Recommendation Stability, Measurement Contract). Deterministic and DB-agnostic: it caps its own confidence, refuses to score what it cannot size, prioritises the evidence most likely to prove it wrong, and emits one of four permitted outputs. Reasoning spine only — no persistence, execution or UI.",
    maturity: "built_undeployed",
    reuse: ["reusable", "commercial"],
    owner: "Herman Legacy Digital",
    layer: "HL-BTI",
    key: "bti-cycle",
    location: "packages/bti-cycle",
    tags: ["package", "reasoning", "methodology", "deterministic", "truth-mode"],
    relationships: [{ kind: "owned_by", to: "repo.hl-bos-platform" }],
    evidence:
      "packages/bti-cycle; 23 tests incl. the real Saffer proof (src/saffer.test.ts)",
  },
  {
    id: "pkg.bti-venuewise",
    kind: "package",
    name: "@hl-bos/bti-venuewise",
    summary:
      "Venuewise startup-analysis pipeline — runs Venuewise through the BTI reasoning contract adapted to a startup value chain (Problem → … → Margin). Reuses @hl-bos/bti-cycle's confidence machine, evidence model and four permitted outputs; adds source-labeled Venuewise evidence, a Reasoning Ledger, a Measurement Contract, and a decision-ready Business Transformation Report. Deterministic; invents no data; separates a functioning product from a functioning business.",
    maturity: "built_undeployed",
    reuse: ["reusable", "commercial"],
    owner: "Herman Legacy Digital",
    layer: "HL-BTI",
    key: "bti-venuewise",
    location: "packages/bti-venuewise",
    tags: ["package", "reasoning", "startup", "deterministic", "truth-mode"],
    relationships: [
      { kind: "uses", to: "pkg.bti-cycle" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence:
      "packages/bti-venuewise; 15 tests; report from docs/products/venuewise-*harvest",
  },
  {
    id: "pkg.hld-transformation-pipeline",
    kind: "package",
    name: "@hl-bos/hld-transformation-pipeline",
    summary:
      "Herman Legacy Digital Business Transformation Pipeline — the eleven-stage workflow around BTI (Business Discovery → Continuous Transformation). Reuses @hl-bos/bti-venuewise (Client #1) and @hl-bos/bti-cycle; turns every BTI recommendation into executable implementation tasks mapped to HLD capabilities, sequences a roadmap (full commercialization gated until BTI reruns firm), tracks progress, ties to the Measurement Contract, and closes the loop. Deterministic; plans but never executes; no dashboards, UI, persistence or migrations.",
    maturity: "built_undeployed",
    reuse: ["reusable", "commercial"],
    owner: "Herman Legacy Digital",
    layer: "HL-BTI",
    key: "hld-transformation-pipeline",
    location: "packages/hld-transformation-pipeline",
    tags: ["package", "workflow", "transformation", "deterministic", "truth-mode"],
    relationships: [
      { kind: "uses", to: "pkg.bti-venuewise" },
      { kind: "uses", to: "pkg.bti-cycle" },
      { kind: "owned_by", to: "repo.hl-bos-platform" },
    ],
    evidence:
      "packages/hld-transformation-pipeline; 14 tests; runs Venuewise (Client #1) through 11 stages",
  },
  {
    id: "pkg.catalog",
    kind: "package",
    name: "@hl-bos/catalog",
    summary:
      "The Enterprise Catalog engine (this package): curated registry + repository scanner + metrics/search/graph. The single source of truth surfaced by the Control Center.",
    maturity: "live",
    reuse: ["reusable", "internal_only"],
    owner: "Herman Legacy Platform",
    layer: "Tooling",
    key: "catalog",
    location: "packages/catalog",
    tags: ["catalog", "governance", "atlas"],
    relationships: [
      { kind: "owned_by", to: "repo.hl-bos-platform" },
      { kind: "provides", to: "wf.catalog-governance" },
    ],
    evidence: "packages/catalog",
  },

  // ======================================================================
  // SHARED SERVICES
  // ======================================================================
  ...sharedService(
    "identity",
    "Identity & Auth",
    "identity",
    8,
    "live",
    ["reusable"],
    "Profiles, memberships, invitations on Supabase Auth. profiles.id = auth.users.id.",
    ["db.identity", "mod.identity-core"],
  ),
  ...sharedService(
    "tenancy",
    "Multi-Tenancy",
    "platform",
    1,
    "live",
    ["reusable"],
    "One tenant concept (first-party + customer), atomic provisioning, parent/child.",
    ["db.platform"],
  ),
  ...sharedService(
    "permissions",
    "Roles & Permissions",
    "identity",
    8,
    "live",
    ["reusable"],
    "8 roles, 17 permissions, permission-based access (never role names), no-escalation.",
    ["db.identity"],
  ),
  ...sharedService(
    "audit",
    "Audit & Security Events",
    "audit",
    2,
    "live",
    ["reusable"],
    "Append-only, immutable-even-to-admins log; triggers across all sensitive tables.",
    ["db.audit"],
  ),
  ...sharedService(
    "events",
    "Event Bus (outbox)",
    "events",
    4,
    "live",
    ["reusable"],
    "Transactional outbox, at-least-once delivery, handler registry. Exactly one bus.",
    ["db.events", "mod.events-bus"],
  ),
  ...sharedService(
    "entitlements",
    "Entitlements",
    "entitlements",
    4,
    "live",
    ["reusable"],
    "Feature catalog, plan mapping, module activation, has_feature().",
    ["db.entitlements"],
  ),
  ...sharedService(
    "integrations",
    "Integrations Registry",
    "integrations",
    5,
    "live",
    ["reusable", "requires_documentation"],
    "Connector/connection/sync/webhook framework; live connector code still to come.",
    ["db.integrations"],
  ),
  ...sharedService(
    "ai-gateway",
    "AI Gateway",
    "ai",
    7,
    "live",
    ["reusable"],
    "Single metered door to every model: registry, run ledger, budgets, guardrail hook.",
    ["db.ai", "ai.gateway-runtime", "mod.ai-gateway"],
  ),
  ...sharedService(
    "workflows",
    "Workflows / Human Gate",
    "workflows",
    3,
    "live",
    ["reusable"],
    "Reusable human-approval instances/tasks/approvals. The gate before anything risky.",
    ["db.workflows", "wf.human-approval-gate"],
  ),
  ...sharedService(
    "billing",
    "Billing",
    "billing",
    8,
    "live",
    ["reusable", "requires_refactor"],
    "Subscriptions, invoices, payments, entitlement reconciliation. Stripe adapter is stubbed.",
    ["db.billing", "mod.billing-core"],
  ),
  ...sharedService(
    "storage",
    "Storage",
    "storage_meta",
    1,
    "live",
    ["reusable"],
    "File registry, retention classes, signed-URL access boundary, path-safety.",
    ["db.storage_meta", "mod.storage"],
  ),
  ...sharedService(
    "comms",
    "Communications",
    "comms",
    7,
    "live",
    ["reusable"],
    "Email/SMS templates, consent, suppression, send-with-approval.",
    ["db.comms", "mod.comms"],
  ),
  ...sharedService(
    "discovery",
    "Discovery & Assessment",
    "discovery",
    19,
    "live",
    ["reusable", "commercial"],
    "The BI engine: collectors → unified profile → scored assessment → blueprint.",
    ["db.discovery", "mod.discovery-engine", "mod.blueprint-engine"],
  ),
  ...sharedService(
    "commerce-provisioning",
    "Commerce & Provisioning",
    "sales",
    14,
    "live",
    ["reusable"],
    "Proposal → agreement → provisioning request → work order → factory authorization.",
    ["db.sales", "db.provisioning", "mod.commerce-provisioning"],
  ),

  // ======================================================================
  // AI CAPABILITIES
  // ======================================================================
  {
    id: "ai.gateway-runtime",
    kind: "ai_capability",
    name: "AI Gateway Runtime",
    summary:
      "Authenticated model execution: begin run → provider (Anthropic/mock) → cost from pricing → finish run. Real tokens only; keyless and inactive today.",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    tags: ["ai", "gateway", "metered"],
    relationships: [{ kind: "uses", to: "svc.ai-gateway" }],
    evidence: "supabase/functions/ai-gateway",
  },
  {
    id: "ai.injection-fence",
    kind: "ai_capability",
    name: "Prompt-Injection Fence",
    summary:
      "Fences untrusted scanned content before it reaches a model, so a hostile web page cannot hijack the prompt.",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    tags: ["ai", "safety"],
    relationships: [{ kind: "uses", to: "svc.ai-gateway" }],
    evidence: "supabase/functions/_shared/discovery/injection",
  },
  {
    id: "ai.deterministic-scoring",
    kind: "ai_capability",
    name: "Deterministic Scoring Engines",
    summary:
      "Digital Maturity (12 dims), Business Health (8 dims), BTI executive (7 scores), Growth Intelligence. Weighted rules over evidence; null-not-zero. The real intelligence.",
    maturity: "live",
    reuse: ["reusable", "commercial"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    tags: ["scoring", "deterministic", "bi"],
    relationships: [
      { kind: "uses", to: "svc.discovery" },
      { kind: "extends", to: "mod.discovery-engine" },
    ],
    evidence: "packages/bti-engine; migrations 0020/0023/0026",
  },
  {
    id: "ai.conformance-engine",
    kind: "ai_capability",
    name: "Blueprint Conformance Engine",
    summary:
      "Deterministic pass/fail on delivered work; flags unauthorized module duplication; has a non-waivable failure list. No AI substitution.",
    maturity: "live",
    reuse: ["reusable"],
    owner: "HLVS",
    layer: "HLVS",
    tags: ["factory", "governance", "deterministic"],
    relationships: [{ kind: "uses", to: "db.hlvs" }],
    evidence: "migration 0025; _shared/hlvs/conformance",
  },
  {
    id: "ai.readiness-engine",
    kind: "ai_capability",
    name: "Factory Readiness Engine",
    summary:
      "Deterministic readiness verdict (ready / blocked / needs_review) for a build package. No AI input; mirrored in DB and edge.",
    maturity: "live",
    reuse: ["reusable"],
    owner: "HLVS",
    layer: "HLVS",
    tags: ["factory", "readiness"],
    relationships: [{ kind: "uses", to: "db.hlvs" }],
    evidence: "migration 0025; _shared/hlvs/readiness",
  },
  {
    id: "ai.recommendation-engine",
    kind: "ai_capability",
    name: "Recommendation Engine",
    summary:
      "Rules-as-data; each recommendation cites its rule + evidence; 5 categorical priority bands (no false precision).",
    maturity: "live",
    reuse: ["reusable", "commercial"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    tags: ["recommendations", "rules"],
    relationships: [
      { kind: "uses", to: "svc.discovery" },
      { kind: "extends", to: "mod.blueprint-engine" },
    ],
    evidence: "migration 0023; _shared/blueprint/rules",
  },
  {
    id: "ai.duplicate-check",
    kind: "ai_capability",
    name: "Duplicate-Risk Check",
    summary:
      "Deterministic reuse/extend/adapter/new determination guarding against duplication. AI advice is stored, never authoritative; a human approves.",
    maturity: "live",
    reuse: ["reusable"],
    owner: "HLVS",
    layer: "HLVS",
    tags: ["factory", "anti-duplication"],
    relationships: [{ kind: "uses", to: "db.hlvs" }],
    evidence: "migration 0025 hlvs.duplicate_check",
  },

  // ======================================================================
  // MODULES (engineering registry — the hlvs.modules concept)
  // ======================================================================
  ...moduleAsset(
    "discovery-engine",
    "Discovery Engine",
    "discovery",
    "Many evidence collectors → one Unified Business Profile → scored assessment.",
    ["svc.discovery"],
  ),
  ...moduleAsset(
    "blueprint-engine",
    "Blueprint Engine",
    "discovery",
    "Assessment → versioned, evidence-traced transformation plan (findings, roadmap, impact).",
    ["svc.discovery"],
  ),
  ...moduleAsset(
    "website-scanner",
    "Website Scanner",
    "discovery",
    "SSRF-safe deterministic evidence collection; rubric scoring; optional AI narrative.",
    ["svc.discovery", "ai.injection-fence"],
  ),
  ...moduleAsset(
    "commerce-provisioning",
    "Commerce & Provisioning",
    "sales",
    "Proposal → agreement → provisioning request → work order → factory authorization.",
    ["svc.commerce-provisioning"],
  ),
  ...moduleAsset(
    "hlvs-factory",
    "HLVS Software Factory",
    "hlvs",
    "The governed loop: blueprint → creation order → prompt package → dev run → conformance → build package.",
    ["ai.conformance-engine", "ai.readiness-engine"],
    "HLVS",
  ),
  ...moduleAsset(
    "bti-platform",
    "BTI Platform",
    "bti",
    "Executive scoring, engagement lifecycle, Executive Blueprint, ROI, CEO dashboard.",
    ["pkg.bti-engine"],
    "HL-BTI",
  ),
  ...moduleAsset(
    "visibility-assessments",
    "Visibility Assessments",
    "visibility",
    "Prospect capture, 16-category assessment, Business Growth Score, recommendations.",
    ["svc.discovery"],
  ),
  ...moduleAsset(
    "billing-core",
    "Billing Core",
    "billing",
    "Subscription/invoice/payment lifecycle + entitlement reconciliation.",
    ["svc.billing"],
  ),
  ...moduleAsset(
    "ai-gateway",
    "AI Gateway Module",
    "ai",
    "The metered AI door as an engineering module.",
    ["svc.ai-gateway"],
  ),
  ...moduleAsset(
    "comms",
    "Communications Module",
    "comms",
    "Templates, consent, suppression, send-with-approval.",
    ["svc.comms"],
  ),
  ...moduleAsset(
    "storage",
    "Storage Module",
    "storage_meta",
    "File registry, retention, signed-URL boundary.",
    ["svc.storage"],
  ),
  ...moduleAsset(
    "events-bus",
    "Event Bus Module",
    "events",
    "Transactional outbox + dispatcher.",
    ["svc.events"],
  ),
  ...moduleAsset(
    "identity-core",
    "Identity Core",
    "identity",
    "Tenancy, identity, roles, permissions — generalized from the legacy multi-org model.",
    ["svc.identity", "svc.permissions"],
  ),

  // ======================================================================
  // BUSINESS CAPABILITIES (hlvs.capabilities — 10 seeded)
  // ======================================================================
  ...capability(
    "ai-receptionist",
    "AI Receptionist",
    "Answer, qualify and route inbound contact via AI.",
  ),
  ...capability(
    "reputation-recovery",
    "Reputation Recovery",
    "Recover and manage reputation and reviews ethically.",
  ),
  ...capability("scheduling", "Scheduling", "Appointment and resource scheduling."),
  ...capability(
    "event-management",
    "Event Management",
    "Manage events, registration and logistics.",
  ),
  ...capability("registration", "Registration", "Customer/member registration flows."),
  ...capability(
    "route-assessment",
    "Route Assessment",
    "Assess and score delivery/logistics routes.",
  ),
  ...capability(
    "kpi-scoring",
    "KPI Scoring",
    "Deterministic scoring of business KPIs.",
  ),
  ...capability(
    "communications",
    "Communications",
    "Multi-channel customer communication.",
    ["svc.comms"],
  ),
  ...capability(
    "tenant-identity",
    "Tenant Identity",
    "Multi-tenant identity and access.",
    ["svc.identity"],
  ),
  ...capability(
    "document-extraction",
    "Document Extraction",
    "Extract structured data from documents.",
  ),

  // ======================================================================
  // INDUSTRY SOLUTIONS (hlvs.industry_templates — 7 seeded)
  // ======================================================================
  ...industry("salon", "Salon", "Composition for salon businesses."),
  ...industry("barbershop", "Barbershop", "Composition for barbershops."),
  ...industry(
    "transportation",
    "Transportation",
    "Composition for transportation/logistics.",
  ),
  ...industry(
    "sports-organization",
    "Sports Organization",
    "Composition for sports organizations.",
  ),
  ...industry(
    "home-services",
    "Home Services",
    "Composition for home-services businesses.",
  ),
  ...industry(
    "consulting",
    "Consulting",
    "Composition for consulting engagements (HL-BTI).",
  ),
  ...industry(
    "school-district",
    "School District",
    "Composition for school districts.",
  ),

  // ======================================================================
  // APIs
  // ======================================================================
  {
    id: "api.bti-public",
    kind: "api",
    name: "BTI Public API",
    summary:
      "The five public.bti_* SECURITY DEFINER RPCs — the one browser-reachable surface, membership-enforced internally.",
    maturity: "live",
    reuse: ["commercial"],
    owner: "HL-BTI",
    layer: "HL-BTI",
    tags: ["rpc", "public"],
    metrics: { functions: 5 },
    relationships: [{ kind: "uses", to: "db.bti" }],
    evidence: "migration 0027",
  },
  ...api(
    "hlvs-catalog",
    "HLVS Catalog API",
    "hlvs",
    "Governed RPCs over the factory catalog (register/approve capability/module/product).",
    "HLVS",
  ),
  ...api(
    "discovery",
    "Discovery API",
    "discovery",
    "RPCs over the discovery/blueprint engine (scan, assess, recommend, generate blueprint).",
  ),
  ...api(
    "commerce",
    "Commerce API",
    "sales",
    "RPCs over the sales→provisioning pipeline (propose, agree, provision, authorize).",
  ),
  ...api(
    "ai-gateway",
    "AI Gateway API",
    "ai",
    "The authenticated model door (begin/finish run, budget checks).",
  ),
  ...api(
    "events",
    "Events API",
    "events",
    "Emit/dispatch/claim/complete for the transactional outbox.",
  ),

  // ======================================================================
  // EDGE FUNCTIONS
  // ======================================================================
  ...edgeFn(
    "ai-gateway",
    "AI Gateway",
    "The one authenticated door to every model.",
    ["ai.gateway-runtime", "db.ai"],
    ["svc.events"],
    "built_undeployed",
    ["Anthropic", "Vault"],
  ),
  ...edgeFn(
    "billing-webhook",
    "Billing Webhook",
    "The only path a payment is recorded. Stripe adapter stubbed (501).",
    ["db.billing"],
    [],
    "built_undeployed",
    ["Stripe"],
  ),
  ...edgeFn(
    "commerce-worker",
    "Commerce Worker",
    "Drafts proposals and runs provisioning readiness. Activates nothing autonomously.",
    ["svc.commerce-provisioning"],
    ["svc.events", "svc.ai-gateway"],
    "built_undeployed",
    [],
  ),
  ...edgeFn(
    "discovery-blueprint-worker",
    "Discovery Blueprint Worker",
    "Assembles a transformation blueprint deterministically; optional AI narrative.",
    ["mod.blueprint-engine"],
    ["svc.events"],
    "built_undeployed",
    [],
  ),
  ...edgeFn(
    "discovery-website-worker",
    "Discovery Website Worker",
    "Runs the SSRF-safe website scan → evidence → dimension scores.",
    ["mod.website-scanner"],
    ["svc.events"],
    "built_undeployed",
    ["Anthropic"],
  ),
  ...edgeFn(
    "events-dispatcher",
    "Events Dispatcher",
    "Drains the outbox into per-subscription deliveries. The backbone.",
    ["svc.events"],
    [],
    "built_undeployed",
    [],
  ),
  ...edgeFn(
    "hlvs-factory-worker",
    "HLVS Factory Worker",
    "Exercises the factory lifecycle without contacting Claude. Always external_execution:false.",
    ["mod.hlvs-factory"],
    ["svc.events"],
    "built_undeployed",
    [],
  ),
  {
    id: "fn._shared",
    kind: "edge_function",
    name: "Shared Edge Libraries",
    summary:
      "Provider abstractions (ai/billing/comms/discovery/blueprint/bti/hlvs/provisioning/sales/storage) + the outbox dispatcher pattern + vault-by-reference.",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    key: "_shared",
    location: "supabase/functions/_shared",
    tags: ["infrastructure", "providers"],
    relationships: [{ kind: "owned_by", to: "repo.hl-bos-platform" }],
    evidence: "supabase/functions/_shared",
  },

  // ======================================================================
  // DATABASES (schemas)
  // ======================================================================
  ...db("platform", "Platform (tenants)", 1, "HL-BOS", "Tenants and lifecycle."),
  ...db(
    "identity",
    "Identity",
    8,
    "HL-BOS",
    "Profiles, memberships, roles, permissions, invitations.",
  ),
  ...db("audit", "Audit", 2, "HL-BOS", "Append-only audit + security events."),
  ...db("events", "Events", 4, "HL-BOS", "Transactional outbox event bus + handlers."),
  ...db(
    "entitlements",
    "Entitlements",
    4,
    "HL-BOS",
    "Feature catalog, plan mapping, module activation.",
  ),
  ...db(
    "integrations",
    "Integrations",
    5,
    "HL-BOS",
    "Connector/connection/sync/webhook framework.",
  ),
  ...db(
    "ai",
    "AI",
    7,
    "HL-BOS",
    "Provider/model/prompt registry, run ledger, budgets, guardrails.",
  ),
  ...db("workflows", "Workflows", 3, "HL-BOS", "Human-approval gate."),
  ...db(
    "visibility",
    "Visibility",
    8,
    "HL-BOS",
    "VisibilityAI: sites, content, reviews, prospects, assessments.",
  ),
  ...db(
    "billing",
    "Billing",
    8,
    "HL-BOS",
    "Subscriptions, invoices, payments, plans/prices.",
  ),
  ...db(
    "storage_meta",
    "Storage Meta",
    1,
    "HL-BOS",
    "File registry, retention, access boundary.",
  ),
  ...db(
    "comms",
    "Communications",
    7,
    "HL-BOS",
    "Templates, consent, suppression, messages.",
  ),
  ...db(
    "discovery",
    "Discovery",
    19,
    "HL-BOS",
    "Discovery engine + website scan + blueprint engine.",
  ),
  ...db("sales", "Sales", 7, "HL-BOS", "Proposals, prices, agreements, billing setup."),
  ...db(
    "provisioning",
    "Provisioning",
    7,
    "HL-BOS",
    "Requests, work orders, factory authorizations, readiness.",
  ),
  ...db(
    "hlvs",
    "HLVS Factory",
    19,
    "HLVS",
    "The Software Factory — Product Intelligence Layer.",
  ),
  ...db("bti", "BTI", 14, "HL-BTI", "HL-BTI platform + analysis snapshots."),
  ...db(
    "intake",
    "Business Transformation Intake",
    1,
    "HL-BOS",
    "Public Business Transformation intake submissions (RLS-forced; anon writes via SECURITY DEFINER RPC only).",
  ),

  // ======================================================================
  // WORKFLOWS
  // ======================================================================
  ...workflow(
    "human-approval-gate",
    "Human Approval Gate",
    "The reusable gate before anything deploys, charges, publishes or provisions.",
    ["svc.workflows"],
  ),
  ...workflow(
    "factory-lifecycle",
    "Factory Lifecycle",
    "Creation order → prompt package → dev run → checkpoint/completion reports.",
    ["mod.hlvs-factory"],
    "HLVS",
  ),
  ...workflow(
    "blueprint-lifecycle",
    "Blueprint Lifecycle",
    "Draft → architecture review → approved (immutable) → superseded.",
    ["mod.blueprint-engine"],
  ),
  ...workflow(
    "engagement-lifecycle",
    "Engagement Lifecycle",
    "12-stage BTI engagement state machine with an analysis-only cap.",
    ["mod.bti-platform"],
    "HL-BTI",
  ),
  ...workflow(
    "provisioning-readiness",
    "Provisioning Readiness",
    "Deterministic readiness gating; stops at 'ready'.",
    ["svc.commerce-provisioning"],
  ),
  ...workflow(
    "conformance-review",
    "Conformance Review",
    "Deterministic pass/fail with a non-waivable failure list.",
    ["ai.conformance-engine"],
    "HLVS",
  ),
  ...workflow(
    "catalog-governance",
    "Catalog Governance",
    "Register-before-develop; every scan updates the catalog; the catalog is the source of truth.",
    ["pkg.catalog"],
    "Tooling",
  ),

  // ======================================================================
  // REPOSITORIES
  // ======================================================================
  {
    id: "repo.hl-bos-platform",
    kind: "repository",
    name: "hl-bos-platform",
    summary:
      "The canonical monorepo: 27 migrations, 8 edge functions, 3 apps, 3 packages, ~700+ tests. Default branch main, protected.",
    maturity: "live",
    reuse: ["internal_only"],
    owner: "Herman Legacy Platform",
    layer: "HL-BOS",
    location: "KeithVenuewise73/hl-bos-platform",
    tags: ["monorepo", "canonical"],
    relationships: [],
    evidence: "this repository",
  },
  {
    id: "repo.legacy-herman-platform",
    kind: "repository",
    name: "Legacy Herman Platform",
    summary:
      "The legacy estate's project (156 tables across hlvs/hscs_glp/dpi/public). Unreachable from current credentials; out of scope.",
    maturity: "legacy",
    reuse: ["internal_only", "deprecated"],
    owner: "Herman Legacy (legacy)",
    layer: "Legacy",
    location: "legacy project (unreachable)",
    tags: ["legacy", "out-of-scope"],
    relationships: [],
    evidence: "docs/architecture/current-state-audit.md",
  },
];

// ==========================================================================
// Small builders — keep the registry above readable and consistent.
// ==========================================================================

function sharedService(
  key: string,
  name: string,
  schema: string,
  tables: number,
  maturity: Asset["maturity"],
  reuse: Asset["reuse"],
  summary: string,
  provides: string[],
): Asset[] {
  return [
    {
      id: `svc.${key}`,
      kind: "shared_service",
      name,
      summary,
      maturity,
      reuse,
      owner: "Herman Legacy Platform",
      layer: "HL-BOS",
      location: `${schema} schema`,
      tags: ["shared", "spine"],
      metrics: { tables },
      relationships: [
        { kind: "owned_by" as const, to: "prod.hl-bos" },
        ...provides.map((to) => ({ kind: "provides" as const, to })),
      ],
      evidence: "live census 2026-07-29",
    },
  ];
}

function moduleAsset(
  key: string,
  name: string,
  schema: string,
  summary: string,
  uses: string[],
  layer: Asset["layer"] = "HL-BOS",
): Asset[] {
  return [
    {
      id: `mod.${key}`,
      kind: "module",
      name,
      summary,
      maturity: "live",
      reuse: ["reusable"],
      owner: layer === "HLVS" ? "HLVS" : "Herman Legacy Platform",
      layer,
      location: `${schema} schema`,
      tags: ["module", "engineering-registry"],
      relationships: [
        { kind: "owned_by" as const, to: "prod.hl-bos" },
        ...uses.map((to) => ({ kind: "uses" as const, to })),
      ],
      evidence:
        "discovery.module_catalog (23) exists; hlvs.modules registry is 0 rows (dormant) — pending registration",
    },
  ];
}

function capability(
  key: string,
  name: string,
  summary: string,
  uses: string[] = [],
): Asset[] {
  return [
    {
      id: `cap.${key}`,
      kind: "business_capability",
      name,
      summary,
      maturity: "reference",
      reuse: ["reusable", "commercial"],
      owner: "HLVS",
      layer: "HLVS",
      tags: ["capability"],
      relationships: [
        { kind: "owned_by" as const, to: "db.hlvs" },
        ...uses.map((to) => ({ kind: "uses" as const, to })),
      ],
      evidence: "hlvs.capabilities (10 seeded); docs/architecture/47",
    },
  ];
}

function industry(key: string, name: string, summary: string): Asset[] {
  return [
    {
      id: `ind.${key}`,
      kind: "industry_solution",
      name,
      summary,
      maturity: "reference",
      reuse: ["commercial", "reusable"],
      owner: "HLVS",
      layer: "HLVS",
      tags: ["industry-template"],
      relationships: [{ kind: "owned_by", to: "db.hlvs" }],
      evidence: "hlvs.industry_templates (7 seeded)",
    },
  ];
}

function api(
  key: string,
  name: string,
  schema: string,
  summary: string,
  layer: Asset["layer"] = "HL-BOS",
): Asset[] {
  return [
    {
      id: `api.${key}`,
      kind: "api",
      name,
      summary,
      maturity: "live",
      reuse: ["reusable"],
      owner: layer === "HLVS" ? "HLVS" : "Herman Legacy Platform",
      layer,
      location: `${schema} schema RPCs`,
      tags: ["rpc", "function-api"],
      relationships: [{ kind: "uses" as const, to: `db.${schema}` }],
      evidence: "SECURITY DEFINER RPC surface (schemas not PostgREST-exposed)",
    },
  ];
}

function edgeFn(
  key: string,
  name: string,
  summary: string,
  provides: string[],
  consumes: string[],
  maturity: Asset["maturity"],
  integrations: string[],
): Asset[] {
  return [
    {
      id: `fn.${key}`,
      kind: "edge_function",
      name,
      summary,
      maturity,
      reuse: ["reusable"],
      owner: "Herman Legacy Platform",
      layer: "HL-BOS",
      key,
      location: `supabase/functions/${key}`,
      tags: ["edge", "worker", ...integrations.map((i) => i.toLowerCase())],
      relationships: [
        { kind: "owned_by" as const, to: "repo.hl-bos-platform" },
        ...provides.map((to) => ({ kind: "provides" as const, to })),
        ...consumes.map((to) => ({ kind: "consumes" as const, to })),
      ],
      evidence: "supabase/functions; not deployed to HL-BOS Core (0 deployed)",
    },
  ];
}

function db(
  schema: string,
  name: string,
  tables: number,
  layer: Asset["layer"],
  summary: string,
): Asset[] {
  return [
    {
      id: `db.${schema}`,
      kind: "database",
      name: `${name} (${schema})`,
      summary,
      maturity: "live",
      reuse: ["internal_only"],
      owner:
        layer === "HLVS"
          ? "HLVS"
          : layer === "HL-BTI"
            ? "HL-BTI"
            : "Herman Legacy Platform",
      layer,
      key: schema,
      location: `${schema} schema`,
      tags: ["schema", "postgres", "rls"],
      metrics: { tables },
      relationships: [{ kind: "owned_by", to: "prod.hl-bos" }],
      evidence: "live census 2026-07-29 (100% RLS)",
    },
  ];
}

function workflow(
  key: string,
  name: string,
  summary: string,
  uses: string[],
  layer: Asset["layer"] = "HL-BOS",
): Asset[] {
  return [
    {
      id: `wf.${key}`,
      kind: "workflow",
      name,
      summary,
      maturity: "live",
      reuse: ["reusable"],
      owner:
        layer === "HLVS"
          ? "HLVS"
          : layer === "HL-BTI"
            ? "HL-BTI"
            : "Herman Legacy Platform",
      layer,
      tags: ["workflow", "governance"],
      relationships: uses.map((to) => ({ kind: "uses" as const, to })),
      evidence: "migrations; docs/architecture-audit/hlvs-phase-1-atlas",
    },
  ];
}

export const CATALOG: Catalog = { assets: ASSETS };
