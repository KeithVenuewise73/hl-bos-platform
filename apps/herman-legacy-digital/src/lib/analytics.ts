/**
 * Analytics instrumentation — the measurable event catalog.
 *
 * We instrument events; we do NOT report revenue, ROI, conversions or customer
 * outcomes until real data exists (Principle 10). Events are counted; outcomes
 * are earned. The sink (api/event) records events; this module is the pure
 * catalog + validation shared by client and server.
 */

export const ANALYTICS_EVENTS = [
  "page_visit",
  "assessment_start",
  "assessment_submit",
  "consultation_request",
  "transformation_intake_start",
  "transformation_intake_submit",
  "client_login",
  "marketplace_view",
  "solution_interest_request",
  "document_view",
  "portal_engagement",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export function isAnalyticsEvent(name: unknown): name is AnalyticsEvent {
  return (
    typeof name === "string" && (ANALYTICS_EVENTS as readonly string[]).includes(name)
  );
}

export interface AnalyticsRecord {
  event: AnalyticsEvent;
  path: string;
  /** Non-PII properties only. */
  props: Record<string, string>;
}

/** Validate + normalize an inbound event; returns null if the event is unknown. */
export function normalizeEvent(
  event: unknown,
  path: unknown,
  props: unknown,
): AnalyticsRecord | null {
  if (!isAnalyticsEvent(event)) return null;
  const safePath = typeof path === "string" ? path.slice(0, 256) : "";
  const safeProps: Record<string, string> = {};
  if (props && typeof props === "object") {
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      if (typeof v === "string" && k.length <= 40) safeProps[k] = v.slice(0, 120);
    }
  }
  return { event, path: safePath, props: safeProps };
}
