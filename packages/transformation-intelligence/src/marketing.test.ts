import { describe, it, expect } from "vitest";
import {
  hermanLegacyMarketing,
  marketingCapabilityReuse,
  MARKETING_COMMERCIALIZATION,
} from "./marketing";
import {
  aiMarketingStudioArchitecture,
  GENERATION_CAPABILITIES,
} from "./marketing-studio";
import { contentManufacturing, CONTENT_TYPES } from "./content-manufacturing";
import { campaignFramework, INITIAL_CAMPAIGNS } from "./campaigns";
import { growthDashboard, hermanLegacyMarketingSystem } from "./growth-dashboard";

describe("Deliverable 1/2 — operating model + capability reuse", () => {
  const reuse = marketingCapabilityReuse();

  it("assembles marketing from 14 systems, most reused", () => {
    expect(reuse.total).toBe(14);
    expect(reuse.reusePct).toBeGreaterThanOrEqual(80);
  });

  it("honestly names the two net-new systems", () => {
    expect(reuse.netNewSystems.sort()).toEqual([
      "Campaign Tracking",
      "Content Management",
    ]);
  });

  it("reuses Venuewise media/analytics/scheduling cross-platform", () => {
    expect(reuse.crossPlatformCount).toBeGreaterThan(0);
  });

  it("supports all five commercialization layers", () => {
    const model = hermanLegacyMarketing();
    expect(model.supportsAllLayers).toBe(true);
    expect(MARKETING_COMMERCIALIZATION.map((c) => c.layer)).toEqual([
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
    ]);
  });
});

describe("Deliverable 3 — AI Marketing Studio", () => {
  const arch = aiMarketingStudioArchitecture();

  it("orchestrates 5 generation types, ALL routed through the AI Gateway", () => {
    expect(GENERATION_CAPABILITIES).toHaveLength(5);
    for (const g of GENERATION_CAPABILITIES) {
      expect(g.routedThroughGateway).toBe(true);
      expect(g.gatewayAsset).toBe("ai.gateway-runtime");
    }
  });

  it("wires NO external providers (deferred until CEO approval)", () => {
    expect(arch.externalProvidersWired).toBe(false);
    for (const g of GENERATION_CAPABILITIES) expect(g.provider).toBe("deferred");
  });
});

describe("Deliverable 4 — content manufacturing", () => {
  const cm = contentManufacturing();

  it("defines all 15 content types on one repeatable workflow", () => {
    expect(CONTENT_TYPES).toHaveLength(15);
    expect(cm.workflow).toHaveLength(10);
    expect(cm.gatedStages).toBeGreaterThan(0);
  });

  it("every content type declares its generation recipe", () => {
    for (const t of CONTENT_TYPES) {
      expect(t.generationKinds.length).toBeGreaterThan(0);
      expect(t.channel.length).toBeGreaterThan(0);
    }
  });
});

describe("Deliverables 5,7–9 — campaign framework + client campaigns", () => {
  const cf = campaignFramework();

  it("defines the 8-stage lifecycle and 3 client campaigns", () => {
    expect(cf.lifecycle).toHaveLength(8);
    expect(cf.campaignCount).toBe(3);
    expect(cf.clients.sort()).toEqual(["HSCS", "Herman Legacy Group", "Venuewise"]);
  });

  it("every campaign carries all 8 required fields", () => {
    expect(cf.allFieldsPresent).toBe(true);
  });

  it("no campaign is live (nothing publishes without CEO approval)", () => {
    expect(cf.liveCampaigns).toBe(0);
    for (const c of INITIAL_CAMPAIGNS) expect(c.status).toBe("draft");
  });
});

describe("Deliverable 6 — Growth Dashboard (honesty)", () => {
  const d = growthDashboard();

  it("reports real measurable metrics", () => {
    expect(d.measurable.marketingReusePct).toBeGreaterThan(0);
    expect(d.measurable.factoryCapabilityReusePct).toBeGreaterThan(0);
    expect(d.measurable.contentTypesAvailable).toBe(15);
    expect(d.measurable.campaignsDefined).toBe(3);
  });

  it("NEVER fabricates growth metrics — all zero/no-data, no campaigns live", () => {
    expect(d.growth.dataStatus).toBe("no_campaigns_live_yet");
    expect(d.growth.traffic).toBe(0);
    expect(d.growth.qualifiedLeads).toBe(0);
    expect(d.growth.customers).toBe(0);
    expect(d.growth.revenueAttribution).toBe(0);
    expect(d.growth.seoScore).toBeNull();
    expect(d.growth.campaignRoi).toBeNull();
    expect(d.growth.customerAcquisitionCost).toBeNull();
    expect(d.growth.lifetimeValue).toBeNull();
  });
});

describe("The assembled Herman Legacy Marketing system", () => {
  it("bundles operating model + studio + content + campaigns + growth", () => {
    const sys = hermanLegacyMarketingSystem();
    expect(sys.operatingModel.mission.length).toBeGreaterThan(0);
    expect(sys.studio.generation).toHaveLength(5);
    expect(sys.content.typeCount).toBe(15);
    expect(sys.campaigns.campaignCount).toBe(3);
    expect(sys.growth.growth.dataStatus).toBe("no_campaigns_live_yet");
  });
});
