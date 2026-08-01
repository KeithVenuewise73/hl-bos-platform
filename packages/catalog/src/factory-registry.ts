/**
 * THE FACTORY MASTER REGISTRY (Factory Execution Phase).
 *
 * The Herman Legacy Software Factory is NOT a new platform, a new Supabase
 * project, or a second catalog. It is one missing layer added on top of the
 * Enterprise Catalog (`@hl-bos/catalog`): the ability to reason about the same
 * capability as implemented across DIFFERENT SOURCE PLATFORMS.
 *
 * Checkpoint 1 (docs/products/factory-foundation/00-checkpoint1-reuse-assessment.md)
 * established that the Factory's engine already exists here:
 *   - `Capability`            (capabilities.ts)        — the abstract capability
 *   - `duplicateCheck`/reuse  (capability-reuse.ts)    — reuse-before-rebuild
 *   - `ProductComposition`    (compositions.ts)        — the Product
 *   - `assembleProduct`       (factory.ts)             — the Product Assembly
 *   - the Knowledge Graph, the Application Registry, the Enterprise Catalog
 * All of that is REUSED, imported, never re-implemented.
 *
 * The gap this file closes is the two concepts the existing model could not
 * express:
 *   - **Source Platform**            — HL-BOS Core, Venuewise Platform, HSCS…
 *   - **Capability Implementation**  — a capability AS REALIZED on one platform,
 *                                      with its maturity, backend anchors, the
 *                                      commercialization layers it can support,
 *                                      and a canonical/alternate/reference status.
 *
 * DATA RESIDENCY & HONESTY (Principle 10). This is a LOGICAL registry. No
 * source-platform data is copied into HL-BOS. Venuewise rows carry only
 * capability metadata and object NAMES observed during the read-only backend
 * harvest (docs/products/venuewise-backend-harvest/*) — never rows, never
 * secrets, never a schema copy — and are labeled `harvest_asserted`. HSCS is
 * declared `planned` with zero implementations; it does not pretend to exist.
 * HL-BOS implementations are DERIVED from the verified canonical `CAPABILITIES`
 * so this registry stays in sync with the single source of truth.
 */

import {
  CAPABILITIES,
  capabilityById,
  type Capability,
  type CapMaturity,
} from "./capabilities";

// ==========================================================================
// Source Platforms
// ==========================================================================

export type SourcePlatformId =
  "hlbos_core" | "venuewise_platform" | "hscs" | "external";

export type PlatformKind = "canonical" | "harvested" | "planned" | "external";
export type PlatformStatus =
  "operational" | "reference_only" | "planned" | "unreachable";
/** Where a platform's data physically lives relative to HL-BOS. */
export type DataResidency = "in_hlbos" | "external_readonly" | "not_applicable";

export interface SourcePlatform {
  id: SourcePlatformId;
  name: string;
  kind: PlatformKind;
  status: PlatformStatus;
  /** Supabase project ref, or null when the platform has no live backend. */
  supabaseRef: string | null;
  dataResidency: DataResidency;
  description: string;
  /** Repository / harvest evidence for this platform's inventory. */
  evidence: string;
}

export const SOURCE_PLATFORMS: SourcePlatform[] = [
  {
    id: "hlbos_core",
    name: "HL-BOS Core",
    kind: "canonical",
    status: "operational",
    supabaseRef: "mvvtngiopdrgiedjmhfb",
    dataResidency: "in_hlbos",
    description:
      "The canonical Herman Legacy platform. System of record for the Factory. All " +
      "Factory-assembled products deploy onto this platform's database and governance.",
    evidence:
      ".hlbos/canonical.json (canonicalProjectRef mvvtngiopdrgiedjmhfb); 28 migrations; " +
      "packages/catalog CAPABILITIES (verified)",
  },
  {
    id: "venuewise_platform",
    name: "Venuewise Platform",
    kind: "harvested",
    status: "reference_only",
    supabaseRef: "urwnbskrtoplgnkkxuvl",
    dataResidency: "external_readonly",
    description:
      "A mature, operating external platform (youth-sports vertical + horizontal engines). " +
      "Inventoried read-only. A source of proven capability IMPLEMENTATIONS the Factory can " +
      "reference for assembly decisions — not part of HL-BOS, not migrated, not copied.",
    evidence:
      "docs/products/venuewise-backend-harvest/* (93 tables, 69 fns, 23 edge fns, 73 " +
      "migrations; observed 2026-07-31, read-only)",
  },
  {
    id: "hscs",
    name: "HSCS (Herman Supply Chain Systems)",
    kind: "planned",
    status: "planned",
    supabaseRef: null,
    dataResidency: "not_applicable",
    description:
      "A future source platform placeholder. Declared so the Factory model is complete; it " +
      "has zero implementations until a real HSCS backend is harvested or built.",
    evidence: "Declared placeholder — no backend, no harvest. PLANNED.",
  },
];

export function platformById(id: SourcePlatformId): SourcePlatform | undefined {
  return SOURCE_PLATFORMS.find((p) => p.id === id);
}

// ==========================================================================
// Commercialization layers (Commercialization Law #1)
// ==========================================================================

/** L1 Internal ops · L2 HL-BTI transformation · L3 Standalone SaaS ·
 *  L4 Licensed/API/white-label · L5 Factory assembly. */
export type CommercializationLayer = "L1" | "L2" | "L3" | "L4" | "L5";

export const COMMERCIALIZATION_LAYERS: Record<CommercializationLayer, string> = {
  L1: "Internal Herman Legacy operations",
  L2: "HL-BTI transformation delivery",
  L3: "Standalone SaaS product",
  L4: "Licensed / API / white-label",
  L5: "Factory assembly building block",
};

// ==========================================================================
// Capability Implementation — a capability AS REALIZED on one platform
// ==========================================================================

/** Implementation reality on a platform (distinct from the capability's abstract maturity). */
export type ImplMaturity =
  "production" | "functional" | "partial" | "planned" | "unknown" | "retired";

/** Is this implementation the system-of-record for its capability? A CEO/architecture
 *  decision by default `undecided` when more than one platform implements the capability. */
export type CanonicalDecision =
  | "canonical" // the chosen system of record
  | "alternate" // a valid alternative implementation
  | "reference" // referenced for learning/assembly, not adopted
  | "undecided"; // contested — needs a decision

/** How much we trust this row. */
export type ImplVerification =
  | "verified" // verified against HL-BOS live/repo evidence
  | "harvest_asserted" // observed in a read-only harvest, not re-verified this phase
  | "unverified"; // asserted without direct evidence

export interface CapabilityImplementation {
  /** Stable id: `${capabilityKey}@${platform}` (capabilityKey is the canonical id or a slug). */
  id: string;
  /** FK to a canonical `Capability.id`, or null when no canonical capability exists yet. */
  capabilityId: string | null;
  /** Human label — the capability's name on this platform (works when capabilityId is null). */
  capabilityLabel: string;
  platform: SourcePlatformId;
  maturity: ImplMaturity;

  // --- Backend anchors on the source platform (names only) ---
  schemas: string[];
  tables: string[];
  functions: string[];
  edgeFunctions: string[];

  // --- Commercialization + governance ---
  commercializationLayers: CommercializationLayer[];
  canonicalDecision: CanonicalDecision;
  verification: ImplVerification;
  /** True when this implementation can be reused/assembled today (built, not planned). */
  reusableNow: boolean;
  evidence: string;
  notes?: string;
}

// ==========================================================================
// Seed A — HL-BOS Core implementations, DERIVED from the canonical library
// ==========================================================================

/** Map a canonical capability's implementation-status to Factory impl maturity. */
function implMaturityFor(m: CapMaturity): ImplMaturity {
  switch (m) {
    case "implemented":
      return "production";
    case "partial":
      return "partial";
    case "planned":
      return "planned";
    case "deprecated":
      return "retired";
  }
}

/**
 * Deterministically derive the commercialization layers a HL-BOS capability can
 * support. This is capability POTENTIAL (per Commercialization Law #1), not a
 * plan or a commitment — the same framing the Venuewise harvest used. Nothing
 * here asserts pricing or a launch.
 */
function hlbosLayersFor(c: Capability): CommercializationLayer[] {
  const layers = new Set<CommercializationLayer>();
  const built = c.maturity === "implemented" || c.maturity === "partial";
  if (built) layers.add("L1"); // internal ops: any built capability
  if (built && c.reusability === "reusable") layers.add("L5"); // composable block
  if (c.monetization === "direct") layers.add("L3"); // sellable as SaaS
  if (
    c.domain === "discovery" ||
    c.domain === "analytics" ||
    c.domain === "intelligence"
  ) {
    layers.add("L2"); // feeds HL-BTI transformation
  }
  if (
    built &&
    c.reusability === "reusable" &&
    c.type === "technical" &&
    (c.commercialReadiness === "ready" ||
      c.commercialReadiness === "needs_assembly" ||
      c.commercialReadiness === "internal")
  ) {
    layers.add("L4"); // an engine that can be licensed / exposed as API
  }
  return [...layers].sort();
}

function deriveHlbosImplementation(c: Capability): CapabilityImplementation {
  const maturity = implMaturityFor(c.maturity);
  const reusableNow = maturity === "production" || maturity === "partial";
  return {
    id: `${c.id}@hlbos_core`,
    capabilityId: c.id,
    capabilityLabel: c.displayName,
    platform: "hlbos_core",
    maturity,
    schemas: c.schema ? [c.schema] : [],
    tables: [],
    functions: [],
    edgeFunctions: c.edgeFunctions,
    commercializationLayers: hlbosLayersFor(c),
    // HL-BOS is the canonical platform, but honesty (Principle 10) forbids calling
    // an incomplete capability the system of record: a fully-implemented HL-BOS
    // capability is `canonical`; a `partial` one is `undecided` (it may be
    // out-matured by another platform's live implementation — e.g. billing); a
    // `planned` one is a `reference` target until it is built.
    canonicalDecision:
      maturity === "production"
        ? "canonical"
        : maturity === "partial"
          ? "undecided"
          : "reference",
    verification: c.verificationState === "verified" ? "verified" : "unverified",
    reusableNow,
    evidence: c.evidence,
  };
}

export const HLBOS_IMPLEMENTATIONS: CapabilityImplementation[] = CAPABILITIES.map(
  deriveHlbosImplementation,
);

// ==========================================================================
// Seed B — Venuewise Platform implementations, from the read-only harvest
// ==========================================================================

/** Compact builder for a Venuewise implementation row (all harvest_asserted). */
function vw(base: {
  key: string;
  label: string;
  capabilityId?: string | null;
  maturity: ImplMaturity;
  schemas?: string[];
  tables?: string[];
  functions?: string[];
  edge?: string[];
  layers: CommercializationLayer[];
  canonical?: CanonicalDecision;
  evidence: string;
  notes?: string;
}): CapabilityImplementation {
  const reusableNow =
    base.maturity === "production" ||
    base.maturity === "functional" ||
    base.maturity === "partial";
  return {
    id: `${base.key}@venuewise_platform`,
    capabilityId: base.capabilityId ?? null,
    capabilityLabel: base.label,
    platform: "venuewise_platform",
    maturity: base.maturity,
    schemas: base.schemas ?? ["public"],
    tables: base.tables ?? [],
    functions: base.functions ?? [],
    edgeFunctions: base.edge ?? [],
    commercializationLayers: [...base.layers].sort(),
    // Default undecided when a capability also exists on HL-BOS (contested); a
    // Venuewise-only capability is de-facto canonical for its capability.
    canonicalDecision: base.canonical ?? "undecided",
    verification: "harvest_asserted",
    reusableNow,
    evidence: base.evidence,
    ...(base.notes !== undefined ? { notes: base.notes } : {}),
  };
}

/**
 * Seeded from docs/products/venuewise-backend-harvest/{01,02,03}. Maturity and
 * L1–L5 layers are taken from the harvest's evidence-based grids (doc 03); object
 * anchors from doc 02. Rows that map to an existing HL-BOS canonical capability
 * carry that `capabilityId` and default to `undecided` (contested); Venuewise-only
 * rows carry `capabilityId: null` and are `canonical` for their own capability.
 */
export const VENUEWISE_IMPLEMENTATIONS: CapabilityImplementation[] = [
  // ---- Horizontal engines ----
  vw({
    key: "identity_access",
    label: "Phone-first Identity & Access",
    capabilityId: "identity_access",
    maturity: "production",
    tables: ["people", "family_access", "admin_users", "workspace_members"],
    functions: ["current_person_id", "verify_and_link", "is_admin", "norm_phone"],
    edge: ["verify-phone"],
    layers: ["L1", "L4", "L5"],
    evidence: "harvest 01/02: 7 users, phone+email; verify_and_link + trigger live",
    notes:
      "Phone-first; HL-BOS identity_access is email/RLS-first — different implementation.",
  }),
  vw({
    key: "workspaces_branding",
    label: "Multi-tenant Workspaces & Branding",
    capabilityId: "identity_access",
    maturity: "functional",
    tables: [
      "business_workspaces",
      "workspace_branding",
      "workspace_services",
      "workspace_settings",
    ],
    functions: ["current_workspace_ids", "visible_workspace_ids"],
    layers: ["L1", "L4", "L5"],
    evidence: "harvest 01/02: full workspace/branding/roles/services model",
    notes: "Tenancy+branding facet of identity on Venuewise.",
  }),
  vw({
    key: "scheduling",
    label: "Scheduling & Unified Calendar",
    capabilityId: "scheduling",
    maturity: "production",
    tables: ["calendar_events", "events", "family_events", "athlete_events"],
    functions: ["get_merged_calendar", "sync_homehuddle_events_to_calendar"],
    edge: ["sync-schedules"],
    layers: ["L1", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence:
      "harvest 03: PRODUCTION — calendar_events 93, events 118; cron 10m/30m. HL-BOS scheduling is PLANNED.",
    notes:
      "The mature scheduling implementation across the estate. HL-BOS has no built scheduler.",
  }),
  vw({
    key: "messaging_sms",
    label: "Messaging: SMS (in/out) + Reminders",
    capabilityId: "communications",
    maturity: "production",
    tables: ["sms_outbox", "reminders"],
    functions: ["enqueue_sms_for_family", "enqueue_nightly_reminders"],
    edge: ["send-sms-outbox", "sms-inbound", "send-pin-reset"],
    layers: ["L1", "L3", "L4", "L5"],
    evidence:
      "harvest 03: PRODUCTION — sms_outbox 284 sent; cron every 2 min (Twilio).",
    notes: "HL-BOS communications is built_undeployed; Venuewise SMS is live.",
  }),
  vw({
    key: "push_feeds",
    label: "Push & Feed Notifications",
    capabilityId: "communications",
    maturity: "functional",
    tables: ["push_subscriptions", "feeds"],
    functions: ["wf_effect_notification"],
    edge: ["send-notifications"],
    layers: ["L1", "L4", "L5"],
    evidence: "harvest 03: FUNCTIONAL — VAPID keys set; push_subscriptions 1.",
    notes: "Web-push facet of communications.",
  }),
  vw({
    key: "payments_subscriptions",
    label: "Payments & Subscriptions (Stripe)",
    capabilityId: "billing",
    maturity: "production",
    tables: ["subscriptions"],
    edge: ["stripe-checkout", "stripe-portal", "stripe-webhook", "stripe-secret-check"],
    layers: ["L1", "L4", "L5"],
    evidence: "harvest 03: PRODUCTION — full Stripe suite live; subscriptions 1.",
    notes:
      "HL-BOS billing_core is built_undeployed with a stubbed Stripe adapter; Venuewise Stripe is live.",
  }),
  vw({
    key: "forms_engine",
    label: "Forms Engine",
    capabilityId: null,
    maturity: "functional",
    tables: ["form_templates", "form_sections", "form_fields", "form_submissions"],
    functions: ["fs_save_draft", "fs_submit", "readable_form_template_ids"],
    edge: ["form-save", "form-submit"],
    layers: ["L1", "L2", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: FUNCTIONAL — versioned forms w/ drafts; 0 submissions.",
    notes: "No canonical HL-BOS forms capability exists — Venuewise-only.",
  }),
  vw({
    key: "documents_engine",
    label: "Documents Engine (generate/version/approve)",
    capabilityId: "storage",
    maturity: "functional",
    tables: [
      "documents",
      "document_templates",
      "document_versions",
      "document_approvals",
    ],
    functions: ["doc_create_version", "doc_decide_approval"],
    edge: ["document-generate", "document-download", "document-approve"],
    layers: ["L1", "L2", "L3", "L4", "L5"],
    evidence:
      "harvest 03: FUNCTIONAL — generate/version/approve + private bucket; 0 docs.",
    notes: "Extends what HL-BOS storage provides (doc generation/versioning/approval).",
  }),
  vw({
    key: "workflow_engine",
    label: "Workflow Engine (templates→stages→tasks→approvals→effects)",
    capabilityId: "human_approval",
    maturity: "production",
    tables: [
      "workflow_templates",
      "workflow_instances",
      "workflow_tasks",
      "workflow_approvals",
    ],
    functions: ["wf_start", "wf_advance", "wf_task_action", "wf_tick"],
    edge: [
      "workflow-start",
      "workflow-advance",
      "workflow-task-action",
      "workflow-tick",
    ],
    layers: ["L1", "L2", "L3", "L4", "L5"],
    evidence:
      "harvest 03: PRODUCTION-TESTED — workflow_events 52; templates/instances built.",
    notes: "Broader than HL-BOS human_approval (full template→effect engine).",
  }),
  vw({
    key: "analytics_status",
    label: "Analytics & Platform Status",
    capabilityId: null,
    maturity: "production",
    tables: ["page_views", "analytics_data", "platform_status"],
    functions: ["refresh_platform_status"],
    layers: ["L1", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: PRODUCTION — page_views 703; status refreshed every 10 min.",
    notes:
      "Page-view analytics + status page; distinct from HL-BOS executive_dashboards.",
  }),
  vw({
    key: "crm_leads",
    label: "CRM / Lead Capture",
    capabilityId: null,
    maturity: "functional",
    tables: ["leads"],
    layers: ["L1", "L2", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: FUNCTIONAL — leads table + RLS; 0 rows.",
    notes:
      "HL-BOS has no dedicated CRM capability (business_discovery carries a lead_capture alias but is prospect-intelligence, not a CRM). Venuewise provides the CRM leads store.",
  }),
  vw({
    key: "administration_moderation",
    label: "Administration & Moderation (+ anti-spam)",
    capabilityId: null,
    maturity: "production",
    tables: ["admin_users", "invite_log", "platform_status"],
    functions: ["is_admin", "reject_spam_submission", "admin_add_academy_member"],
    layers: ["L1", "L5"],
    canonical: "reference",
    evidence: "harvest 03: PRODUCTION — admin fns + anti-spam triggers on 7 tables.",
    notes: "Internal-only capability.",
  }),

  // ---- Sports vertical (Venuewise-only capabilities) ----
  vw({
    key: "family_management",
    label: "Family Management",
    capabilityId: null,
    maturity: "production",
    tables: ["families", "family_members", "family_players", "family_events"],
    functions: ["create_family_onboarding", "invite_family_member"],
    layers: ["L1", "L3", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: PRODUCTION — families/members/events populated (7 members).",
  }),
  vw({
    key: "athlete_development",
    label: "Athlete Development",
    capabilityId: null,
    maturity: "functional",
    tables: ["athletes", "athlete_goals", "athlete_stats", "athlete_videos"],
    functions: [
      "create_athlete_profile",
      "public_athlete_card",
      "public_athlete_directory",
    ],
    layers: ["L1", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence:
      "harvest 03: FUNCTIONAL — athlete_events 51; full profile/goal/stat/video model.",
  }),
  vw({
    key: "coach_management",
    label: "Coach Management",
    capabilityId: null,
    maturity: "functional",
    tables: ["coaches", "coach_connections", "coach_spotlight_submissions"],
    functions: ["public_featured_coach"],
    layers: ["L1", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence:
      "harvest 03: FUNCTIONAL — coaches 1 (33-col profile); connections + featured RPC.",
  }),
  vw({
    key: "team_roster",
    label: "Team & Roster Management",
    capabilityId: null,
    maturity: "functional",
    tables: ["players", "player_teams", "team_spotlight_submissions"],
    functions: ["public_featured_team"],
    layers: ["L1", "L3", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: FUNCTIONAL — players 3, player_teams 2; featured RPC.",
  }),
  vw({
    key: "facility_booking",
    label: "Facility Management & Booking",
    capabilityId: null,
    maturity: "functional",
    tables: [
      "facilities",
      "facility_areas",
      "facility_events",
      "bookings",
      "open_slots",
    ],
    layers: ["L1", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: FUNCTIONAL — bookings 3, open_slots 2; full facility model.",
  }),
  vw({
    key: "clinics_academy",
    label: "Clinics & Academy Registration",
    capabilityId: null,
    maturity: "functional",
    tables: [
      "clinics",
      "clinic_registrations",
      "academy_applications",
      "academy_members",
    ],
    functions: ["admin_add_academy_member", "is_academy_member"],
    layers: ["L1", "L3", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: FUNCTIONAL — full academy model; 0 rows.",
  }),
  vw({
    key: "organization_directory",
    label: "Organization Directory",
    capabilityId: null,
    maturity: "functional",
    tables: [
      "organizations",
      "organization_athletes",
      "organization_coaches",
      "organization_events",
    ],
    functions: ["public_featured_organization"],
    layers: ["L1", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence: "harvest 03: FUNCTIONAL — org + athletes/coaches/events + featured RPC.",
  }),
  vw({
    key: "media_operation",
    label: "Media Operation (5-Star Sports Media)",
    capabilityId: null,
    maturity: "partial",
    tables: [
      "spotlights",
      "articles",
      "podcast_episodes",
      "videos",
      "game_scores",
      "legends",
    ],
    functions: ["media_update_status", "public_games_board", "public_featured_legend"],
    layers: ["L1", "L3", "L4", "L5"],
    canonical: "canonical",
    evidence:
      "harvest 03: PARTIAL — spotlights 1 + full media-review pipeline; most content tables 0.",
  }),
  vw({
    key: "public_directories",
    label: "Public Directories / Games Board",
    capabilityId: null,
    maturity: "functional",
    functions: [
      "public_athlete_directory",
      "public_games_board",
      "public_featured_team",
    ],
    layers: ["L4", "L5"],
    canonical: "canonical",
    evidence:
      "harvest 03: FUNCTIONAL — public RPCs built; depend on athlete/media data volume.",
  }),

  // ---- Investigate (purpose not determinable from metadata) ----
  vw({
    key: "ai_edge_processors",
    label: "AI / generic edge processors",
    capabilityId: null,
    maturity: "unknown",
    edge: ["super-processor", "hyper-action", "smart-function"],
    layers: [],
    canonical: "reference",
    evidence:
      "harvest 03: UNKNOWN — 3 edge fns; purpose not determinable from metadata (source not read).",
    notes: "Investigate before any reuse decision.",
  }),
];

// ==========================================================================
// The Master Registry — all implementations across all platforms
// ==========================================================================

export const CAPABILITY_IMPLEMENTATIONS: CapabilityImplementation[] = [
  ...HLBOS_IMPLEMENTATIONS,
  ...VENUEWISE_IMPLEMENTATIONS,
  // HSCS: intentionally none — the platform is a declared placeholder.
];

// ==========================================================================
// Accessors — how the Factory reasons across platforms
// ==========================================================================

export function implementationById(id: string): CapabilityImplementation | undefined {
  return CAPABILITY_IMPLEMENTATIONS.find((i) => i.id === id);
}

export function implementationsOnPlatform(
  platform: SourcePlatformId,
): CapabilityImplementation[] {
  return CAPABILITY_IMPLEMENTATIONS.filter((i) => i.platform === platform);
}

/** All implementations of one canonical capability, across every platform. */
export function implementationsForCapability(
  capabilityId: string,
): CapabilityImplementation[] {
  return CAPABILITY_IMPLEMENTATIONS.filter((i) => i.capabilityId === capabilityId);
}

const IMPL_MATURITY_RANK: Record<ImplMaturity, number> = {
  production: 5,
  functional: 4,
  partial: 3,
  planned: 1,
  unknown: 0,
  retired: 0,
};

/** The most-mature implementation of a capability (ties broken by platform order). */
export function mostMatureImplementation(
  capabilityId: string,
): CapabilityImplementation | undefined {
  return implementationsForCapability(capabilityId)
    .slice()
    .sort((a, b) => IMPL_MATURITY_RANK[b.maturity] - IMPL_MATURITY_RANK[a.maturity])[0];
}

/** Significant (len>=3) lowercase tokens of a phrase. */
function termTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Find implementations by a free-text term. Builds a haystack from the
 * implementation label, capability id, and — for rows linked to a canonical
 * capability — that capability's canonicalName, displayName, and aliases, then
 * matches when EVERY significant token of the term appears in it (token-AND).
 * Token-AND (not raw substring) is what lets "team roster" match the label
 * "Team & Roster Management". This is how the Factory answers "which platform
 * provides X" uniformly across platforms.
 */
export function findImplementations(term: string): CapabilityImplementation[] {
  const wanted = termTokens(term);
  if (wanted.length === 0) return [];
  return CAPABILITY_IMPLEMENTATIONS.filter((i) => {
    const parts = [i.capabilityLabel, i.capabilityId ?? ""];
    const cap = i.capabilityId ? capabilityById(i.capabilityId) : undefined;
    if (cap) parts.push(cap.canonicalName, cap.displayName, ...cap.aliases);
    const hay = parts.join(" ").toLowerCase();
    return wanted.every((w) => hay.includes(w));
  });
}

/** Which platforms provide something matching `term`, with the best maturity each. */
export function platformsProviding(
  term: string,
): Array<{ platform: SourcePlatformId; maturity: ImplMaturity; label: string }> {
  const hits = findImplementations(term);
  const best = new Map<
    SourcePlatformId,
    { platform: SourcePlatformId; maturity: ImplMaturity; label: string }
  >();
  for (const i of hits) {
    const cur = best.get(i.platform);
    if (!cur || IMPL_MATURITY_RANK[i.maturity] > IMPL_MATURITY_RANK[cur.maturity]) {
      best.set(i.platform, {
        platform: i.platform,
        maturity: i.maturity,
        label: i.capabilityLabel,
      });
    }
  }
  return [...best.values()];
}

/** Implementations that can support a given commercialization layer, built today. */
export function implementationsSupportingLayer(
  layer: CommercializationLayer,
): CapabilityImplementation[] {
  return CAPABILITY_IMPLEMENTATIONS.filter(
    (i) => i.reusableNow && i.commercializationLayers.includes(layer),
  );
}

/** Capabilities/implementations that can be sold as a standalone SaaS (L3), built today. */
export function independentlySellable(): CapabilityImplementation[] {
  return implementationsSupportingLayer("L3");
}

/**
 * Capabilities implemented on more than one platform with no single canonical
 * choice — the reuse/canonical decisions the CEO/architecture must still make.
 */
export function contestedCapabilities(): Array<{
  capabilityId: string;
  implementations: CapabilityImplementation[];
}> {
  const byCap = new Map<string, CapabilityImplementation[]>();
  for (const i of CAPABILITY_IMPLEMENTATIONS) {
    if (!i.capabilityId) continue;
    const list = byCap.get(i.capabilityId) ?? [];
    list.push(i);
    byCap.set(i.capabilityId, list);
  }
  const out: Array<{
    capabilityId: string;
    implementations: CapabilityImplementation[];
  }> = [];
  for (const [capabilityId, implementations] of byCap) {
    if (implementations.length < 2) continue;
    const hasCanonical = implementations.some(
      (i) => i.canonicalDecision === "canonical",
    );
    if (!hasCanonical) out.push({ capabilityId, implementations });
  }
  return out.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
}

/** Registry-wide integrity summary (for the completion report + portal). */
export interface FactoryRegistrySummary {
  platforms: number;
  operationalPlatforms: number;
  implementations: number;
  byPlatform: Record<SourcePlatformId, number>;
  reusableNow: number;
  contested: number;
  /** Implementations linking to a canonical capability id that does not exist (integrity check). */
  danglingCapabilityRefs: string[];
}

export function factoryRegistrySummary(): FactoryRegistrySummary {
  const byPlatform = {
    hlbos_core: 0,
    venuewise_platform: 0,
    hscs: 0,
    external: 0,
  } as Record<SourcePlatformId, number>;
  for (const i of CAPABILITY_IMPLEMENTATIONS) byPlatform[i.platform] += 1;

  const dangling = CAPABILITY_IMPLEMENTATIONS.filter(
    (i) => i.capabilityId !== null && capabilityById(i.capabilityId) === undefined,
  ).map((i) => i.id);

  return {
    platforms: SOURCE_PLATFORMS.length,
    operationalPlatforms: SOURCE_PLATFORMS.filter((p) => p.status === "operational")
      .length,
    implementations: CAPABILITY_IMPLEMENTATIONS.length,
    byPlatform,
    reusableNow: CAPABILITY_IMPLEMENTATIONS.filter((i) => i.reusableNow).length,
    contested: contestedCapabilities().length,
    danglingCapabilityRefs: dangling,
  };
}
