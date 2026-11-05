// Campaign routing: which business line owns a lead.
//
// Order of authority, strongest first:
//   1. The campaign the lead was discovered under (a campaign belongs to one line).
//   2. The website the inquiry arrived on (the HLD site vs the HSCS site).
//   3. The industry, matched against each line's industry vocabulary.
// When signals disagree, or nothing matches, the answer is `needs_review` — a
// person decides. We never guess a line silently, because the wrong line means
// the wrong offer, the wrong pricing and the wrong books.

import type { Vertical } from "@hl-bos/presence-scanner";

import type { BusinessLine, LeadOrigin } from "./types.ts";

export interface Campaign {
  key: string;
  line: BusinessLine;
  name: string;
  status: "draft" | "approved" | "paused" | "ended";
}

export interface RoutingInput {
  origin: LeadOrigin;
  /** Discovered leads: the campaign key the scan ran under. */
  campaignKey: string | undefined;
  /** Inbound leads: which HLG website the form was on. */
  inboundSite: BusinessLine | undefined;
  /** Presence Scanner vertical, when the lead came from a scan. */
  vertical: Vertical | undefined;
  /** Free-text industry: a Places type label, a form answer, a referral note. */
  industry: string | undefined;
}

export type RoutingResult =
  | { status: "routed"; line: BusinessLine; basis: RoutingBasis; reasons: string[] }
  | { status: "needs_review"; candidates: BusinessLine[]; reasons: string[] };

export type RoutingBasis = "campaign" | "inbound_site" | "industry";

/** Transportation vocabulary for HSCS. Whole-word matches only. */
const HSCS_TERMS = [
  "trucking",
  "truck",
  "freight",
  "logistics",
  "courier",
  "delivery",
  "fleet",
  "transportation",
  "transport",
  "dispatch",
  "carrier",
  "moving company",
  "movers",
  "warehouse",
  "warehousing",
  "distribution",
  "3pl",
  "final mile",
  "last mile",
  "middle mile",
  "hauling",
  "towing",
  "shipping",
  "white glove",
];

/** Every Presence Scanner vertical is a local-service business: HLD's market. */
const HLD_VERTICALS: readonly Vertical[] = [
  "contractor",
  "salon_barber",
  "restaurant_bar",
  "trainer_coach",
  "youth_sports",
  "professional_services",
];

const HLD_TERMS = [
  "salon",
  "barber",
  "restaurant",
  "bar",
  "cafe",
  "contractor",
  "plumber",
  "electrician",
  "roofer",
  "landscaping",
  "trainer",
  "gym",
  "coach",
  "dentist",
  "law firm",
  "accountant",
  "real estate",
  "retail",
  "spa",
];

function matches(text: string, terms: string[]): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return terms.filter((term) => t.includes(` ${term} `));
}

export function routeLead(
  input: RoutingInput,
  campaigns: readonly Campaign[],
): RoutingResult {
  const reasons: string[] = [];
  const signals: { line: BusinessLine; basis: RoutingBasis }[] = [];

  if (input.campaignKey !== undefined) {
    const c = campaigns.find((x) => x.key === input.campaignKey);
    if (!c) {
      return {
        status: "needs_review",
        candidates: [],
        reasons: [
          `Campaign "${input.campaignKey}" is not registered, so its owner is unknown.`,
        ],
      };
    }
    signals.push({ line: c.line, basis: "campaign" });
    reasons.push(
      `Discovered under campaign "${c.name}", which belongs to ${lineName(c.line)}.`,
    );
  }
  if (input.inboundSite !== undefined) {
    signals.push({ line: input.inboundSite, basis: "inbound_site" });
    reasons.push(`The inquiry arrived on the ${lineName(input.inboundSite)} website.`);
  }

  const industryText = input.industry ?? "";
  const hscsHits = matches(industryText, HSCS_TERMS);
  const hldHits = matches(industryText, HLD_TERMS);
  const verticalIsHld =
    input.vertical !== undefined && HLD_VERTICALS.includes(input.vertical);
  const industryLines = new Set<BusinessLine>();
  if (hscsHits.length > 0) {
    industryLines.add("hscs");
    reasons.push(`Industry mentions ${hscsHits.join(", ")} (transportation).`);
  }
  if (hldHits.length > 0 || (verticalIsHld && hscsHits.length === 0)) {
    industryLines.add("hld");
    reasons.push(
      hldHits.length > 0
        ? `Industry mentions ${hldHits.join(", ")} (local service business).`
        : `Found by a ${input.vertical ?? ""} scan (local service business).`,
    );
  }

  const strong = signals[0];
  if (strong) {
    const conflict = signals.some((s) => s.line !== strong.line);
    if (conflict) {
      return {
        status: "needs_review",
        candidates: [...new Set(signals.map((s) => s.line))],
        reasons: [
          ...reasons,
          "The campaign and the website disagree; a person must decide.",
        ],
      };
    }
    // An industry that points only at the OTHER line is worth a human look:
    // a trucking company inquiring on the HLD site may want a website (HLD) or
    // dispatch help (HSCS). Keep the strong signal, but flag it.
    if (industryLines.size === 1 && !industryLines.has(strong.line)) {
      return {
        status: "needs_review",
        candidates: [strong.line, ...industryLines],
        reasons: [
          ...reasons,
          `The industry suggests ${lineName([...industryLines][0] ?? strong.line)}; confirm which business should own this lead.`,
        ],
      };
    }
    return { status: "routed", line: strong.line, basis: strong.basis, reasons };
  }

  if (industryLines.size === 1) {
    const line = [...industryLines][0] as BusinessLine;
    return { status: "routed", line, basis: "industry", reasons };
  }
  return {
    status: "needs_review",
    candidates: [...industryLines],
    reasons: [
      ...reasons,
      industryLines.size === 0
        ? "No campaign, website or recognisable industry; a person must decide."
        : "The industry fits both businesses; a person must decide.",
    ],
  };
}

export function lineName(line: BusinessLine): string {
  return line === "hld" ? "Herman Legacy Digital" : "Herman Supply Chain Solutions";
}
