import { describe, it, expect } from "vitest";
import {
  factoryReuseForService,
  factoryReuseForProductKey,
  sharedSpineSize,
} from "./factory";

describe("software factory reuse integration", () => {
  it("exposes a non-zero shared spine (the reuse dividend)", () => {
    expect(sharedSpineSize()).toBeGreaterThan(0);
  });

  it("maps a reputation service to the reputation_recovery composition", () => {
    const r = factoryReuseForService("Reputation Management");
    expect(r.matchedProductKey).toBe("reputation_recovery");
    expect(r.reusePct).not.toBeNull();
    expect(r.requiredCount).not.toBeNull();
  });

  it("drives the real assembler for a known product (counts, never asserts)", () => {
    const r = factoryReuseForProductKey("salon_ai");
    expect(r.matchedProductName).toBe("SalonAI");
    expect(typeof r.reusePct).toBe("number");
    expect(r.builtCount).not.toBeNull();
    // build effort is derived from the missing-module count, not asserted
    expect(["low", "medium", "high"]).toContain(r.buildEffort);
  });

  it("reports a net-new build when no product matches", () => {
    const r = factoryReuseForService("Something With No Product");
    expect(r.matchedProductKey).toBeNull();
    expect(r.reusePct).toBeNull();
    expect(r.buildEffort).toBe("new_build");
    // even a net-new build inherits the shared spine
    expect(r.sharedSpineCount).toBe(sharedSpineSize());
  });

  it("carries honest commercial availability (never a price)", () => {
    const r = factoryReuseForProductKey("hl_bti");
    expect(r.commercialAvailability).not.toBeNull();
  });
});
