// Shared shapes for HLG Growth Intelligence.
//
// Two rules run through every type here:
//
//   1. Every record belongs to exactly ONE business line. Herman Legacy Digital
//      (HLD) and Herman Supply Chain Solutions (HSCS) share software, never
//      records, campaigns, offers or money.
//   2. A demonstration record is never an actual result. `isDemo` is required
//      (not optional) so nobody can forget to set it, and every metric excludes
//      demo records and says how many it excluded.

export type BusinessLine = "hld" | "hscs";

export const BUSINESS_LINES: readonly BusinessLine[] = ["hld", "hscs"];

/** Where a lead came from. Inbound and referral are first-class, not afterthoughts. */
export type LeadOrigin = "discovered" | "inbound_inquiry" | "referral";

/** Acquisition channel, derived from attribution (see attribution.ts). */
export type Channel =
  | "discovery_outreach"
  | "google_organic"
  | "google_business_profile"
  | "google_ads"
  | "referral"
  | "email"
  | "social"
  | "direct"
  | "other"
  | "unknown";

/** One record of something that really happened (or a clearly marked demo). */
export interface GrowthEvent {
  id: string;
  line: BusinessLine;
  leadId: string;
  kind: GrowthEventKind;
  /** ISO timestamp. */
  at: string;
  channel: Channel;
  isDemo: boolean;
  /** Industry label of the lead, when known — used by the feedback loop. */
  industry: string | undefined;
  /** Agreement signed: money agreed, in cents. Payments are tracked by billing. */
  implementationCents?: number;
  monthlyCents?: number;
  /** Services sold (agreement) or proposed (proposal). */
  services?: string[];
  /** Lost deals: the reason, in the words recorded by a person. */
  lostReason?: string;
  /** Objection or capability a prospect asked for, recorded by a person. */
  note?: string;
}

export type GrowthEventKind =
  | "discovered"
  | "review_completed"
  | "qualified"
  | "inquiry_received"
  | "referral_received"
  | "outreach_sent"
  | "outreach_response"
  | "consultation_held"
  | "proposal_sent"
  | "agreement_signed"
  | "deal_lost"
  | "objection_recorded"
  | "capability_requested";

/** Money HLG spent to acquire customers. */
export interface CampaignExpense {
  id: string;
  line: BusinessLine;
  channel: Channel;
  campaignKey: string;
  cents: number;
  /** ISO date the spend was incurred. */
  at: string;
  isDemo: boolean;
}
