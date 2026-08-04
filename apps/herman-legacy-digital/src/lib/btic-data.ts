/**
 * Business Transformation Intelligence Center (BTIC) — V1 data model.
 *
 * This is HLD's institutional memory for a transformation engagement: where the
 * engagement stands, what is complete, which report is the CURRENT truth, which
 * decisions are still owed, what HLD has learned, and which historical versions
 * exist. V1 is READ/REVIEW only — an executive workspace, not a CRM.
 *
 * Honesty contract (Principle 10):
 *   - Every record carries `provenance`: where the fact came from. Nothing here is
 *     invented. Where a value is genuinely unknown, it is stated as unknown — it is
 *     never filled with a plausible guess.
 *   - Reports separate CURRENT truth from HISTORY. A superseded report is never
 *     deleted or overwritten; it is retained and labeled.
 *
 * V1 stores this as a typed content-as-data module (the same pattern as
 * `portal-data.ts`). No new database table is required to read and review a single
 * seeded dossier; when BTIC needs to CAPTURE new records from the UI, an additive
 * migration will be introduced then — see docs/products/hld-btic/README.md. Building
 * write controls now would mean shipping buttons that do not yet control anything,
 * which the operating contract forbids.
 */

// ----------------------------------------------------------------------------
// Entity 1 — Transformation Engagement
// ----------------------------------------------------------------------------

export interface Engagement {
  id: string;
  client: string;
  title: string;
  /** Live status of the engagement itself. */
  status: "active" | "on_hold" | "closed";
  /** Key of the Phase currently in progress (see phases). */
  currentPhaseKey: string;
  summary: string;
  /** Deterministic transformation score, if an assessment exists. */
  transformationScore?: {
    overall: number;
    domains: { label: string; score: number }[];
    provenance: string;
  };
  provenance: string;
}

// ----------------------------------------------------------------------------
// Entity 2 — Phase
// ----------------------------------------------------------------------------

export type PhaseStatus = "complete" | "in_progress" | "not_started";

export interface Phase {
  id: string;
  order: number;
  name: string;
  status: PhaseStatus;
  summary: string;
  provenance: string;
}

// ----------------------------------------------------------------------------
// Entity 3 — Report (with version lifecycle)
// ----------------------------------------------------------------------------

/**
 * A report's place in the truth lifecycle. Exactly the states the operating
 * contract needs to answer "which report is current truth?" without ever
 * discarding history.
 *   draft       — produced, not yet the accepted truth
 *   current     — the accepted current truth for its subject
 *   approved    — current AND signed off by the CEO/owner
 *   superseded  — was current; a newer version replaced it (retained, not deleted)
 *   archived    — retired from the active engagement (retained)
 */
export type ReportStatus = "draft" | "current" | "approved" | "superseded" | "archived";

export interface Report {
  id: string;
  /** Reports sharing a `subject` form one version lineage. */
  subject: string;
  title: string;
  version: string;
  status: ReportStatus;
  /** Key of the report this version supersedes, if any. */
  supersedes?: string;
  summary: string;
  /** Where the report itself lives (chat deliverable, repo doc, PR, …). */
  location: string;
  provenance: string;
}

// ----------------------------------------------------------------------------
// Entity 4 — Executive Decision
// ----------------------------------------------------------------------------

export interface ExecutiveDecision {
  id: string;
  question: string;
  status: "pending" | "resolved";
  /** Why HLD cannot proceed past this without the owner. */
  blocks: string;
  /** What is verified vs. what the owner must confirm. */
  detail: string;
  provenance: string;
}

// ----------------------------------------------------------------------------
// Entity 5 — Artifact Reference
// ----------------------------------------------------------------------------

export interface ArtifactReference {
  id: string;
  kind: "pull_request" | "document" | "preview";
  title: string;
  /** A repo path or PR reference — never a fabricated external URL. */
  reference: string;
  status: string;
  summary: string;
  provenance: string;
}

// ----------------------------------------------------------------------------
// Entity 6 — Intelligence Record (what HLD learned)
// ----------------------------------------------------------------------------

export type Confidence = "verified" | "reported" | "unknown";

export interface IntelligenceRecord {
  id: string;
  category: "capability" | "market" | "risk" | "learning" | "gap";
  headline: string;
  detail: string;
  /**
   * verified — traced to internal repo evidence
   * reported — stated in an internal doc but not independently confirmed
   * unknown  — an explicit gap; recorded so it is not mistaken for known
   */
  confidence: Confidence;
  provenance: string;
}

export interface Dossier {
  engagement: Engagement;
  phases: Phase[];
  reports: Report[];
  decisions: ExecutiveDecision[];
  artifacts: ArtifactReference[];
  intelligence: IntelligenceRecord[];
}

// ============================================================================
// SEED — Venuewise Transformation Dossier
//
// Every field below traces to a verified internal source produced earlier in
// this engagement or already in the repository. Sources are named in each
// record's `provenance`. Where an external fact is not verifiable from inside
// this repository, it is recorded as an `unknown` intelligence record rather
// than guessed.
// ============================================================================

const VENUEWISE_ENGAGEMENT: Engagement = {
  id: "venuewise",
  client: "Venuewise (Home Huddle LLC)",
  title: "Venuewise Business Transformation",
  status: "active",
  currentPhaseKey: "owner_confirmation",
  summary:
    "HLD's transformation engagement for Venuewise — a live Western New York youth-sports scheduling product. Investigation, findings, marketing strategy, launch campaign, founding-partner offer, creative framework, website copy, and a private website preview (PR #29) are complete. The engagement is paused on owner confirmation of commercial terms before any external client review.",
  transformationScore: {
    overall: 47,
    domains: [
      { label: "Business", score: 72 },
      { label: "Growth", score: 50 },
      { label: "Technology", score: 40 },
      { label: "AI readiness", score: 20 },
    ],
    provenance:
      "docs/products/hl-bti-consulting/09-venuewise-internal-case-study.md (deterministic HL-BTI assessment, analysis only).",
  },
  provenance:
    "This engagement's session deliverables + docs/products/reference-implementations/02-venuewise.md.",
};

const VENUEWISE_PHASES: Phase[] = [
  {
    id: "investigation",
    order: 1,
    name: "Business Transformation Investigation",
    status: "complete",
    summary:
      "Investigated Venuewise before recommending anything — market, product, evidence and scope established first.",
    provenance: "Session deliverable: Investigation (Phases 1–9).",
  },
  {
    id: "internal_discovery",
    order: 2,
    name: "Internal Business Discovery",
    status: "complete",
    summary:
      "Six-section internal discovery separating verified facts from items requiring owner confirmation.",
    provenance: "Session deliverable: Internal Business Discovery.",
  },
  {
    id: "evidence_gap",
    order: 3,
    name: "Executive Evidence Gap Interview",
    status: "complete",
    summary:
      "Minimal owner-question set and completion checklist covering the gaps evidence alone could not close.",
    provenance: "Session deliverable: Executive Evidence Gap Interview.",
  },
  {
    id: "findings",
    order: 4,
    name: "Business Transformation Findings",
    status: "complete",
    summary:
      "Diagnosis only, six sections — the evidence-backed picture of where Venuewise stands.",
    provenance: "Session deliverable: Business Transformation Findings.",
  },
  {
    id: "marketing_strategy",
    order: 5,
    name: "Marketing Strategy",
    status: "complete",
    summary: "Constraint-driven marketing strategy, six sections.",
    provenance: "Session deliverable: Venuewise Marketing Strategy.",
  },
  {
    id: "launch_campaign",
    order: 6,
    name: "Launch Marketing Campaign",
    status: "complete",
    summary: "The launch campaign built on the approved strategy.",
    provenance: "Session deliverable: Venuewise Launch Marketing Campaign.",
  },
  {
    id: "founding_partner",
    order: 7,
    name: "Founding Partner Program",
    status: "complete",
    summary:
      "Commercial offer architecture and exclusivity options — terms held for owner confirmation.",
    provenance: "Session deliverable: Founding Partner Program.",
  },
  {
    id: "creative_framework",
    order: 8,
    name: "Creative Asset Framework",
    status: "complete",
    summary: "The 'Back to the Game' creative framework and asset system.",
    provenance: "Session deliverable: Creative Asset Framework.",
  },
  {
    id: "website_copy",
    order: 9,
    name: "Website Copy V1",
    status: "complete",
    summary:
      "First-draft copy for five pages, then revised for emotional impact without adding length.",
    provenance: "Session deliverable: Website Copy V1 (draft + elevated revision).",
  },
  {
    id: "website_preview",
    order: 10,
    name: "Private Website Preview",
    status: "complete",
    summary:
      "A private, non-public static preview of the proposed website with review safeguards, opened as PR #29 for internal review.",
    provenance:
      "PR #29 (branch preview/venuewise-website-transformation-v1); apps/herman-legacy-digital/preview/venuewise-website-transformation-v1/.",
  },
  {
    id: "owner_confirmation",
    order: 11,
    name: "Owner Confirmation",
    status: "in_progress",
    summary:
      "The engagement is paused here. Four commercial confirmations are owed before external client review can proceed; nothing is invented in their place.",
    provenance:
      "PR #29 README 'Unresolved placeholders'; Executive Evidence Gap Interview.",
  },
];

const VENUEWISE_REPORTS: Report[] = [
  {
    id: "assessment_v1",
    subject: "transformation_assessment",
    title: "Venuewise Internal Transformation Assessment",
    version: "bti-consulting-0.1.0",
    status: "current",
    summary:
      "Deterministic HL-BTI assessment. Transformation Score 47/100 (Business 72, Growth 50, Technology 40, AI readiness 20). Analysis only — no proposal or billing.",
    location: "docs/products/hl-bti-consulting/09-venuewise-internal-case-study.md",
    provenance: "Generated by @hl-bos/bti-engine consulting framework (deterministic).",
  },
  {
    id: "website_copy_draft",
    subject: "website_copy",
    title: "Website Copy V1 — first draft",
    version: "1.0-draft",
    status: "superseded",
    summary:
      "First full-draft copy for Homepage, Founding Families, Founding Partner, Organizations, and Coaches. Retained as history — superseded by the elevated revision.",
    location: "Session deliverable (chat).",
    provenance: "Session deliverable: Website Copy V1 first drafts.",
  },
  {
    id: "website_copy_elevated",
    subject: "website_copy",
    title: "Website Copy V1 — elevated",
    version: "1.1-elevated",
    status: "current",
    supersedes: "website_copy_draft",
    summary:
      "The same five pages revised for emotional impact ('people buy a better life') without increasing length. This is the current copy truth and the copy executed in the PR #29 preview.",
    location:
      "apps/herman-legacy-digital/preview/venuewise-website-transformation-v1/ (as executed).",
    provenance: "Session deliverable: Website Copy V1 elevated revision.",
  },
  {
    id: "marketing_strategy_v1",
    subject: "marketing_strategy",
    title: "Venuewise Marketing Strategy",
    version: "1.0",
    status: "current",
    summary: "Constraint-driven marketing strategy across six sections.",
    location: "Session deliverable (chat).",
    provenance: "Session deliverable: Venuewise Marketing Strategy.",
  },
  {
    id: "launch_campaign_v1",
    subject: "launch_campaign",
    title: "Venuewise Launch Marketing Campaign",
    version: "1.0",
    status: "current",
    summary: "The launch campaign built on the approved marketing strategy.",
    location: "Session deliverable (chat).",
    provenance: "Session deliverable: Venuewise Launch Marketing Campaign.",
  },
  {
    id: "founding_partner_v1",
    subject: "founding_partner_program",
    title: "Founding Partner Program",
    version: "1.0",
    status: "current",
    summary:
      "Commercial offer architecture with exclusivity options. Terms remain subject to owner confirmation (see Decisions).",
    location: "Session deliverable (chat).",
    provenance: "Session deliverable: Founding Partner Program.",
  },
];

const VENUEWISE_DECISIONS: ExecutiveDecision[] = [
  {
    id: "schedule_sources",
    question: "Which schedule sources are supported at launch?",
    status: "pending",
    blocks:
      "Integration claims on the website and in the campaign cannot be stated until confirmed.",
    detail:
      "LeagueApps integration is evidenced internally. GameChanger and TeamSnap are unverified. All are shown as 'TO BE CONFIRMED' in the preview rather than claimed.",
    provenance:
      "PR #29 README 'Unresolved placeholders'; Venuewise capability/backend harvest.",
  },
  {
    id: "founding_benefits",
    question:
      "What are the Founding Family benefits and how long does the period last?",
    status: "pending",
    blocks: "The Founding Families page cannot state its offer until confirmed.",
    detail:
      "Benefits and duration for the founding period are not set. Held as 'TO BE CONFIRMED'; not invented.",
    provenance: "PR #29 README 'Unresolved placeholders' (Families).",
  },
  {
    id: "post_founding_pricing",
    question: "What is the pricing after the founding period?",
    status: "pending",
    blocks: "No page may state price; every commercial figure stays placeheld.",
    detail:
      "Post-founding pricing is undetermined across all pages. Shown as 'TO BE CONFIRMED'.",
    provenance: "PR #29 README 'Unresolved placeholders' (all pages).",
  },
  {
    id: "partner_terms",
    question:
      "What are the Founding Partner terms — pricing, exclusivity, and advisory role?",
    status: "pending",
    blocks:
      "Partner, Organizations, and Coaches pages cannot state partnership terms until confirmed.",
    detail:
      "Founding Partner pricing, exclusivity, and advisory terms are not set. Held as 'TO BE CONFIRMED'.",
    provenance:
      "PR #29 README 'Unresolved placeholders' (Partner / Organizations / Coaches).",
  },
];

const VENUEWISE_ARTIFACTS: ArtifactReference[] = [
  {
    id: "pr_29",
    kind: "pull_request",
    title: "Venuewise Website Preview — Transformation v1 (private, not live)",
    reference: "PR #29 · branch preview/venuewise-website-transformation-v1",
    status: "Open — awaiting owner confirmation before external review",
    summary:
      "A private, non-public static preview of the proposed website. Not merged, not deployed, no DNS change, no production connection. Every CTA is inert; every page carries a 'Not Live' ribbon and noindex.",
    provenance:
      "apps/herman-legacy-digital/preview/venuewise-website-transformation-v1/README.md.",
  },
  {
    id: "assessment_doc",
    kind: "document",
    title: "Venuewise Internal Transformation Assessment",
    reference: "docs/products/hl-bti-consulting/09-venuewise-internal-case-study.md",
    status: "In repository",
    summary:
      "The deterministic HL-BTI assessment behind the 47/100 Transformation Score.",
    provenance: "Repository document.",
  },
  {
    id: "capability_harvest",
    kind: "document",
    title: "Venuewise Capability & Backend Harvest",
    reference:
      "docs/products/venuewise-capability-harvest/, docs/products/venuewise-backend-harvest/",
    status: "In repository",
    summary:
      "Evidence, scope, capability matrix and backend/commercialization inventory for Venuewise.",
    provenance: "Repository documents.",
  },
];

const VENUEWISE_INTELLIGENCE: IntelligenceRecord[] = [
  {
    id: "capability_reuse",
    category: "capability",
    headline: "~86% of Venuewise capabilities map to reusable HL-BOS building blocks",
    detail:
      "Venuewise is a reference implementation: the large majority of its capabilities correspond to existing HL-BOS building blocks, which is why an HLD engagement can move quickly.",
    confidence: "verified",
    provenance: "docs/products/reference-implementations/02-venuewise.md.",
  },
  {
    id: "live_product",
    category: "capability",
    headline: "Venuewise is a live product on a mature, RLS-secured backend",
    detail:
      "The product runs on a Supabase backend with 73 migrations and row-level security, with Stripe live for payments — it is operating, not a prototype.",
    confidence: "verified",
    provenance:
      "docs/products/venuewise-backend-harvest/00-database-inventory.md, 03-commercialization-and-maturity.md.",
  },
  {
    id: "ai_gap",
    category: "gap",
    headline: "AI readiness is the critical gap (20/100)",
    detail:
      "The lowest-rated domain by a wide margin. AI Search Optimization, AI Assistants, and Internal AI Workflows are the three critical findings driving the priorities.",
    confidence: "verified",
    provenance: "docs/products/hl-bti-consulting/09-venuewise-internal-case-study.md.",
  },
  {
    id: "conversion_growth",
    category: "risk",
    headline: "Conversion and lead generation are the near-term growth constraints",
    detail:
      "Both scored low (2/5) and are flagged as materially holding back results this quarter — the growth side of the transformation, distinct from the AI gaps.",
    confidence: "verified",
    provenance: "docs/products/hl-bti-consulting/09-venuewise-internal-case-study.md.",
  },
  {
    id: "external_baselines_unknown",
    category: "gap",
    headline: "External market baselines are NOT known",
    detail:
      "Competitive/market baselines for Venuewise were not verifiable from inside this repository. This is recorded as an explicit gap so it is never mistaken for a known figure. Commercial terms remain owner-confirmed, not assumed.",
    confidence: "unknown",
    provenance:
      "docs/products/reference-implementations/02-venuewise.md (baselines pending); this engagement's evidence-gap interview.",
  },
  {
    id: "honesty_discipline",
    category: "learning",
    headline: "Unresolved commercial terms were held, never invented",
    detail:
      "Across copy, campaign and offer, HLD held every unconfirmed figure (pricing, benefits, exclusivity, integrations) as a visible placeholder rather than guessing. That discipline is why the preview is safe to review with the owner.",
    confidence: "verified",
    provenance:
      "PR #29 README; owner-confirmation directive (declined to fill blank template fields).",
  },
];

const VENUEWISE_DOSSIER: Dossier = {
  engagement: VENUEWISE_ENGAGEMENT,
  phases: VENUEWISE_PHASES,
  reports: VENUEWISE_REPORTS,
  decisions: VENUEWISE_DECISIONS,
  artifacts: VENUEWISE_ARTIFACTS,
  intelligence: VENUEWISE_INTELLIGENCE,
};

const DOSSIERS: Record<string, Dossier> = {
  venuewise: VENUEWISE_DOSSIER,
};

// ----------------------------------------------------------------------------
// Read API (pure) — the only way the views touch the data.
// ----------------------------------------------------------------------------

/** All engagements known to BTIC (V1: one). */
export function engagements(): Engagement[] {
  return Object.values(DOSSIERS).map((d) => d.engagement);
}

/** The full dossier for one engagement, or null. */
export function dossier(id: string): Dossier | null {
  return DOSSIERS[id] ?? null;
}

/** Phases in display order. */
export function orderedPhases(d: Dossier): Phase[] {
  return [...d.phases].sort((a, b) => a.order - b.order);
}

/** The phase currently in progress, if any. */
export function currentPhase(d: Dossier): Phase | null {
  return d.phases.find((p) => p.id === d.engagement.currentPhaseKey) ?? null;
}

/**
 * The CURRENT truth for a subject: the single `current` or `approved` report in a
 * version lineage. Superseded/archived/draft reports are never returned here — but
 * they are never deleted either (see `historyFor`).
 */
export function currentReportFor(d: Dossier, subject: string): Report | null {
  return (
    d.reports.find(
      (r) =>
        r.subject === subject && (r.status === "current" || r.status === "approved"),
    ) ?? null
  );
}

/** Every report in a subject's lineage, newest-truth first, history retained. */
export function historyFor(d: Dossier, subject: string): Report[] {
  const rank: Record<ReportStatus, number> = {
    approved: 0,
    current: 1,
    draft: 2,
    superseded: 3,
    archived: 4,
  };
  return d.reports
    .filter((r) => r.subject === subject)
    .sort((a, b) => rank[a.status] - rank[b.status]);
}

/** Distinct report subjects (version lineages) in the dossier. */
export function reportSubjects(d: Dossier): string[] {
  return [...new Set(d.reports.map((r) => r.subject))];
}

/** True only when a subject's lineage has exactly one accepted current truth. */
export function reportTruthIsUnambiguous(d: Dossier, subject: string): boolean {
  const accepted = d.reports.filter(
    (r) => r.subject === subject && (r.status === "current" || r.status === "approved"),
  );
  return accepted.length === 1;
}

export function pendingDecisions(d: Dossier): ExecutiveDecision[] {
  return d.decisions.filter((x) => x.status === "pending");
}
