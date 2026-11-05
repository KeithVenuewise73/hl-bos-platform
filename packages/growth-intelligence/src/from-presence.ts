// Presence Scanner leads -> Growth Intelligence records.
//
// The Presence Scanner is the existing discovery engine and lead board; this
// adapter reads its leads and their audit trails and produces routed growth
// events. It writes nothing back and adds no store. Events are derived only
// from what the audit trail recorded — a stage the lead never entered produces
// no event, and a signed client with no recorded amount produces an agreement
// with no amount (which the dashboard then refuses to total).

import { VERTICAL_LABELS, type Prospect } from "@hl-bos/presence-scanner";

import { routeLead, type Campaign, type RoutingResult } from "./routing.ts";
import type { BusinessLine, GrowthEvent, GrowthEventKind } from "./types.ts";

export interface RoutedLead {
  prospect: Prospect;
  routing: RoutingResult;
}

export function routePresenceLead(
  p: Prospect,
  campaigns: readonly Campaign[] = [],
): RoutedLead {
  const industry = [p.places?.record.primaryTypeLabel, VERTICAL_LABELS[p.vertical]]
    .filter(Boolean)
    .join(" ");
  return {
    prospect: p,
    routing: routeLead(
      {
        origin: "discovered",
        campaignKey: undefined,
        inboundSite: undefined,
        vertical: p.vertical,
        industry,
      },
      campaigns,
    ),
  };
}

/**
 * The event kinds a Presence Scanner lead's record can actually produce.
 * Inbound inquiries, referrals and consultations are not recorded there, so a
 * dashboard built from the scanner alone must not show them as zero.
 */
export const PRESENCE_CAPTURED_KINDS: readonly GrowthEventKind[] = [
  "discovered",
  "review_completed",
  "qualified",
  "outreach_sent",
  "outreach_response",
  "proposal_sent",
  "agreement_signed",
  "deal_lost",
];

/** Stage-change audit entries look like "Reviewed → Contacted: note". */
const STAGE_EVENTS: Record<string, GrowthEventKind> = {
  Contacted: "outreach_sent",
  Interested: "outreach_response",
  Proposal: "proposal_sent",
  Client: "agreement_signed",
  Lost: "deal_lost",
  Disqualified: "deal_lost",
};

export function eventsFromPresence(lead: RoutedLead): GrowthEvent[] {
  if (lead.routing.status !== "routed") return [];
  const line: BusinessLine = lead.routing.line;
  const p = lead.prospect;
  const industry = VERTICAL_LABELS[p.vertical];
  const out: GrowthEvent[] = [];
  const push = (kind: GrowthEventKind, at: string, extra: Partial<GrowthEvent> = {}) =>
    out.push({
      id: `${p.id}:${kind}:${out.length}`,
      line,
      leadId: p.id,
      kind,
      at,
      channel: "discovery_outreach",
      isDemo: false,
      industry,
      ...extra,
    });

  push("discovered", p.firstSeenAt);
  if (p.score.checkedMax > 0) push("review_completed", p.lastScannedAt);
  const qualifiedNow =
    (p.qualification.override?.status ?? p.qualification.computed) === "qualified";
  if (qualifiedNow) push("qualified", p.qualification.override?.at ?? p.lastScannedAt);
  for (const a of p.audit) {
    if (a.action !== "stage") continue;
    const to = a.detail.split("→")[1]?.split(":")[0]?.trim();
    const kind = to ? STAGE_EVENTS[to] : undefined;
    if (!kind) continue;
    const note = a.detail.includes(":")
      ? a.detail.slice(a.detail.indexOf(":") + 1).trim()
      : undefined;
    push(kind, a.at, kind === "deal_lost" && note ? { lostReason: note } : {});
  }
  return out;
}
