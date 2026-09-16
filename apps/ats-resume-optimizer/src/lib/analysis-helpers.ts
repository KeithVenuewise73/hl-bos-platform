/**
 * Helpers shared by the server actions and the pages.
 *
 * Kept out of `actions.ts` because a "use server" module may only export async
 * functions — everything in here is a plain synchronous helper.
 */

import { TERMINOLOGY_GROUPS, normalize, usableKeywords } from "@hl-bos/ats-resume";
import type { JobAnalysis, MatchStatus, RequirementMatch } from "@hl-bos/ats-resume";

/**
 * The vocabulary the optimizer and the claim validator will accept for this
 * analysis: keywords the resume already contains or that the evidence
 * supports, plus terminology whose underlying work is evidenced.
 */
export function licensedTermsFor(analysis: JobAnalysis): string[] {
  const fromKeywords = usableKeywords(analysis.keywords);
  const fromTerminology = analysis.terminology.flatMap((opportunity) => {
    const group = TERMINOLOGY_GROUPS.find(
      (g) =>
        g.job.some((p) => normalize(p) === normalize(opportunity.jobWording)) ||
        normalize(g.preferred) === normalize(opportunity.jobWording),
    );
    return group === undefined
      ? [opportunity.jobWording]
      : [group.preferred, ...group.job];
  });
  return [...new Set([...fromKeywords, ...fromTerminology])];
}

export const STATUS_ORDER: readonly MatchStatus[] = [
  "not_evidenced",
  "partial_match",
  "terminology_match",
  "strong_match",
];

const IMPORTANCE_RANK: Record<RequirementMatch["importance"], number> = {
  critical: 0,
  important: 1,
  preferred: 2,
  informational: 3,
};

/** Matrix order: what costs you the screen first, at the top. */
export function sortMatches(matches: readonly RequirementMatch[]): RequirementMatch[] {
  return [...matches].sort((a, b) => {
    const importance = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
    if (importance !== 0) return importance;
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  });
}

export function statusLabel(status: MatchStatus): string {
  switch (status) {
    case "strong_match":
      return "Strong match";
    case "partial_match":
      return "Partial match";
    case "terminology_match":
      return "Terminology match";
    case "not_evidenced":
      return "Not evidenced";
    default:
      return status;
  }
}

export function formatDate(iso: string | undefined): string {
  if (iso === undefined || iso.length === 0) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

export const APPLICATION_STATUSES = [
  "researching",
  "resume_created",
  "applied",
  "recruiter_screen",
  "interviewing",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
] as const;

export function humanStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
