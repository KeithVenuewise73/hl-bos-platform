import { describe, it, expect } from "vitest";
import { CAPABILITIES, capabilityById } from "./capabilities";
import {
  SOURCE_PLATFORMS,
  platformById,
  CAPABILITY_IMPLEMENTATIONS,
  HLBOS_IMPLEMENTATIONS,
  VENUEWISE_IMPLEMENTATIONS,
  implementationsOnPlatform,
  implementationsForCapability,
  mostMatureImplementation,
  findImplementations,
  platformsProviding,
  contestedCapabilities,
  factoryRegistrySummary,
} from "./factory-registry";
import {
  FACTORY_ORDER_PROCESS,
  MARKET_BLUEPRINTS,
  assembleBlueprint,
  allMarketBlueprints,
  factoryValidation,
} from "./factory-blueprints";

describe("Factory registry — source platforms", () => {
  it("declares HL-BOS Core (canonical, operational) targeting the correct Supabase ref", () => {
    const core = platformById("hlbos_core");
    expect(core).toBeDefined();
    expect(core?.kind).toBe("canonical");
    expect(core?.status).toBe("operational");
    expect(core?.supabaseRef).toBe("mvvtngiopdrgiedjmhfb");
    expect(core?.dataResidency).toBe("in_hlbos");
  });

  it("declares Venuewise as external read-only (no data copied into HL-BOS)", () => {
    const vw = platformById("venuewise_platform");
    expect(vw?.dataResidency).toBe("external_readonly");
    expect(vw?.status).toBe("reference_only");
  });

  it("declares HSCS as a planned placeholder with zero implementations", () => {
    const hscs = platformById("hscs");
    expect(hscs?.status).toBe("planned");
    expect(hscs?.supabaseRef).toBeNull();
    expect(implementationsOnPlatform("hscs")).toHaveLength(0);
  });

  it("has exactly one operational platform (only HL-BOS is a real HL-BOS backend)", () => {
    expect(SOURCE_PLATFORMS.filter((p) => p.status === "operational")).toHaveLength(1);
  });
});

describe("Factory registry — capability implementations", () => {
  it("derives exactly one HL-BOS implementation per canonical capability", () => {
    expect(HLBOS_IMPLEMENTATIONS).toHaveLength(CAPABILITIES.length);
    for (const impl of HLBOS_IMPLEMENTATIONS) {
      expect(impl.capabilityId).not.toBeNull();
      expect(capabilityById(impl.capabilityId!)).toBeDefined();
    }
  });

  it("has no dangling capability references (every linked id resolves)", () => {
    expect(factoryRegistrySummary().danglingCapabilityRefs).toEqual([]);
  });

  it("labels every Venuewise implementation as harvest_asserted", () => {
    for (const impl of VENUEWISE_IMPLEMENTATIONS) {
      expect(impl.verification).toBe("harvest_asserted");
    }
  });

  it("gives every implementation a unique id", () => {
    const ids = CAPABILITY_IMPLEMENTATIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires evidence on every implementation (Principle 10)", () => {
    for (const impl of CAPABILITY_IMPLEMENTATIONS) {
      expect(impl.evidence.length).toBeGreaterThan(10);
    }
  });
});

describe("Factory registry — cross-platform reasoning", () => {
  it("scheduling is PLANNED on HL-BOS but PRODUCTION on Venuewise (the killer gap)", () => {
    const impls = implementationsForCapability("scheduling");
    const hlbos = impls.find((i) => i.platform === "hlbos_core");
    const vw = impls.find((i) => i.platform === "venuewise_platform");
    expect(hlbos?.maturity).toBe("planned");
    expect(vw?.maturity).toBe("production");
    // The Factory picks the mature one.
    expect(mostMatureImplementation("scheduling")?.platform).toBe("venuewise_platform");
  });

  it("billing exists on both platforms (contested — needs a canonical decision)", () => {
    const billing = findImplementations("billing");
    const platforms = new Set(billing.map((i) => i.platform));
    expect(platforms.has("hlbos_core")).toBe(true);
    expect(platforms.has("venuewise_platform")).toBe(true);
    const contestedIds = contestedCapabilities().map((c) => c.capabilityId);
    expect(contestedIds).toContain("billing");
  });

  it("platformsProviding returns the best maturity per platform", () => {
    const sched = platformsProviding("scheduling");
    const vw = sched.find((s) => s.platform === "venuewise_platform");
    expect(vw?.maturity).toBe("production");
  });

  it("only built implementations are reusable now (planned/unknown/retired are not)", () => {
    for (const impl of CAPABILITY_IMPLEMENTATIONS) {
      const built = ["production", "functional", "partial"].includes(impl.maturity);
      expect(impl.reusableNow).toBe(built);
    }
  });
});

describe("Factory blueprints — assembly", () => {
  it("defines a 12-step Factory Order Process", () => {
    expect(FACTORY_ORDER_PROCESS).toHaveLength(12);
    expect(FACTORY_ORDER_PROCESS.map((s) => s.step)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("HockeyIQ resolves sports capabilities cross-platform and flags hockey net-new work", () => {
    const bp = assembleBlueprint(
      MARKET_BLUEPRINTS.find((b) => b.productKey === "hockey_iq")!,
    );
    // Sports capabilities come from Venuewise (cross-platform reuse).
    expect(bp.crossPlatformCount).toBeGreaterThan(0);
    // Hockey-specific analytics is genuinely net-new.
    expect(bp.netNewCapabilities).toContain("hockey analytics engine");
    expect(bp.assemblableFromExisting).toBe(false);
  });

  it("Venuewise Sports is fully assemblable from existing implementations (no net-new)", () => {
    const bp = assembleBlueprint(
      MARKET_BLUEPRINTS.find((b) => b.productKey === "venuewise_sports")!,
    );
    expect(bp.netNewCount).toBe(0);
    expect(bp.assemblableFromExisting).toBe(true);
  });

  it("every market blueprint produces deterministic steps", () => {
    for (const bp of allMarketBlueprints()) {
      expect(bp.steps.length).toBeGreaterThan(0);
      expect(bp.slots.length).toBe(
        MARKET_BLUEPRINTS.find((b) => b.productKey === bp.productKey)!
          .requiredCapabilities.length,
      );
    }
  });
});

describe("Factory validation — the seven questions", () => {
  const v = factoryValidation();

  it("Q1: a platform provides CRM", () => {
    expect(v.q1_crmProviders.length).toBeGreaterThan(0);
    expect(v.q1_crmProviders.some((p) => p.platform === "venuewise_platform")).toBe(
      true,
    );
  });

  it("Q2: billing implementations exist on multiple platforms", () => {
    expect(v.q2_billingImplementations.length).toBeGreaterThanOrEqual(2);
  });

  it("Q3: the mature scheduling implementation is Venuewise", () => {
    expect(v.q3_matureScheduling?.platform).toBe("venuewise_platform");
    expect(v.q3_matureScheduling?.maturity).toBe("production");
  });

  it("Q4/Q5: HockeyIQ has available capabilities AND net-new work", () => {
    expect(v.q4_hockeyAvailableCapabilities.length).toBeGreaterThan(0);
    expect(v.q5_hockeyNetNew.length).toBeGreaterThan(0);
  });

  it("Q6: some capabilities can be sold independently (L3)", () => {
    expect(v.q6_independentlySellable.length).toBeGreaterThan(0);
  });

  it("Q7: every commercialization layer has support recorded", () => {
    for (const L of ["L1", "L2", "L3", "L4", "L5"] as const) {
      expect(Array.isArray(v.q7_layerSupport[L])).toBe(true);
    }
    // Every built capability supports L1 (internal ops) or L5 (assembly) at minimum.
    expect(v.q7_layerSupport.L1.length + v.q7_layerSupport.L5.length).toBeGreaterThan(
      0,
    );
  });
});
