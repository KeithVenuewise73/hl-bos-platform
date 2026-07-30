import { describe, it, expect } from "vitest";
import {
  MODULE_REGISTRY,
  moduleByKey,
  PRODUCT_COMPOSITIONS,
  compositionByKey,
  assembleProduct,
  assembleAll,
  executiveReadiness,
  FACTORY_CHECKLIST,
} from "./index";

describe("module registry", () => {
  it("registers a substantial set of engineering modules", () => {
    expect(MODULE_REGISTRY.length).toBeGreaterThanOrEqual(15);
  });

  it("has unique module keys", () => {
    const keys = MODULE_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every module dependency resolves to a registered module", () => {
    const keys = new Set(MODULE_REGISTRY.map((m) => m.key));
    for (const m of MODULE_REGISTRY) {
      for (const dep of m.dependsOn) {
        expect(keys.has(dep), `${m.key} depends on unknown ${dep}`).toBe(true);
      }
    }
  });
});

describe("product compositions", () => {
  it("every required module in every composition is registered", () => {
    for (const c of PRODUCT_COMPOSITIONS) {
      for (const key of c.requiredModules) {
        expect(
          moduleByKey(key),
          `${c.productKey} requires unknown module ${key}`,
        ).toBeTruthy();
      }
    }
  });

  it("keeps pricing / licensing / ownership pending-ceo (never invents them)", () => {
    for (const c of PRODUCT_COMPOSITIONS) {
      expect(c.commercial.pricing.status).toBe("pending-ceo");
      expect(c.commercial.licensing.status).toBe("pending-ceo");
      expect(c.commercial.ownership.status).toBe("pending-ceo");
      expect(c.commercial.version).toBeNull();
    }
  });
});

describe("factory assembler", () => {
  it("assembles SalonAI entirely from registered, built modules (the reference demo)", () => {
    const salon = compositionByKey("salon_ai");
    expect(salon).toBeTruthy();
    const result = assembleProduct(salon!);
    expect(result.unregisteredModules).toEqual([]);
    expect(result.assemblable).toBe(true);
    expect(result.foundationReadinessPct).toBe(100);
    expect(result.missingModules).toEqual([]);
    expect(result.blueprint.length).toBeGreaterThan(3);
    // The reuse dividend: most modules are shared spine.
    expect(result.sharedSpineCount).toBeGreaterThanOrEqual(8);
  });

  it("HL-BTI is assemblable from registered modules", () => {
    const result = assembleProduct(compositionByKey("hl_bti")!);
    expect(result.assemblable).toBe(true);
    expect(result.foundationReadinessPct).toBe(100);
  });

  it("every product's foundation is fully built (no missing foundational modules)", () => {
    for (const a of assembleAll()) {
      expect(
        a.missingModules,
        `${a.productKey} missing: ${a.missingModules.join(",")}`,
      ).toEqual([]);
      expect(a.assemblable).toBe(true);
    }
  });
});

describe("executive readiness", () => {
  const r = executiveReadiness();

  it("computes platform, factory and commercial completion honestly", () => {
    expect(r.platformCompletionPct).toBeGreaterThan(80);
    expect(r.platformCompletionPct).toBeLessThanOrEqual(100);
    expect(r.factoryCompletionPct).toBeGreaterThan(50);
    expect(r.factoryCompletionPct).toBeLessThan(100); // gated items remain
    // No commercial terms are set → commercial readiness must NOT be inflated.
    expect(r.commercialReadinessPct).toBe(0);
  });

  it("reports HL-BTI as ready for launch and lists remaining critical work", () => {
    expect(r.productsReadyForLaunch).toContain(
      "HL-BTI (Business Transformation Intelligence)",
    );
    expect(r.remainingCriticalWork.length).toBeGreaterThan(0);
    expect(r.productsAssemblable).toBe(PRODUCT_COMPOSITIONS.length);
  });

  it("factory checklist scores are bounded", () => {
    for (const item of FACTORY_CHECKLIST) {
      expect([0, 0.5, 1]).toContain(item.score);
    }
  });
});
