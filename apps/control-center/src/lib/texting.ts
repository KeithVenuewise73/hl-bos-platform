import type { Health } from "./health";
import { explain, type Owner } from "./translate";

/**
 * HomeHuddle text-message delivery alarm.
 *
 * Why this lives here and not in a text: HomeHuddle's own "texts are failing"
 * alert was itself sent by text, so when Twilio stopped accepting messages on
 * 2026-08-23 the alert failed with everything else and nobody saw it for a
 * month. An alarm must never depend on the thing it is watching. The console
 * reads the outbox directly, so it sees the failure whatever state Twilio is in.
 *
 * This file is pure: it turns a summary of the outbox into a verdict. The live
 * read is in ./texting-live.ts.
 */

/** One row summarising `public.sms_outbox`. Produced by TEXTING_SUMMARY_SQL. */
export interface OutboxSummary {
  total: number;
  /** Most recent successful send, or null if none ever succeeded. */
  last_sent_at: string | null;
  /** Outcome of the newest finished row: 'sent' | 'failed' | null. */
  latest_outcome: string | null;
  /** Failed rows created after the last successful send. */
  failed_since: number;
  /** When the current run of failures began. */
  failing_since: string | null;
  /** Provider error on the newest failed row. */
  latest_error: string | null;
  pending: number;
  oldest_pending: string | null;
  /** Newest row of any status -- proves the scheduler is still producing texts. */
  newest_row_at: string | null;
}

/**
 * Read-only. Every reference is schema-qualified because the Management API's
 * read-only endpoint requires it. Rows marked 'skipped' (the family opted out)
 * are neither successes nor failures and are ignored.
 */
export const TEXTING_SUMMARY_SQL = `
with last_ok as (
  select max(sent_at) as t from public.sms_outbox where status = 'sent'
)
select
  (select count(*) from public.sms_outbox)::int as total,
  (select t from last_ok) as last_sent_at,
  (select status from public.sms_outbox
     where status in ('sent', 'failed')
     order by created_at desc limit 1) as latest_outcome,
  (select count(*) from public.sms_outbox
     where status = 'failed'
       and created_at > coalesce((select t from last_ok), '-infinity'))::int as failed_since,
  (select min(created_at) from public.sms_outbox
     where status = 'failed'
       and created_at > coalesce((select t from last_ok), '-infinity')) as failing_since,
  (select error from public.sms_outbox
     where status = 'failed' order by created_at desc limit 1) as latest_error,
  (select count(*) from public.sms_outbox where status = 'pending')::int as pending,
  (select min(created_at) from public.sms_outbox where status = 'pending') as oldest_pending,
  (select max(created_at) from public.sms_outbox) as newest_row_at
`;

export interface TextingAssessment {
  health: Health;
  /** One sentence. */
  headline: string;
  /** The numbers behind the verdict, in words. */
  summary: string;
  /** Why it is failing and what happens next. Absent when healthy. */
  reason?: string;
  /** Who has to act. Absent when nothing needs doing. */
  owner?: Owner;
  /** Raw provider error, for the engineer. */
  detail?: string;
}

/** The sender runs every 2 minutes and gives up after 3 tries. */
const STUCK_AFTER_MIN = 15;
/** The nightly reminder and the daily digest each enqueue at least one text a day. */
const SILENT_AFTER_HOURS = 36;

const TZ = "America/New_York";

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function daysBetween(fromIso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function assessTexting(s: OutboxSummary, now: Date): TextingAssessment {
  if (s.total === 0) {
    return {
      health: "unknown",
      headline: "HomeHuddle has not tried to send any texts yet.",
      summary: "There is nothing to judge, so this is not shown as healthy.",
    };
  }

  if (s.latest_outcome === "failed") {
    const why = explain(s.latest_error ?? "");
    const since = s.failing_since ? ` since ${formatWhen(s.failing_since)}` : "";
    const lastOk = s.last_sent_at
      ? `The last text that got through was ${formatWhen(s.last_sent_at)} (${daysBetween(s.last_sent_at, now)} days ago).`
      : "No text has ever been delivered.";
    return {
      health: "red",
      headline: "HomeHuddle texts are not reaching families.",
      summary: `${s.failed_since} text${s.failed_since === 1 ? " has" : "s have"} failed${since}. ${lastOk}`,
      reason: `${why.headline} ${why.meaning}`,
      owner: why.owner,
      detail: why.detail,
    };
  }

  if (
    s.pending > 0 &&
    s.oldest_pending &&
    now.getTime() - new Date(s.oldest_pending).getTime() > STUCK_AFTER_MIN * 60_000
  ) {
    const mins = Math.round(
      (now.getTime() - new Date(s.oldest_pending).getTime()) / 60_000,
    );
    return {
      health: "red",
      headline: "HomeHuddle texts are queued but not going out.",
      summary: `${s.pending} text${s.pending === 1 ? " is" : "s are"} waiting; the oldest has waited ${mins} minutes. They normally leave within 2.`,
      reason:
        "The job that sends queued texts has stopped running. Nothing has failed at Twilio; the texts are simply never being handed over. Your AI engineer fixes this.",
      owner: "ai-engineer",
    };
  }

  if (
    s.newest_row_at &&
    now.getTime() - new Date(s.newest_row_at).getTime() > SILENT_AFTER_HOURS * 3_600_000
  ) {
    return {
      health: "yellow",
      headline: "HomeHuddle has not tried to send a text recently.",
      summary: `The newest text was queued ${formatWhen(s.newest_row_at)}. The nightly reminder normally queues one every day.`,
      reason:
        "Either there is genuinely nothing on the schedule, or the job that writes the texts has stopped. Your AI engineer checks which.",
      owner: "ai-engineer",
    };
  }

  return {
    health: "green",
    headline: "HomeHuddle texts are being delivered.",
    summary: s.last_sent_at
      ? `The last one went out ${formatWhen(s.last_sent_at)}.`
      : "Texts are going out.",
  };
}
