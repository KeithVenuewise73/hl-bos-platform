/**
 * Report version lifecycle.
 *
 * The domain rules that guarantee "a new automated report never overwrites an
 * approved one." These mirror the BTIC read semantics (`currentReportFor` /
 * `historyFor`) and the immutability of `bti.analysis_snapshots`, but as pure,
 * DB-agnostic logic the pipeline can enforce before any persistence adapter is
 * called.
 *
 * The automated pipeline only ever produces `draft_ai_generated` reports. It
 * NEVER promotes a report to `current` or `approved` — that is a human, CEO-
 * gated decision. So placing a new report is always additive: history is
 * retained, approved truth is untouched.
 */

import type { InitialReport, ReportStatus } from "./types.ts";

export function reportKey(r: Pick<InitialReport, "subject" | "version">): string {
  return `${r.subject}@v${r.version}`;
}

export interface PlaceResult {
  /** The full lineage after placing the incoming report, newest last. */
  lineage: InitialReport[];
  /** The incoming report as actually stored (version + supersedes stamped). */
  placed: InitialReport;
  /** Key of the report the new draft supersedes, or null for the first version. */
  supersededKey: string | null;
  /** True if an approved report existed and was left untouched. */
  approvedPreserved: boolean;
}

/**
 * Place a newly generated draft into its lineage without ever mutating an
 * existing approved/current report. Returns a NEW array; inputs are not changed.
 */
export function placeReport(
  existing: readonly InitialReport[],
  incoming: InitialReport,
): PlaceResult {
  const sameSubject = existing.filter((r) => r.subject === incoming.subject);
  const nextVersion = sameSubject.reduce((max, r) => Math.max(max, r.version), 0) + 1;

  // Newest existing version becomes the one we record as superseded-by-lineage.
  const newest = sameSubject.reduce<InitialReport | null>(
    (acc, r) => (acc === null || r.version > acc.version ? r : acc),
    null,
  );
  const supersededKey = newest ? reportKey(newest) : null;

  const placed: InitialReport = {
    ...incoming,
    version: nextVersion,
    // The pipeline's output is always a draft — it cannot self-promote.
    status: "draft_ai_generated",
    ...(supersededKey ? { supersedes: supersededKey } : {}),
  };

  // Additive: keep every prior report exactly as it was (approved untouched).
  const lineage = [...existing, placed];
  const approvedPreserved = existing.some((r) => r.status === "approved");

  return { lineage, placed, supersededKey, approvedPreserved };
}

const TRUTH_RANK: Record<ReportStatus, number> = {
  approved: 0,
  current: 1,
  draft_ai_generated: 2,
  superseded: 3,
  archived: 4,
};

/**
 * The CURRENT truth for a subject: the single approved or current report.
 * Draft/superseded/archived are never returned here (but never deleted either).
 * Returns null when the only reports are drafts — an automated draft is NOT
 * truth until a human accepts it.
 */
export function currentTruth(
  lineage: readonly InitialReport[],
  subject: string,
): InitialReport | null {
  const accepted = lineage.filter(
    (r) => r.subject === subject && (r.status === "approved" || r.status === "current"),
  );
  if (accepted.length === 0) return null;
  return [...accepted].sort((a, b) => {
    const t = TRUTH_RANK[a.status] - TRUTH_RANK[b.status];
    return t !== 0 ? t : b.version - a.version;
  })[0]!;
}

/** Every report for a subject, retained, ordered by truth then newest version. */
export function historyFor(
  lineage: readonly InitialReport[],
  subject: string,
): InitialReport[] {
  return lineage
    .filter((r) => r.subject === subject)
    .sort((a, b) => {
      const t = TRUTH_RANK[a.status] - TRUTH_RANK[b.status];
      return t !== 0 ? t : b.version - a.version;
    });
}
