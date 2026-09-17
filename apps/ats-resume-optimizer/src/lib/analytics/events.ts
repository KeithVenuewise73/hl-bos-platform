/**
 * The nine things we need to know, and nothing else.
 *
 * This list is deliberately closed. Product analytics grows without limit if
 * you let it, and the cost is not storage — it is that a career database
 * starts accumulating a behavioural record of one person's job search, which
 * is exactly the data this product promises to hold carefully.
 *
 * So: event names from a fixed set, no free-form properties, no resume text,
 * no job titles, no employer names, no URLs. A row says THAT something
 * happened and roughly how big it was. It never says what it was about.
 *
 * Pure, with no `server-only` marker, so the redaction rules below are unit
 * tested rather than trusted.
 */

export const EVENT_NAMES = [
  "account_created",
  "resume_uploaded",
  "job_analyzed",
  "analysis_completed",
  "resume_generated",
  "resume_exported",
  "cover_letter_generated",
  "interview_prep_opened",
  "payment_clicked",
  "value_feedback",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Numbers and short enums only. Never text a user typed. */
export type EventProps = Readonly<Record<string, number | boolean | string>>;

const NAMES = new Set<string>(EVENT_NAMES);

export function isEventName(value: string): value is EventName {
  return NAMES.has(value);
}

/**
 * Values a property is allowed to carry.
 *
 * Numbers and booleans pass. Strings pass only if they are short and look like
 * an identifier — `docx`, `yes`, `coach` — which is enough for every property
 * we actually record and not enough to smuggle a sentence from a resume.
 */
const SAFE_STRING = /^[a-z0-9_-]{1,24}$/;

export function sanitizeProps(props: EventProps | undefined): EventProps {
  if (props === undefined) return {};
  const out: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!SAFE_STRING.test(key)) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string" && SAFE_STRING.test(value)) out[key] = value;
  }
  return out;
}

/** The three answers the value question accepts. */
export const FEEDBACK_ANSWERS = ["yes", "somewhat", "no"] as const;
export type FeedbackAnswer = (typeof FEEDBACK_ANSWERS)[number];

export function isFeedbackAnswer(value: string): value is FeedbackAnswer {
  return (FEEDBACK_ANSWERS as readonly string[]).includes(value);
}

/**
 * The funnel the sprint is meant to measure.
 *
 * Exported as a function of counts so the numbers can be checked without a
 * database — and so "percentage of trial users who export a resume", the one
 * metric this beta turns on, has a single definition rather than being
 * recomputed by eye from a dashboard.
 */
export interface FunnelCounts {
  readonly accounts: number;
  readonly analysesCompleted: number;
  readonly resumesGenerated: number;
  readonly resumesExported: number;
}

export interface FunnelRates {
  readonly analysisToGeneration: number;
  readonly generationToExport: number;
  /** The headline: share of accounts that ever exported a resume. */
  readonly accountToExport: number;
}

export function funnelRates(counts: FunnelCounts): FunnelRates {
  const ratio = (numerator: number, denominator: number): number =>
    denominator <= 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
  return {
    analysisToGeneration: ratio(counts.resumesGenerated, counts.analysesCompleted),
    generationToExport: ratio(counts.resumesExported, counts.resumesGenerated),
    accountToExport: ratio(counts.resumesExported, counts.accounts),
  };
}
