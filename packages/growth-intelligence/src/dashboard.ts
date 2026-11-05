// The HLG Growth Dashboard: HLD, HSCS, and consolidated.
//
// Every number is computed from recorded events. Every metric carries a status
// that says what kind of number it is:
//
//   measured       counted from real records
//   estimate       derived from real records by a stated formula (LTV)
//   no_data        nothing recorded yet — the reason says why
//   not_supported  records exist but are not enough to compute this honestly
//   not_connected  the source that would record this (a Google connector,
//                  the website inquiry feed) is not connected
//
// Demonstration records are excluded from every figure, and the count of
// excluded records is shown, so a demo can never be read as a result.
// Revenue here is AGREED revenue from signed agreements; collected money lives
// in HL-BOS billing and is reported only once billing is live.

import { assertAccess, assertOwner, type Principal } from "./isolation.ts";
import type { ConnectorReadiness, GoogleConnectorKey } from "./google.ts";
import type {
  BusinessLine,
  CampaignExpense,
  Channel,
  GrowthEvent,
  GrowthEventKind,
} from "./types.ts";

export type MetricStatus =
  | "measured"
  | "estimate"
  | "no_data"
  | "not_supported"
  | "not_connected"
  /** Counted from synthetic development records. Never a business result. */
  | "synthetic";

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: "count" | "cents" | "ratio";
  status: MetricStatus;
  note: string;
}

export interface LineDashboard {
  scope: BusinessLine | "consolidated";
  metrics: Metric[];
  /** Leads by channel, from real records. */
  byChannel: { channel: Channel; leads: number; signed: number }[];
  demoRecordsExcluded: number;
  recordsUsed: number;
}

export interface DashboardInput {
  events: readonly GrowthEvent[];
  expenses: readonly CampaignExpense[];
  connectors: readonly ConnectorReadiness[];
  now: Date;
  /**
   * Event kinds some connected source actually records. A kind not listed is
   * reported as not connected rather than as a measured zero. Omit only when
   * every kind has a live source.
   */
  capturedKinds?: readonly GrowthEventKind[];
  /**
   * Development only: count synthetic records too. Every figure they touch is
   * then labelled "synthetic", never "measured".
   */
  includeSynthetic?: boolean;
}

const LTV_MIN_CUSTOMERS = 5;
const LTV_MIN_MONTHS = 6;

function distinctLeads(
  evs: readonly GrowthEvent[],
  kind: GrowthEventKind,
): Set<string> {
  return new Set(evs.filter((e) => e.kind === kind).map((e) => e.leadId));
}

function count(
  key: string,
  label: string,
  n: number,
  anyRecords: boolean,
  emptyNote: string,
): Metric {
  return anyRecords
    ? { key, label, value: n, unit: "count", status: "measured", note: "" }
    : { key, label, value: null, unit: "count", status: "no_data", note: emptyNote };
}

function ratio(
  key: string,
  label: string,
  num: number,
  den: number,
  denLabel: string,
): Metric {
  return den === 0
    ? {
        key,
        label,
        value: null,
        unit: "ratio",
        status: "not_supported",
        note: `No ${denLabel} yet, so there is nothing to divide by.`,
      }
    : {
        key,
        label,
        value: num / den,
        unit: "ratio",
        status: "measured",
        note: `${num} of ${den} ${denLabel}.`,
      };
}

function connectorMetric(
  key: string,
  label: string,
  connector: GoogleConnectorKey,
  connectors: readonly ConnectorReadiness[],
): Metric {
  const r = connectors.find((c) => c.connector.key === connector);
  const ok = r?.status === "connected";
  return {
    key,
    label,
    value: null,
    unit: "count",
    status: "not_connected",
    note: ok
      ? `${r.connector.name} is connected, but importing its figures is not built yet.`
      : (r?.explanation ?? `${connector} is not connected.`),
  };
}

function build(
  scope: BusinessLine | "consolidated",
  input: DashboardInput,
): LineDashboard {
  const { events: allEvents, expenses: allExpenses, connectors, now } = input;
  const captured = input.capturedKinds ? new Set(input.capturedKinds) : undefined;
  const counted = (
    key: string,
    label: string,
    n: number,
    kind: GrowthEventKind,
  ): Metric =>
    captured && !captured.has(kind)
      ? {
          key,
          label,
          value: null,
          unit: "count",
          status: "not_connected",
          note: `Nothing connected records ${label.toLowerCase()} yet, so this is unknown — not zero.`,
        }
      : count(key, label, n, any, none);
  // Revenue comes from signed agreements. If nothing records agreements, a
  // revenue total would be a zero nobody measured.
  const agreementsUncaptured = (key: string, label: string): Metric | undefined =>
    captured && !captured.has("agreement_signed")
      ? {
          key,
          label,
          value: null,
          unit: "cents",
          status: "not_connected",
          note: "Nothing connected records signed agreements yet, so revenue is unknown — not zero.",
        }
      : undefined;
  const inScope = <T extends { line: BusinessLine }>(x: T) =>
    scope === "consolidated" || x.line === scope;
  const scopedEvents = allEvents.filter(inScope);
  const scopedExpenses = allExpenses.filter(inScope);
  const synthetic = input.includeSynthetic === true;
  const events = synthetic ? [...scopedEvents] : scopedEvents.filter((e) => !e.isDemo);
  const expenses = synthetic
    ? [...scopedExpenses]
    : scopedExpenses.filter((e) => !e.isDemo);
  const syntheticCounted =
    synthetic && (events.some((e) => e.isDemo) || expenses.some((e) => e.isDemo));
  const demoRecordsExcluded =
    scopedEvents.length - events.length + (scopedExpenses.length - expenses.length);
  const any = events.length > 0;
  const none =
    demoRecordsExcluded > 0
      ? "Only demonstration records exist; they are not counted."
      : "Nothing has been recorded yet.";

  const discovered = distinctLeads(events, "discovered");
  const reviews = events.filter((e) => e.kind === "review_completed").length;
  const qualified = distinctLeads(events, "qualified");
  const inbound = distinctLeads(events, "inquiry_received");
  const referrals = distinctLeads(events, "referral_received");
  const outreach = events.filter((e) => e.kind === "outreach_sent").length;
  const outreachLeads = distinctLeads(events, "outreach_sent");
  const responded = distinctLeads(events, "outreach_response");
  const consultations = events.filter((e) => e.kind === "consultation_held").length;
  const proposals = distinctLeads(events, "proposal_sent");

  // A customer counts once (its latest agreement), and stops counting toward
  // MRR if a deal_lost is recorded after it signed.
  const agreements = new Map<string, GrowthEvent>();
  for (const e of events)
    if (e.kind === "agreement_signed") {
      const prev = agreements.get(e.leadId);
      if (!prev || prev.at < e.at) agreements.set(e.leadId, e);
    }
  const lostAfterSign = new Set(
    events
      .filter((e) => e.kind === "deal_lost")
      .filter((e) => {
        const a = agreements.get(e.leadId);
        return a !== undefined && e.at > a.at;
      })
      .map((e) => e.leadId),
  );
  const signed = agreements.size;
  const active = [...agreements.values()].filter((a) => !lostAfterSign.has(a.leadId));
  const implementationCents = [...agreements.values()].reduce(
    (s, a) => s + (a.implementationCents ?? 0),
    0,
  );
  const mrrCents = active.reduce((s, a) => s + (a.monthlyCents ?? 0), 0);
  const spendCents = expenses.reduce((s, x) => s + x.cents, 0);
  const unpricedImpl = [...agreements.values()].filter(
    (a) => a.implementationCents === undefined,
  ).length;
  const unpricedMonthly = active.filter((a) => a.monthlyCents === undefined).length;

  const metrics: Metric[] = [
    counted("discovered", "Discovered businesses", discovered.size, "discovered"),
    counted("reviews", "Opportunity reviews completed", reviews, "review_completed"),
    counted("qualified", "Qualified opportunities", qualified.size, "qualified"),
    counted("inbound", "Inbound inquiries", inbound.size, "inquiry_received"),
    counted("referrals", "Referrals", referrals.size, "referral_received"),
    counted("outreach", "Outreach messages sent", outreach, "outreach_sent"),
    counted("responses", "Outreach responses", responded.size, "outreach_response"),
    ratio(
      "response_rate",
      "Response rate",
      responded.size,
      outreachLeads.size,
      "businesses contacted",
    ),
    counted("consultations", "Consultations held", consultations, "consultation_held"),
    counted("proposals", "Proposals sent", proposals.size, "proposal_sent"),
    counted("signed", "Signed customers", signed, "agreement_signed"),
    agreementsUncaptured("implementation_revenue", "Implementation revenue (agreed)") ??
      money(
        "implementation_revenue",
        "Implementation revenue (agreed)",
        implementationCents,
        any,
        none,
        unpricedImpl,
        "From signed agreements. Collected payments are reported by billing once it is live.",
      ),
    agreementsUncaptured("mrr", "Monthly recurring revenue (agreed)") ??
      money(
        "mrr",
        "Monthly recurring revenue (agreed)",
        mrrCents,
        any,
        none,
        unpricedMonthly,
        `${active.length} active customer(s).`,
      ),
    expenses.length > 0
      ? {
          key: "expenses",
          label: "Campaign expenses",
          value: spendCents,
          unit: "cents",
          status: "measured",
          note: `${expenses.length} expense record(s).`,
        }
      : {
          key: "expenses",
          label: "Campaign expenses",
          value: null,
          unit: "cents",
          status: "no_data",
          note: "No campaign spending has been recorded.",
        },
    cac(expenses.length, spendCents, signed),
    ltv(active, lostAfterSign.size, signed, agreements, now),
    ratio(
      "conv_discovered_qualified",
      "Discovered → qualified",
      [...qualified].filter((l) => discovered.has(l)).length,
      discovered.size,
      "discovered businesses",
    ),
    ratio(
      "conv_qualified_proposal",
      "Qualified → proposal",
      [...proposals].filter((l) => qualified.has(l)).length,
      qualified.size,
      "qualified opportunities",
    ),
    ratio(
      "conv_proposal_signed",
      "Proposal → signed",
      [...agreements.keys()].filter((l) => proposals.has(l)).length,
      proposals.size,
      "proposals",
    ),
    connectorMetric(
      "website_visits",
      "Website visits",
      "google_analytics_4",
      connectors,
    ),
    connectorMetric(
      "gbp_interactions",
      "Business Profile interactions",
      "google_business",
      connectors,
    ),
    connectorMetric(
      "search_impressions",
      "Google Search impressions",
      "google_search_console",
      connectors,
    ),
    connectorMetric(
      "ads_conversions",
      "Google Ads conversions",
      "google_ads",
      connectors,
    ),
  ];

  const channels = new Map<Channel, { leads: Set<string>; signed: Set<string> }>();
  for (const e of events) {
    const c = channels.get(e.channel) ?? { leads: new Set(), signed: new Set() };
    c.leads.add(e.leadId);
    if (e.kind === "agreement_signed") c.signed.add(e.leadId);
    channels.set(e.channel, c);
  }

  if (syntheticCounted)
    for (const m of metrics)
      if (m.status === "measured" || m.status === "estimate") {
        m.status = "synthetic";
        m.note = `SYNTHETIC DEVELOPMENT DATA — not a business result. ${m.note}`.trim();
      }

  return {
    scope,
    metrics,
    byChannel: [...channels.entries()]
      .map(([channel, c]) => ({ channel, leads: c.leads.size, signed: c.signed.size }))
      .sort((a, b) => b.leads - a.leads),
    demoRecordsExcluded,
    recordsUsed: events.length + expenses.length,
  };
}

function money(
  key: string,
  label: string,
  cents: number,
  any: boolean,
  none: string,
  missing: number,
  note: string,
): Metric {
  const base = { key, label, unit: "cents" as const };
  if (!any) return { ...base, value: null, status: "no_data", note: none };
  if (missing > 0)
    return {
      ...base,
      value: null,
      status: "not_supported",
      note: `${missing} signed agreement(s) have no amount recorded, so a total would understate it.`,
    };
  return { ...base, value: cents, status: "measured", note };
}

function cac(expenseRecords: number, spend: number, signed: number): Metric {
  const base = {
    key: "cac",
    label: "Customer acquisition cost",
    unit: "cents" as const,
  };
  if (expenseRecords === 0)
    return {
      ...base,
      value: null,
      status: "not_supported",
      note: "No campaign spending is recorded, so cost per customer cannot be computed. It is not zero.",
    };
  if (signed === 0)
    return {
      ...base,
      value: null,
      status: "not_supported",
      note: "No signed customers yet.",
    };
  return {
    ...base,
    value: Math.round(spend / signed),
    status: "measured",
    note: `Recorded spend ÷ ${signed} signed customer(s).`,
  };
}

function ltv(
  active: GrowthEvent[],
  churned: number,
  signed: number,
  agreements: Map<string, GrowthEvent>,
  now: Date,
): Metric {
  const base = {
    key: "ltv",
    label: "Estimated customer lifetime value",
    unit: "cents" as const,
  };
  if (signed < LTV_MIN_CUSTOMERS)
    return {
      ...base,
      value: null,
      status: "not_supported",
      note: `Needs at least ${LTV_MIN_CUSTOMERS} customers; there are ${signed}.`,
    };
  const earliest = Math.min(...[...agreements.values()].map((a) => Date.parse(a.at)));
  const months = (now.getTime() - earliest) / (30.44 * 86_400_000);
  if (months < LTV_MIN_MONTHS)
    return {
      ...base,
      value: null,
      status: "not_supported",
      note: `Needs ${LTV_MIN_MONTHS} months of history; there are ${Math.floor(months)}.`,
    };
  if (churned === 0)
    return {
      ...base,
      value: null,
      status: "not_supported",
      note: "No customer has left yet, so a lifetime cannot be estimated without guessing.",
    };
  const customerMonths = [...agreements.values()].reduce(
    (s, a) => s + (now.getTime() - Date.parse(a.at)) / (30.44 * 86_400_000),
    0,
  );
  const monthlyChurn = churned / customerMonths;
  const avgMonthly =
    active.length === 0
      ? 0
      : active.reduce((s, a) => s + (a.monthlyCents ?? 0), 0) / active.length;
  return {
    ...base,
    value: Math.round(avgMonthly / monthlyChurn),
    status: "estimate",
    note: `Average monthly revenue per active customer ÷ observed monthly churn (${churned} left over ${Math.round(customerMonths)} customer-months).`,
  };
}

/** One business line. Line leads and viewers of that line may read it. */
export function lineDashboard(
  p: Principal,
  line: BusinessLine,
  input: DashboardInput,
): LineDashboard {
  assertAccess(p, line, "read");
  return build(line, input);
}

/** HLD, HSCS and consolidated. Owner only. */
export function growthDashboard(p: Principal, input: DashboardInput): LineDashboard[] {
  assertOwner(p);
  return [build("hld", input), build("hscs", input), build("consolidated", input)];
}
