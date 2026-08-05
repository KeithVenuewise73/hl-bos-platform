/**
 * The BTE automated intake pipeline — orchestration.
 *
 * Walks the truthful state machine from `received` to `hld_review_required`,
 * collecting evidence, analyzing, generating a versioned draft report, notifying
 * Keith and acknowledging the client. Every outside effect goes through an
 * injected adapter, so this function is deterministic and unit-testable.
 *
 * Invariants it enforces:
 *   - No failure silently discards the intake. Every failure returns a visible
 *     `failed` engagement with a reason, retry count and next action.
 *   - The generated report is always `draft_ai_generated` and never delivered
 *     to the client (`clientReportDelivered` is the literal `false`).
 *   - Notification/acknowledgment failures are non-fatal and stay retryable.
 *   - A prior approved report is never overwritten (see versioning.placeReport).
 */

import { collectEvidence } from "./evidence.ts";
import { buildReport, type BuildReportInput, type BuiltReport } from "./report.ts";
import { placeReport } from "./versioning.ts";
import { nextActionFor } from "./states.ts";
import {
  buildAcknowledgmentRecord,
  buildNotificationRecord,
  type DeliveryResult,
  type KeithNotification,
  type PipelineAdapters,
} from "./adapters.ts";
import type {
  BteFinding,
  EngagementResult,
  FailureInfo,
  InitialReport,
  NormalizedIntake,
  ProcessingState,
  TimelineEntry,
} from "./types.ts";

export interface RunOptions {
  /** Prior report lineage for this engagement's subject (for versioning). */
  existingReports?: readonly InitialReport[];
  /** Set when an upstream duplicate-guard matched an existing submission. */
  duplicateOfEngagementId?: string | null;
  /** Override the analyzer to exercise provider-failure handling in tests. */
  buildReport?: (input: BuildReportInput) => BuiltReport;
}

const REQUIRED_FIELDS: readonly (keyof NormalizedIntake["contact"])[] = [
  "businessName",
  "primaryContact",
  "email",
];

class PipelineFailure extends Error {
  constructor(
    readonly state: ProcessingState,
    readonly reason: string,
    readonly nextAction: string,
  ) {
    super(reason);
    this.name = "PipelineFailure";
  }
}

export async function runIntakePipeline(
  intake: NormalizedIntake,
  adapters: PipelineAdapters,
  options: RunOptions = {},
): Promise<EngagementResult> {
  const { clock, ids, fetcher, notifier, acknowledger, auditor } = adapters;
  const analyze = options.buildReport ?? buildReport;
  const engagementId = ids.engagementId(intake);
  const internalLink = `/intelligence/${engagementId}`;

  const timeline: TimelineEntry[] = [];
  const push = (state: ProcessingState, note: string, provenance: string): void => {
    const at = clock.nowIso();
    timeline.push({ state, at, note, provenance });
    auditor?.record({ engagementId, state, action: note, at });
  };

  push("received", "Intake received; engagement created.", "bte-pipeline");
  if (options.duplicateOfEngagementId) {
    // A duplicate is never discarded — it is linked and flagged for review.
    push(
      "received",
      `Possible duplicate of engagement ${options.duplicateOfEngagementId}; linked for HLD review, not discarded.`,
      "duplicate-guard",
    );
  }

  try {
    // --- Guard: required intake fields -------------------------------------
    for (const field of REQUIRED_FIELDS) {
      if (!intake.contact[field] || intake.contact[field].trim() === "") {
        throw new PipelineFailure(
          "received",
          `missing required intake field: ${field}`,
          "Request the missing field from the client; the intake is retained.",
        );
      }
    }

    // --- Evidence collection ----------------------------------------------
    push(
      "evidence_collection_pending",
      nextActionFor("evidence_collection_pending"),
      "bte-pipeline",
    );
    push(
      "evidence_collection_running",
      nextActionFor("evidence_collection_running"),
      "bte-pipeline",
    );

    let fetchResult;
    try {
      fetchResult = await fetcher.fetchSite(intake);
    } catch (err) {
      throw new PipelineFailure(
        "evidence_collection_running",
        `evidence collector error: ${errMessage(err)}`,
        "Retry evidence collection; the intake and engagement are retained.",
      );
    }
    const at = clock.nowIso();
    const evidence = collectEvidence(intake, fetchResult, at);

    // --- Analysis ----------------------------------------------------------
    push("analysis_pending", nextActionFor("analysis_pending"), "bte-pipeline");
    push("analysis_running", nextActionFor("analysis_running"), "bte-pipeline");

    let built: BuiltReport;
    try {
      built = analyze({
        intake,
        evidence,
        ...(fetchResult.outcome === "ok" && fetchResult.html !== undefined
          ? { html: fetchResult.html }
          : {}),
        generatedAt: clock.nowIso(),
        version: 1,
      });
    } catch (err) {
      throw new PipelineFailure(
        "analysis_running",
        `analysis provider error: ${errMessage(err)}`,
        "Retry analysis; collected evidence and intake are retained.",
      );
    }

    // --- Report generation + versioning ------------------------------------
    push(
      "report_generation_running",
      nextActionFor("report_generation_running"),
      "bte-pipeline",
    );
    const place = placeReport(options.existingReports ?? [], built.report);
    const report = place.placed;

    // --- Notify Keith (non-fatal) ------------------------------------------
    const criticalRisk = pickCriticalRisk(report.findings);
    const notification = buildNotificationRecord(
      await safeDeliver(() =>
        notifier.notifyKeith(
          toKeithNotification(intake, report, built, criticalRisk, internalLink),
        ),
      ),
      internalLink,
      clock.nowIso(),
      1,
    );

    // --- Acknowledge the client (non-fatal; never includes the report) -----
    const acknowledgment = buildAcknowledgmentRecord(
      await safeDeliver(() => acknowledger.acknowledgeClient(intake)),
      clock.nowIso(),
      1,
    );

    // --- Hand off to HLD review -------------------------------------------
    push("hld_review_required", nextActionFor("hld_review_required"), "bte-pipeline");

    return {
      engagementId,
      submissionRef: intake.submissionRef,
      business: intake.contact.businessName,
      state: "hld_review_required",
      timeline,
      evidence: evidence.records,
      report,
      notification,
      acknowledgment,
      failure: null,
      clientReportDelivered: false,
      nextAction: nextActionFor("hld_review_required"),
      internalLink,
    };
  } catch (err) {
    if (err instanceof PipelineFailure) {
      push("failed", err.reason, "bte-pipeline");
      const failure: FailureInfo = {
        state: err.state,
        reason: err.reason,
        retryCount: 0,
        nextAction: err.nextAction,
      };
      return {
        engagementId,
        submissionRef: intake.submissionRef,
        business: intake.contact.businessName,
        state: "failed",
        timeline,
        evidence: [],
        report: null,
        notification: null,
        acknowledgment: null,
        failure,
        clientReportDelivered: false,
        nextAction: err.nextAction,
        internalLink,
      };
    }
    throw err;
  }
}

/**
 * Re-attempt a failed Keith notification without touching the report. Returns a
 * fresh notification record with an incremented attempt count — proof that a
 * delivery failure stays retryable and the report is retained.
 */
export async function retryNotification(
  engagement: EngagementResult,
  intake: NormalizedIntake,
  report: InitialReport,
  built: BuiltReport,
  adapters: PipelineAdapters,
): Promise<EngagementResult> {
  const priorAttempts = engagement.notification?.attempts ?? 0;
  const criticalRisk = pickCriticalRisk(report.findings);
  const result = await safeDeliver(() =>
    adapters.notifier.notifyKeith(
      toKeithNotification(intake, report, built, criticalRisk, engagement.internalLink),
    ),
  );
  const notification = buildNotificationRecord(
    result,
    engagement.internalLink,
    adapters.clock.nowIso(),
    priorAttempts + 1,
  );
  return { ...engagement, notification };
}

// --- helpers ---------------------------------------------------------------

function toKeithNotification(
  intake: NormalizedIntake,
  report: InitialReport,
  built: BuiltReport,
  criticalRisk: BteFinding | null,
  internalLink: string,
): KeithNotification {
  return {
    business: intake.contact.businessName,
    primaryContact: intake.contact.primaryContact,
    industry: intake.industry ?? "unspecified",
    website: intake.website ?? "none supplied",
    clientStatedChallenge: intake.mainChallenge ?? "not stated",
    bteIdentifiedPrimaryConstraint:
      built.primaryConstraint?.title ?? "not yet established",
    confidenceSummary:
      `${report.confidence.verified} verified / ${report.confidence.inferred} inferred / ` +
      `${report.confidence.needsConfirmation} need confirmation / ${report.confidence.unavailable} unavailable`,
    criticalRisk: criticalRisk ? criticalRisk.title : null,
    internalLink,
    requiredNextAction: "Review the draft report and decide what becomes client-ready.",
  };
}

function pickCriticalRisk(findings: readonly BteFinding[]): BteFinding | null {
  return (
    findings.find((f) => f.severity === "critical" && f.confidence !== "unavailable") ??
    null
  );
}

async function safeDeliver(fn: () => Promise<DeliveryResult>): Promise<DeliveryResult> {
  try {
    return await fn();
  } catch (err) {
    return { outcome: "failed", failureReason: errMessage(err) };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
