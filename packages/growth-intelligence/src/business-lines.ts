// The two business lines, their offers and their funnels.
//
// Offers carry NO prices. Price is a CEO decision; until he sets one, every
// price is `null` and every proposal that needs it is blocked (proposal.ts).
// Nothing here is a fabricated number.
//
// Each funnel stage maps onto the EXISTING HL-BOS prospect stage enum
// (visibility.prospect_stage, migration 0017: prospect / assessed / proposed /
// client / lost), so the two funnels are views over one schema, not two new
// workflows. Each stage also maps to Google Analytics 4's recommended
// lead-generation events, so conversions are reported in Google's own terms.

import type { BusinessLine } from "./types.ts";

export type OfferKind = "implementation" | "recurring" | "consulting";

export interface Offer {
  key: string;
  line: BusinessLine;
  name: string;
  /** What HLG actually provides, in plain words. */
  provides: string;
  kind: OfferKind;
  /**
   * Service names from the existing BTI growth map (@hl-bos/bti-engine
   * GROWTH_MAP) that this offer answers. Lets a Presence Scanner suggestion
   * become an offer without a second recommendation engine.
   */
  answersBtiServices: string[];
}

export const OFFERS: readonly Offer[] = [
  // ---- Herman Legacy Digital ---------------------------------------------
  {
    key: "hld.website",
    line: "hld",
    name: "Website development and redesign",
    provides:
      "A new or rebuilt website with clear calls to action, mobile layout and contact paths.",
    kind: "implementation",
    answersBtiServices: ["Website Modernization", "Conversion Optimization"],
  },
  {
    key: "hld.hosting",
    line: "hld",
    name: "Hosting and maintenance",
    provides: "Hosting, updates, backups and small content changes each month.",
    kind: "recurring",
    answersBtiServices: [],
  },
  {
    key: "hld.crm",
    line: "hld",
    name: "CRM and business operating system",
    provides:
      "Customer records, follow-up tasks and pipeline tracking set up for the business.",
    kind: "implementation",
    answersBtiServices: ["Growth Tech Stack Advisory"],
  },
  {
    key: "hld.reputation",
    line: "hld",
    name: "Reputation management",
    provides:
      "Monitoring and responding to reviews, and asking real customers for honest reviews. No incentivised or fabricated reviews.",
    kind: "recurring",
    answersBtiServices: ["Reputation Management"],
  },
  {
    key: "hld.local-presence",
    line: "hld",
    name: "Google Business Profile and local search care",
    provides:
      "Keeping an owner-authorised Business Profile accurate and complete, with the owner's approval for every change. No ranking guarantee.",
    kind: "recurring",
    answersBtiServices: [
      "Local Presence Management",
      "SEO Optimization",
      "AI Search Optimization (AEO)",
    ],
  },
  {
    key: "hld.booking",
    line: "hld",
    name: "Booking and customer communications",
    provides: "Online booking or request forms, confirmations and reminders.",
    kind: "implementation",
    answersBtiServices: ["Lead Generation System"],
  },
  {
    key: "hld.automation",
    line: "hld",
    name: "AI automation and lead recovery",
    provides:
      "Automated follow-up for missed calls and unanswered inquiries, with consent and opt-out.",
    kind: "recurring",
    answersBtiServices: ["Lead Generation System"],
  },
  // ---- Herman Supply Chain Solutions -------------------------------------
  {
    key: "hscs.assessment",
    line: "hscs",
    name: "Operational assessment",
    provides:
      "A structured review of dispatch, routing, fleet and safety practice, based on information the customer provides.",
    kind: "consulting",
    answersBtiServices: [],
  },
  {
    key: "hscs.logistics-consulting",
    line: "hscs",
    name: "Transportation and logistics consulting",
    provides: "Advisory engagement on transportation operations and service design.",
    kind: "consulting",
    answersBtiServices: [],
  },
  {
    key: "hscs.fleet",
    line: "hscs",
    name: "Fleet management",
    provides: "Fleet records, maintenance tracking and compliance reminders.",
    kind: "recurring",
    answersBtiServices: [],
  },
  {
    key: "hscs.dispatch",
    line: "hscs",
    name: "Route and dispatch operations",
    provides:
      "Dispatch workflow and route planning set up around the customer's operation.",
    kind: "implementation",
    answersBtiServices: [],
  },
  {
    key: "hscs.dvir",
    line: "hscs",
    name: "Electronic DVIR and safety workflows",
    provides: "Driver vehicle inspection reports on a phone, with defect follow-up.",
    kind: "recurring",
    answersBtiServices: [],
  },
  {
    key: "hscs.driver-kpi",
    line: "hscs",
    name: "Driver KPIs and operational performance",
    provides: "Driver and route scorecards from the customer's own operating data.",
    kind: "recurring",
    answersBtiServices: [],
  },
  {
    key: "hscs.profitability",
    line: "hscs",
    name: "Transportation profitability and efficiency analysis",
    provides:
      "Lane, route and customer profitability analysis from the customer's own figures.",
    kind: "consulting",
    answersBtiServices: [],
  },
];

export function offersFor(line: BusinessLine): Offer[] {
  return OFFERS.filter((o) => o.line === line);
}

export function offer(key: string): Offer | undefined {
  return OFFERS.find((o) => o.key === key);
}

// ---- Funnels --------------------------------------------------------------

export type HlbosProspectStage =
  "prospect" | "assessed" | "proposed" | "client" | "lost";

/** GA4 recommended lead-generation events (Google Analytics documentation). */
export type Ga4LeadEvent =
  | "generate_lead"
  | "qualify_lead"
  | "working_lead"
  | "close_convert_lead"
  | "close_unconvert_lead"
  | "disqualify_lead";

export interface FunnelStage {
  key: string;
  label: string;
  hlbosStage: HlbosProspectStage;
  /** The GA4 event fired on entering this stage, when one applies. */
  ga4Event: Ga4LeadEvent | undefined;
}

export interface Funnel {
  line: BusinessLine;
  name: string;
  stages: FunnelStage[];
}

export const FUNNELS: Record<BusinessLine, Funnel> = {
  hld: {
    line: "hld",
    name: "HLG Digital funnel",
    stages: [
      {
        key: "discovery",
        label: "Discovery",
        hlbosStage: "prospect",
        ga4Event: undefined,
      },
      {
        key: "ai_review",
        label: "AI Digital Review",
        hlbosStage: "prospect",
        ga4Event: undefined,
      },
      {
        key: "qualified",
        label: "Qualified Prospect",
        hlbosStage: "assessed",
        ga4Event: "qualify_lead",
      },
      { key: "crm", label: "In CRM", hlbosStage: "assessed", ga4Event: "working_lead" },
      {
        key: "proposal",
        label: "Personalized Proposal",
        hlbosStage: "proposed",
        ga4Event: undefined,
      },
      {
        key: "consultation",
        label: "Consultation",
        hlbosStage: "proposed",
        ga4Event: undefined,
      },
      {
        key: "signed",
        label: "Signed Agreement",
        hlbosStage: "client",
        ga4Event: "close_convert_lead",
      },
      {
        key: "implementation",
        label: "Implementation",
        hlbosStage: "client",
        ga4Event: undefined,
      },
      {
        key: "subscription",
        label: "Recurring Subscription",
        hlbosStage: "client",
        ga4Event: undefined,
      },
    ],
  },
  hscs: {
    line: "hscs",
    name: "HSCS funnel",
    stages: [
      {
        key: "discovery",
        label: "Discovery",
        hlbosStage: "prospect",
        ga4Event: undefined,
      },
      {
        key: "transport_review",
        label: "Transportation Opportunity Review",
        hlbosStage: "prospect",
        ga4Event: undefined,
      },
      {
        key: "qualified",
        label: "Qualified Prospect",
        hlbosStage: "assessed",
        ga4Event: "qualify_lead",
      },
      { key: "crm", label: "In CRM", hlbosStage: "assessed", ga4Event: "working_lead" },
      {
        key: "assessment_offer",
        label: "Operational Assessment Offer",
        hlbosStage: "proposed",
        ga4Event: undefined,
      },
      {
        key: "consultation",
        label: "Consultation",
        hlbosStage: "proposed",
        ga4Event: undefined,
      },
      {
        key: "agreement",
        label: "Consulting Agreement",
        hlbosStage: "client",
        ga4Event: "close_convert_lead",
      },
      {
        key: "software",
        label: "Software Recommendation",
        hlbosStage: "client",
        ga4Event: undefined,
      },
      {
        key: "engagement",
        label: "Ongoing Engagement",
        hlbosStage: "client",
        ga4Event: undefined,
      },
    ],
  },
};

/** Inbound inquiries and referrals enter at "qualified review", not at discovery. */
export function entryStage(
  line: BusinessLine,
  origin: "discovered" | "inbound_inquiry" | "referral",
): FunnelStage {
  const stages = FUNNELS[line].stages;
  const key = origin === "discovered" ? "discovery" : "crm";
  const s = stages.find((x) => x.key === key);
  if (!s) throw new Error(`Funnel ${line} has no stage ${key}`);
  if (origin !== "discovered") {
    // An inbound lead raised its own hand, so GA4 records generate_lead.
    return { ...s, ga4Event: "generate_lead" };
  }
  return s;
}
