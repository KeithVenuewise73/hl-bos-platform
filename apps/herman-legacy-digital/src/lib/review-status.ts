/**
 * Review statuses for the Executive Review preview workflow.
 *
 * Kept in a plain module (single source of truth) so the state set is testable
 * and shared by the UI. These are UI-only in V1 — nothing here persists.
 * NEW is the default state every recommendation starts in.
 */
export const REVIEW_STATUSES = [
  "NEW",
  "Accepted",
  "Deferred",
  "Rejected",
  "Completed",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
