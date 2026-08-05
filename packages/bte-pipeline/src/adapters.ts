/**
 * Ports (adapters) — the ONLY places this pipeline touches the outside world.
 *
 * In production each port binds to an EXISTING HL-BOS primitive (see the
 * integration plan in docs/products/hld-bte-intake). This core ships an
 * in-memory reference implementation used by the tests and the internal
 * preview; it invents no schema and sends nothing.
 *
 *   SiteFetcher        -> discovery.request_website_scan / _shared/discovery/scan.ts
 *   EngagementStore    -> bti.engagements + bti.analysis_snapshots + BTIC capture
 *   Notifier (Keith)   -> comms.request_message + events.emit('bte.report.ready')
 *   Acknowledger       -> comms.request_message (email; transport CEO-gated)
 *   Auditor            -> audit.emit / audit.log_security_event
 *   Clock / Ids        -> injected so the core stays deterministic + testable
 */

import type { SiteFetchResult } from "./evidence.ts";
import type {
  AcknowledgmentRecord,
  DeliveryOutcome,
  EngagementResult,
  InitialReport,
  NormalizedIntake,
  NotificationRecord,
  ProcessingState,
  TimelineEntry,
} from "./types.ts";

export interface DeliveryResult {
  outcome: DeliveryOutcome;
  failureReason?: string;
}

export interface KeithNotification {
  business: string;
  primaryContact: string;
  industry: string;
  website: string;
  clientStatedChallenge: string;
  bteIdentifiedPrimaryConstraint: string;
  confidenceSummary: string;
  criticalRisk: string | null;
  internalLink: string;
  requiredNextAction: string;
}

export interface Clock {
  nowIso(): string;
}

export interface IdFactory {
  /** Deterministic-in-tests id for an engagement, derived from the intake. */
  engagementId(intake: NormalizedIntake): string;
}

export interface SiteFetcher {
  fetchSite(intake: NormalizedIntake): Promise<SiteFetchResult>;
}

export interface Notifier {
  notifyKeith(n: KeithNotification): Promise<DeliveryResult>;
}

export interface Acknowledger {
  acknowledgeClient(intake: NormalizedIntake): Promise<DeliveryResult>;
}

export interface Auditor {
  record(event: {
    engagementId: string;
    state: ProcessingState;
    action: string;
    at: string;
  }): void;
}

/** The full set of ports the pipeline needs. */
export interface PipelineAdapters {
  clock: Clock;
  ids: IdFactory;
  fetcher: SiteFetcher;
  notifier: Notifier;
  acknowledger: Acknowledger;
  auditor?: Auditor;
}

// ---------------------------------------------------------------------------
// In-memory reference store (tests + internal preview). Not a production store.
// ---------------------------------------------------------------------------

export interface StoredEngagement {
  engagement: EngagementResult;
  reports: InitialReport[];
  timeline: TimelineEntry[];
}

export class InMemoryEngagementStore {
  private readonly byId = new Map<string, StoredEngagement>();

  upsert(result: EngagementResult, reports: InitialReport[]): void {
    this.byId.set(result.engagementId, {
      engagement: result,
      reports: [...reports],
      timeline: [...result.timeline],
    });
  }

  get(id: string): StoredEngagement | null {
    return this.byId.get(id) ?? null;
  }

  all(): StoredEngagement[] {
    return [...this.byId.values()];
  }
}

// ---------------------------------------------------------------------------
// Reference adapters. Deterministic; no clock, no network, no send.
// ---------------------------------------------------------------------------

/** A clock that returns a fixed instant — deterministic tests + previews. */
export function fixedClock(iso: string): Clock {
  return { nowIso: () => iso };
}

/** Deterministic ids from the intake reference (no randomness). */
export const referenceIds: IdFactory = {
  engagementId: (intake) =>
    `eng_${intake.submissionRef.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`,
};

/** A fetcher backed by a fixed map of URL -> outcome (tests/preview). */
export function scriptedFetcher(
  script: (intake: NormalizedIntake) => SiteFetchResult,
): SiteFetcher {
  return { fetchSite: (intake) => Promise.resolve(script(intake)) };
}

/** A notifier that always succeeds — the happy path. */
export const succeedingNotifier: Notifier = {
  notifyKeith: () => Promise.resolve({ outcome: "sent" }),
};

/** A notifier that always fails — to prove failure stays visible + retryable. */
export function failingNotifier(reason: string): Notifier {
  return {
    notifyKeith: () => Promise.resolve({ outcome: "failed", failureReason: reason }),
  };
}

/**
 * The truthful acknowledger for V1: the email transport is not yet configured
 * (a CEO credential decision), so the acknowledgment is QUEUED, not "sent". It
 * never claims a delivery that did not happen, and never attaches the report.
 */
export const queueingAcknowledger: Acknowledger = {
  acknowledgeClient: () => Promise.resolve({ outcome: "queued" }),
};

export function buildNotificationRecord(
  result: DeliveryResult,
  internalLink: string,
  at: string,
  attempts: number,
): NotificationRecord {
  return {
    channel: "internal+email",
    outcome: result.outcome,
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    attempts,
    lastAttemptAt: at,
    internalLink,
  };
}

export function buildAcknowledgmentRecord(
  result: DeliveryResult,
  at: string,
  attempts: number,
): AcknowledgmentRecord {
  return {
    channel: "email",
    outcome: result.outcome,
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    attempts,
    lastAttemptAt: at,
    fullReportIncluded: false,
  };
}
