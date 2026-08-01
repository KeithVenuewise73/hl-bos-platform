/**
 * THE GROWTH DASHBOARD (Execution Phase 3A, deliverable 6).
 *
 * Marketing performance in one picture — split, like the CEO Operations Dashboard,
 * into what is MEASURABLE today and what is genuinely zero because no campaign has
 * run yet. The brief is explicit: "Do not fabricate metrics. Only expose
 * measurable values."
 *
 *   - `measurable`  — real: Factory capability reuse, content types available,
 *                     campaigns defined, channels covered.
 *   - `growth`      — traffic, SEO, leads, meetings, customers, revenue, ROI, CAC,
 *                     LTV. NO campaign is live, so every one is a measured zero /
 *                     no-data, with an explicit reason. Nothing is invented.
 */

import { factoryRegistrySummary } from "@hl-bos/catalog";
import { marketingCapabilityReuse } from "./marketing";
import { contentManufacturing } from "./content-manufacturing";
import { campaignFramework } from "./campaigns";
import { aiMarketingStudioArchitecture } from "./marketing-studio";
import { hermanLegacyMarketing } from "./marketing";

export interface MeasurableGrowth {
  /** Marketing-system reuse % (assembled vs net-new). */
  marketingReusePct: number;
  /** Platform-wide capability reuse (reusable implementations ÷ total). */
  factoryCapabilityReusePct: number;
  contentTypesAvailable: number;
  campaignsDefined: number;
  campaignsLive: number;
  publishingChannelsCovered: number;
}

export interface GrowthMetrics {
  dataStatus: "no_campaigns_live_yet";
  note: string;
  traffic: number;
  seoScore: null;
  visibilityScore: null;
  engagement: number;
  qualifiedLeads: number;
  meetings: number;
  customers: number;
  revenueAttribution: number;
  campaignRoi: null;
  customerAcquisitionCost: null;
  lifetimeValue: null;
}

export interface GrowthDashboard {
  measurable: MeasurableGrowth;
  growth: GrowthMetrics;
  honesty: string;
}

/** The Growth Dashboard — measurable real, growth honest-zero. */
export function growthDashboard(): GrowthDashboard {
  const reuse = marketingCapabilityReuse();
  const reg = factoryRegistrySummary();
  const content = contentManufacturing();
  const campaigns = campaignFramework();
  const channels = new Set(campaigns.campaigns.flatMap((c) => c.publishingChannels));

  const measurable: MeasurableGrowth = {
    marketingReusePct: reuse.reusePct,
    factoryCapabilityReusePct:
      reg.implementations === 0
        ? 0
        : Math.round((reg.reusableNow / reg.implementations) * 100),
    contentTypesAvailable: content.typeCount,
    campaignsDefined: campaigns.campaignCount,
    campaignsLive: campaigns.liveCampaigns,
    publishingChannelsCovered: channels.size,
  };

  const growth: GrowthMetrics = {
    dataStatus: "no_campaigns_live_yet",
    note:
      "No marketing campaign is live: nothing has been published, so every growth figure below " +
      "is a measured zero / no-data, never an estimate. These populate once campaigns publish " +
      "(gated on CEO approval) and analytics begin to flow.",
    traffic: 0,
    seoScore: null,
    visibilityScore: null,
    engagement: 0,
    qualifiedLeads: 0,
    meetings: 0,
    customers: 0,
    revenueAttribution: 0,
    campaignRoi: null,
    customerAcquisitionCost: null,
    lifetimeValue: null,
  };

  return {
    measurable,
    growth,
    honesty:
      "Measurable marketing/Factory metrics are real and computed. Growth metrics (traffic, " +
      "SEO, leads, meetings, customers, revenue, ROI, CAC, LTV) are zero/no-data because no " +
      "campaign is live — reported, never fabricated.",
  };
}

// ==========================================================================
// The one assembled Herman Legacy Marketing system (entry point + portal)
// ==========================================================================

/** The complete Herman Legacy Marketing unit — one bundle for the portal. */
export function hermanLegacyMarketingSystem() {
  return {
    operatingModel: hermanLegacyMarketing(),
    studio: aiMarketingStudioArchitecture(),
    content: contentManufacturing(),
    campaigns: campaignFramework(),
    growth: growthDashboard(),
  };
}
