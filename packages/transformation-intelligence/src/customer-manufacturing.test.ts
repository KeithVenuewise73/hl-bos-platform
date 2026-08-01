import { describe, it, expect } from "vitest";
import { ORDER } from "@hl-bos/bti-engine";
import {
  CUSTOMER_LIFECYCLE,
  customerManufacturingLifecycle,
  noDuplicateSystems,
} from "./customer-lifecycle";
import { evaluateVisibilityAi } from "./visibility-ai";
import { intelligenceCrmModel } from "./crm";
import { ceoOperationsDashboard } from "./ceo-operations";
import {
  END_TO_END_PATH,
  validateCustomerManufacturing,
  customerManufacturingSystem,
} from "./customer-manufacturing";

describe("CP2 — customer manufacturing lifecycle", () => {
  const result = customerManufacturingLifecycle();

  it("defines the full customer lifecycle riding on the reused engagement machine", () => {
    expect(CUSTOMER_LIFECYCLE.length).toBeGreaterThanOrEqual(21);
    // Every stage's engagement stage is a real bti-engine ORDER stage (reuse).
    for (const s of CUSTOMER_LIFECYCLE) {
      expect(ORDER).toContain(s.engagementStage);
    }
  });

  it("rides validly on the reused engagement state machine", () => {
    expect(result.engagementPathValid).toBe(true);
  });

  it("introduces NO duplicate system — every stage is backed by an existing asset", () => {
    const dup = noDuplicateSystems();
    expect(dup.ok).toBe(true);
    expect(dup.unknownAssets).toEqual([]);
    expect(dup.reusedAssets.length).toBeGreaterThan(0);
  });

  it("honestly reports the net-new gaps (customer success desk, referral program)", () => {
    expect(result.netNewCapabilities).toContain("customer success desk");
    expect(result.netNewCapabilities).toContain("referral program");
    // Most of the lifecycle assembles from existing capability.
    expect(result.assemblablePct).toBeGreaterThan(70);
  });

  it("an analysis-only engagement is capped before delivery (reused cap)", () => {
    const analysisOnly = customerManufacturingLifecycle("analysis_only");
    // The full delivery lifecycle exceeds the analysis-only cap — honestly invalid.
    expect(analysisOnly.engagementPathValid).toBe(false);
  });
});

describe("VisibilityAI evaluation", () => {
  const v = evaluateVisibilityAi();

  it("already supports most of the nine functions without redesign", () => {
    expect(v.functions).toHaveLength(9);
    expect(v.supportedCount).toBeGreaterThanOrEqual(6);
    expect(v.noRedesignRequired).toBe(true);
  });

  it("honestly flags competitive analysis as the one net-new function", () => {
    const comp = v.functions.find((f) => f.name === "Competitive Analysis")!;
    expect(comp.support).toBe("net_new");
  });
});

describe("CP3 — Intelligence CRM", () => {
  const crm = intelligenceCrmModel();

  it("models 17 entities, each backed by an existing system (no new database)", () => {
    expect(crm.total).toBe(17);
    expect(crm.reusedAssets.length).toBeGreaterThan(0);
  });

  it("only Customer Health is net-new (the customer-success desk gap)", () => {
    expect(crm.netNewCount).toBe(1);
    expect(crm.netNewEntities).toEqual(["Customer Health"]);
  });
});

describe("CP4 — CEO operations dashboard (honesty)", () => {
  const d = ceoOperationsDashboard();

  it("reports real, measurable factory metrics", () => {
    expect(d.measurable.portfolioProducts).toBeGreaterThan(0);
    expect(d.measurable.capabilityReusePct).toBeGreaterThan(0);
    expect(d.measurable.assemblableNow).toBeGreaterThan(0);
  });

  it("NEVER fabricates operational metrics — all zero, no customers yet", () => {
    expect(d.operational.dataStatus).toBe("no_operating_customers_yet");
    expect(d.operational.currentLeads).toBe(0);
    expect(d.operational.mrr).toBe(0);
    expect(d.operational.arr).toBe(0);
    expect(d.operational.customerHealth).toBeNull();
    expect(d.operational.revenueByProduct).toEqual([]);
    expect(Object.values(d.operational.revenueByLayer).every((v) => v === 0)).toBe(
      true,
    );
  });

  it("does not claim any product manufactured-and-launched", () => {
    expect(d.measurable.productsManufacturedAndLaunched).toBe(0);
  });
});

describe("CP5 — end-to-end validation", () => {
  const v = validateCustomerManufacturing();

  it("demonstrates the full Discovery→…→Renewal path with no duplicate systems", () => {
    expect(END_TO_END_PATH).toHaveLength(8);
    expect(v.waypoints).toHaveLength(8);
    expect(v.allWaypointsResolved).toBe(true);
    expect(v.forwardWalkValid).toBe(true);
    expect(v.noDuplicateSystems).toBe(true);
    expect(v.visibilityNoRedesign).toBe(true);
    expect(v.crmNoNewDatabase).toBe(true);
    expect(v.ok).toBe(true);
    expect(v.failures).toEqual([]);
  });

  it("the bundled system exposes lifecycle + VisibilityAI + CRM + dashboard", () => {
    const sys = customerManufacturingSystem();
    expect(sys.lifecycle.stages.length).toBeGreaterThanOrEqual(21);
    expect(sys.visibilityAi.functions).toHaveLength(9);
    expect(sys.crm.total).toBe(17);
    expect(sys.ceoDashboard.operational.dataStatus).toBe("no_operating_customers_yet");
    expect(sys.validation.ok).toBe(true);
  });
});
