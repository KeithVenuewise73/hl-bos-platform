import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import {
  assessGovOpportunity,
  ourCapabilities,
  type GovOpportunity,
  type OurCapability,
} from "./government";

const C = DEFAULT_CONFIG;
const CAPS: OurCapability[] = [
  { key: "scheduling", name: "Scheduling" },
  { key: "communications", name: "Communications" },
  { key: "route-assessment", name: "Route Assessment" },
];

describe("government contracts intelligence", () => {
  it("reads our real registered capabilities from the catalog", () => {
    const caps = ourCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.key && c.name)).toBe(true);
  });

  it("computes win probability as a capability-match ratio", () => {
    const opp: GovOpportunity = {
      id: "gov-1",
      title: "Regional logistics scheduling",
      requiredCapabilities: ["Scheduling", "Route Assessment"],
    };
    const a = assessGovOpportunity(opp, C, CAPS);
    expect(a.winProbability.score).toBe(100);
    expect(a.winProbability.band).toBe("high");
    expect(a.gapCount).toBe(0);
    expect(a.ceoRecommendation.verdict).toBe("pursue");
  });

  it("flags capability gaps and recommends partnering", () => {
    const opp: GovOpportunity = {
      id: "gov-2",
      title: "Clinical records modernization",
      requiredCapabilities: ["Scheduling", "Electronic Health Records", "Billing"],
    };
    const a = assessGovOpportunity(opp, C, CAPS);
    expect(a.gapCount).toBeGreaterThan(0);
    expect(a.capabilityGaps.some((g) => !g.have)).toBe(true);
    expect(["pursue_with_partner", "decline"]).toContain(a.ceoRecommendation.verdict);
  });

  it("withholds profit until a contract value is supplied", () => {
    const opp: GovOpportunity = {
      id: "gov-3",
      title: "No value given",
      requiredCapabilities: ["Scheduling"],
    };
    const a = assessGovOpportunity(opp, C, CAPS);
    expect(a.estimatedProfit.estimatedProfit).toBeNull();
    expect(a.estimatedProfit.note).toMatch(/required/i);
  });

  it("estimates profit from a supplied value and margin, flagged illustrative", () => {
    const opp: GovOpportunity = {
      id: "gov-4",
      title: "Priced opportunity",
      value: 1000000,
      requiredCapabilities: ["Scheduling"],
    };
    const a = assessGovOpportunity(opp, C, CAPS);
    // 1,000,000 * 0.15 = 150,000
    expect(a.estimatedProfit.estimatedProfit).toBe(150000);
    expect(a.estimatedProfit.illustrative).toBe(true);
  });

  it("returns insufficient_data when no capabilities are supplied", () => {
    const opp: GovOpportunity = {
      id: "gov-5",
      title: "Unknown requirements",
      requiredCapabilities: [],
    };
    const a = assessGovOpportunity(opp, C, CAPS);
    expect(a.winProbability.band).toBeNull();
    expect(a.ceoRecommendation.verdict).toBe("insufficient_data");
  });

  it("always attaches a required CEO approval to the bid decision", () => {
    const opp: GovOpportunity = {
      id: "gov-6",
      title: "Any",
      requiredCapabilities: ["Scheduling"],
    };
    const a = assessGovOpportunity(opp, C, CAPS);
    expect(a.ceoRecommendation.approval.required).toBe(true);
    expect(a.ceoRecommendation.approval.type).toBe("ceo_spend");
  });
});
