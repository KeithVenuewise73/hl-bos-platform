import { describe, it, expect } from "vitest";
import { analyzeReuse } from "./reuse";

describe("reuse analysis (deterministic, over real @hl-bos/catalog)", () => {
  it("is deterministic: same input → identical result", () => {
    const input = { title: "Tenant identity and permissions service" };
    const a = analyzeReuse(input);
    const b = analyzeReuse(input);
    expect(a).toEqual(b);
  });

  it("produces a reuse score in [0,100]", () => {
    const a = analyzeReuse({ title: "AI gateway for metered model calls" });
    expect(a.reuseScore).toBeGreaterThanOrEqual(0);
    expect(a.reuseScore).toBeLessThanOrEqual(100);
  });

  it("exposes the exact formula used (not a free-form opinion)", () => {
    const a = analyzeReuse({ title: "billing subscriptions" });
    expect(a.formula).toContain("reuseScore =");
    expect(a.formula).toContain(String(a.reuseScore));
  });

  it("scores an unrelated greenfield idea as mostly net-new (low reuse)", () => {
    const a = analyzeReuse({
      title: "Underwater basket-weaving marketplace zzzq",
      summary: "A wholly unrelated consumer concept with no platform overlap.",
    });
    expect(a.verdict).toBe("BUILD_NEW");
    expect(a.reuseScore).toBeLessThan(30);
    expect(a.requiresHumanReview).toBe(true);
  });

  it("returns capability matches drawn from the real catalog", () => {
    const a = analyzeReuse({ title: "identity" });
    // matches array is always defined and each carries a catalog capability id
    expect(Array.isArray(a.matches)).toBe(true);
    for (const m of a.matches) expect(typeof m.capabilityId).toBe("string");
  });
});
