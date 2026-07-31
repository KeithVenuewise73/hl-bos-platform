/**
 * CAMPAIGN FRAMEWORK — lifecycle + initial campaigns (Execution Phase 3A).
 *
 * The campaign lifecycle every marketing campaign moves through, plus the three
 * initial production campaigns for Herman Legacy's first internal clients: Herman
 * Legacy Group, Venuewise, and HSCS. Each campaign carries the eight fields the
 * brief requires. Campaigns reuse the content manufacturing line and the existing
 * workflow/approval engine; none is launched (nothing publishes without CEO
 * approval).
 */

export interface CampaignStage {
  seq: number;
  name: string;
  gated: boolean;
}

/** The one campaign lifecycle (deliverable 5). */
export const CAMPAIGN_LIFECYCLE: CampaignStage[] = [
  { seq: 1, name: "Objective", gated: false },
  { seq: 2, name: "Audience", gated: false },
  { seq: 3, name: "Core Message", gated: false },
  { seq: 4, name: "Content Plan", gated: false },
  { seq: 5, name: "Approval", gated: true },
  { seq: 6, name: "Launch", gated: true },
  { seq: 7, name: "Measure", gated: false },
  { seq: 8, name: "Optimize", gated: false },
];

export type CampaignStatus = "draft" | "approved" | "live" | "complete";

export interface Campaign {
  key: string;
  client: string;
  products: string[];
  businessObjective: string;
  targetAudience: string;
  coreMessage: string;
  contentTypes: string[];
  publishingChannels: string[];
  callToAction: string;
  measurementCriteria: string[];
  successMetrics: string[];
  /** Honest status — nothing is live until CEO approval. */
  status: CampaignStatus;
}

/** The three initial campaigns (deliverables 7–9). All `draft` — none launched. */
export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    key: "herman_legacy",
    client: "Herman Legacy Group",
    products: ["HL-BTI", "VisibilityAI", "Herman Legacy Software Factory"],
    businessObjective:
      "Generate qualified HL-BTI transformation engagements from SMB owners and executives.",
    targetAudience:
      "SMB owners / executives seeking measurable business transformation.",
    coreMessage:
      "See exactly what's holding your business back — and the plan to fix it — with an evidence-based transformation assessment.",
    contentTypes: [
      "LinkedIn",
      "Blogs",
      "Case Studies",
      "Email Campaigns",
      "Educational Content",
    ],
    publishingChannels: ["LinkedIn", "Website / Blog", "Email"],
    callToAction: "Book a VisibilityAI assessment.",
    measurementCriteria: [
      "Assessment requests",
      "Qualified opportunities",
      "Proposals sent",
    ],
    successMetrics: ["Qualified leads", "Assessments completed", "Pipeline created"],
    status: "draft",
  },
  {
    key: "venuewise",
    client: "Venuewise",
    products: [
      "HomeHuddle",
      "AthleteHuddle",
      "CoachesHuddle",
      "FacilityHuddle",
      "TournamentHuddle",
      "5-Star Sports Media",
    ],
    businessObjective:
      "Grow youth-sports families, coaches, facilities and organizations onto the Venuewise platform.",
    targetAudience:
      "Sports families, coaches, facility operators, and youth organizations.",
    coreMessage:
      "One platform for your team's schedule, communication, development and moments — built for youth sports.",
    contentTypes: [
      "TikTok",
      "Instagram Reels",
      "YouTube Shorts",
      "Facebook",
      "Customer Success Stories",
    ],
    publishingChannels: ["TikTok", "Instagram", "YouTube", "Facebook"],
    callToAction: "Start your team on Venuewise.",
    measurementCriteria: ["Signups", "Active teams", "Engagement rate"],
    successMetrics: ["New families/teams", "Content engagement", "Retention"],
    status: "draft",
  },
  {
    key: "hscs",
    client: "HSCS",
    products: ["HSCS Consulting", "TransportationAI"],
    businessObjective:
      "Generate logistics/government transformation and TransportationAI opportunities.",
    targetAudience: "Transportation, logistics and government-contracting operators.",
    coreMessage:
      "Turn logistics complexity into measurable advantage — assessment, intelligence and route optimization.",
    contentTypes: [
      "LinkedIn",
      "Blogs",
      "Case Studies",
      "Press Releases",
      "Product Launches",
    ],
    publishingChannels: ["LinkedIn", "Website / Blog", "PR / Website"],
    callToAction: "Request an HSCS logistics assessment.",
    measurementCriteria: [
      "Assessment requests",
      "Bid/no-bid engagements",
      "Qualified opportunities",
    ],
    successMetrics: ["Qualified leads", "Engagements", "Pipeline created"],
    status: "draft",
  },
];

export function campaignByKey(key: string): Campaign | undefined {
  return INITIAL_CAMPAIGNS.find((c) => c.key === key);
}

export interface CampaignFramework {
  lifecycle: CampaignStage[];
  campaigns: Campaign[];
  campaignCount: number;
  liveCampaigns: number;
  clients: string[];
  /** Every campaign carries all 8 required fields. */
  allFieldsPresent: boolean;
}

/** The campaign framework (deliverables 5, 7–9). */
export function campaignFramework(): CampaignFramework {
  const allFieldsPresent = INITIAL_CAMPAIGNS.every(
    (c) =>
      c.businessObjective &&
      c.targetAudience &&
      c.coreMessage &&
      c.contentTypes.length > 0 &&
      c.publishingChannels.length > 0 &&
      c.callToAction &&
      c.measurementCriteria.length > 0 &&
      c.successMetrics.length > 0,
  );
  return {
    lifecycle: CAMPAIGN_LIFECYCLE,
    campaigns: INITIAL_CAMPAIGNS,
    campaignCount: INITIAL_CAMPAIGNS.length,
    liveCampaigns: INITIAL_CAMPAIGNS.filter((c) => c.status === "live").length,
    clients: [...new Set(INITIAL_CAMPAIGNS.map((c) => c.client))],
    allFieldsPresent,
  };
}
