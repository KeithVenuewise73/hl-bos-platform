/**
 * @hl-bos/bte-pipeline — core domain types.
 *
 * This is the DB-agnostic contract for the Business Transformation Engine (BTE)
 * automated intake pipeline. It deliberately depends on NOTHING but
 * @hl-bos/bti-engine: no database, no network, no clock, no secrets. Everything
 * time-, IO- or persistence-bound is supplied through the adapters in
 * `adapters.ts`, so the whole pipeline is deterministic and unit-testable.
 *
 * Honesty contract (platform Principle 10): nothing here fabricates a result. A
 * finding whose evidence could not be observed is labelled `unavailable`, not
 * guessed; a blocked website is recorded as `blocked`, never as "clean". A
 * generated report is always `draft_ai_generated` and is NEVER delivered to a
 * client by this pipeline (V1).
 */

// ---------------------------------------------------------------------------
// Normalized intake
//
// The shape the pipeline consumes. It maps 1:1 from the Business Transformation
// Digital Intake (BTDI) submission payload (contact + sections) but does NOT
// import that module, so this core carries no dependency on the (as of now
// unmerged) BTDI front door. `submissionRef` is the human reference the intake
// RPC returns (e.g. "HLD-BT-AB12CD"); `submissionId` is the stored row id.
// ---------------------------------------------------------------------------

export interface IntakeContact {
  businessName: string;
  primaryContact: string;
  email: string;
  phone?: string;
}

export interface NormalizedIntake {
  /** Stable id of the stored intake submission (uuid in the DB). */
  submissionId: string;
  /** Human-facing reference code shown to the client. */
  submissionRef: string;
  contact: IntakeContact;
  /** Submitted website URL, if any. Target clients often have none. */
  website?: string;
  industry?: string;
  businessStage?: string;
  /** The client's own words for their primary challenge. */
  mainChallenge?: string;
  ninetyDayGoal?: string;
  growthPriority?: string;
  /** Public social links the client supplied (client-supplied evidence). */
  socialLinks?: string[];
  /** Whether the client consented to a public/external review of their footprint. */
  consentPublicReview: boolean;
  /** ISO-8601 timestamp string; supplied, never read from a live clock here. */
  submittedAt: string;
}

// ---------------------------------------------------------------------------
// Processing states — the truthful lifecycle of one automated engagement.
// ---------------------------------------------------------------------------

export type ProcessingState =
  | "received"
  | "evidence_collection_pending"
  | "evidence_collection_running"
  | "analysis_pending"
  | "analysis_running"
  | "report_generation_running"
  | "hld_review_required"
  | "clarification_required"
  | "approved"
  | "client_ready"
  | "failed"
  | "archived";

/** A single, append-only entry on the engagement's processing timeline. */
export interface TimelineEntry {
  state: ProcessingState;
  at: string;
  /** Plain-language note for the BTIC timeline. */
  note: string;
  /** Where this fact came from (Principle 10 provenance). */
  provenance: string;
}

// ---------------------------------------------------------------------------
// Evidence — what the pipeline could and could not observe.
// ---------------------------------------------------------------------------

/**
 * The truthful status of one piece of evidence.
 *   collected           — observed first-hand from a reachable source
 *   blocked             — the source exists but denied automated access
 *   unavailable         — nothing to observe (e.g. no website supplied)
 *   client_supplied     — provided by the client, not independently verified
 *   requires_human_review — observed but needs a person to interpret/confirm
 */
export type EvidenceStatus =
  "collected" | "blocked" | "unavailable" | "client_supplied" | "requires_human_review";

export interface EvidenceRecord {
  /** Stable key, e.g. "website.homepage", "social.links". */
  key: string;
  label: string;
  status: EvidenceStatus;
  /** Human-readable observed detail; empty when not collected. */
  detail: string;
  source: string;
  observedAt: string;
}

// ---------------------------------------------------------------------------
// Findings — every BTE finding carries an explicit confidence + provenance.
// ---------------------------------------------------------------------------

/**
 * Confidence in a finding, per the CEO directive's evidence model:
 *   verified          — traced to first-hand observed evidence (a FACT)
 *   inferred          — a defensible inference from evidence, labelled as such
 *   needs_confirmation— stated by the client / an opinion the owner must confirm
 *   unavailable       — could not be observed; recorded as a gap, not a guess
 */
export type FindingConfidence =
  "verified" | "inferred" | "needs_confirmation" | "unavailable";

export type FindingCategory =
  | "digital_presence"
  | "seo"
  | "technology"
  | "growth"
  | "operations"
  | "market"
  | "risk";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface BteFinding {
  title: string;
  category: FindingCategory;
  /** The observed evidence this finding rests on. */
  evidence: string;
  evidenceSource: string;
  confidence: FindingConfidence;
  businessImpact: string;
  severity: Severity;
  provenance: string;
}

export interface ConfidenceSummary {
  verified: number;
  inferred: number;
  needsConfirmation: number;
  unavailable: number;
}

// ---------------------------------------------------------------------------
// Initial report — the concise, versioned first report (11 sections).
// ---------------------------------------------------------------------------

export type ReportStatus =
  "draft_ai_generated" | "current" | "approved" | "superseded" | "archived";

export interface ReportSection {
  key: string;
  title: string;
  body: string;
  /** False when a section has no real data — it says so and says why. */
  hasData: boolean;
}

export interface InitialReport {
  /** Reports sharing a `subject` form one version lineage. */
  subject: string;
  version: number;
  status: ReportStatus;
  title: string;
  generatedFor: string;
  generatedAt: string;
  engineVersion: string;
  sections: ReportSection[];
  findings: BteFinding[];
  confidence: ConfidenceSummary;
  /** Key of the report version this one supersedes, if any. */
  supersedes?: string;
}

// ---------------------------------------------------------------------------
// Notification + acknowledgment records — outcomes the pipeline records but
// never fakes. Delivery is attempted by adapters; failure stays visible.
// ---------------------------------------------------------------------------

export type DeliveryOutcome = "sent" | "queued" | "failed" | "skipped";

export interface NotificationRecord {
  channel: string;
  outcome: DeliveryOutcome;
  /** Populated on failure; kept so BTIC can show + retry it. */
  failureReason?: string;
  attempts: number;
  lastAttemptAt: string;
  /** The internal BTIC deep-link the notification points at. */
  internalLink: string;
}

export interface AcknowledgmentRecord {
  channel: string;
  outcome: DeliveryOutcome;
  failureReason?: string;
  attempts: number;
  lastAttemptAt: string;
  /** Proof the pipeline did NOT attach the full report to the client. */
  fullReportIncluded: false;
}

// ---------------------------------------------------------------------------
// Engagement — the aggregate the pipeline produces for BTIC.
// ---------------------------------------------------------------------------

export interface FailureInfo {
  state: ProcessingState;
  reason: string;
  retryCount: number;
  lastRetryAt?: string;
  /** The next action a human/worker should take. Never silently discarded. */
  nextAction: string;
}

export interface EngagementResult {
  engagementId: string;
  submissionRef: string;
  business: string;
  state: ProcessingState;
  timeline: TimelineEntry[];
  evidence: EvidenceRecord[];
  report: InitialReport | null;
  notification: NotificationRecord | null;
  acknowledgment: AcknowledgmentRecord | null;
  failure: FailureInfo | null;
  /** V1 invariant: the pipeline NEVER makes the full report client-ready. */
  clientReportDelivered: false;
  nextAction: string;
  internalLink: string;
}
