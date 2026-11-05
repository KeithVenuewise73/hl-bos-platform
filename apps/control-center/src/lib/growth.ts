import {
  connectorReadiness,
  eventsFromPresence,
  growthDashboard,
  PRESENCE_CAPTURED_KINDS,
  routePresenceLead,
  type ConnectionEvidence,
  type ConnectorReadiness,
  type LineDashboard,
  type Principal,
} from "@hl-bos/growth-intelligence";
import type { Prospect } from "@hl-bos/presence-scanner";

/**
 * The Growth Intelligence view, computed from the Presence Scanner leads saved
 * on this computer. Nothing here is sample data: with no leads, every figure
 * says "no data" and why.
 *
 * The console runs on the CEO's machine only (127.0.0.1), so its operator is
 * the owner — the one role allowed to see consolidated reporting.
 */
export const CONSOLE_OWNER: Principal = {
  id: "CEO (Control Center)",
  role: "owner",
  lines: [],
};

export interface GrowthView {
  dashboards: LineDashboard[];
  connectors: ConnectorReadiness[];
  leadCount: number;
  routed: { hld: number; hscs: number };
  needsReview: { name: string; reasons: string[] }[];
}

/**
 * Connector evidence the console actually holds. The console stores no Google
 * OAuth credential today (only a Places API key, which is the discovery
 * source, not one of these connectors), so every connector is reported as not
 * connected. When a connection flow is built, it supplies real evidence here.
 */
export function consoleConnectorEvidence(): ConnectionEvidence[] {
  return [];
}

export function growthView(
  prospects: readonly Prospect[],
  evidence: readonly ConnectionEvidence[],
  now: Date,
): GrowthView {
  const routedLeads = prospects.map((p) => routePresenceLead(p));
  const events = routedLeads.flatMap(eventsFromPresence);
  const connectors = connectorReadiness(evidence, now);
  const routed = { hld: 0, hscs: 0 };
  const needsReview: GrowthView["needsReview"] = [];
  for (const r of routedLeads) {
    if (r.routing.status === "routed") routed[r.routing.line]++;
    else needsReview.push({ name: r.prospect.name, reasons: r.routing.reasons });
  }
  return {
    dashboards: growthDashboard(CONSOLE_OWNER, {
      events,
      expenses: [],
      connectors,
      capturedKinds: PRESENCE_CAPTURED_KINDS,
      now,
    }),
    connectors,
    leadCount: prospects.length,
    routed,
    needsReview,
  };
}
