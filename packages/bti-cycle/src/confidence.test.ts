import { describe, expect, it } from "vitest";
import {
  atLeast,
  capByWeakest,
  degrade,
  effectiveTier,
  isOutdated,
  weaker,
} from "./confidence.ts";
import type { EvidenceItem } from "./types.ts";

const AS_OF = "2026-08-06";

function ev(
  partial: Partial<EvidenceItem> & Pick<EvidenceItem, "quality">,
): EvidenceItem {
  return { id: "x", fact: "f", link: "demand", ...partial };
}

describe("quality axis ordering", () => {
  it("ranks strongest to weakest", () => {
    expect(atLeast("verified", "unknown")).toBe(true);
    expect(atLeast("unknown", "verified")).toBe(false);
    expect(weaker("observed", "assumed")).toBe("assumed");
    expect(degrade("verified", 2)).toBe("estimated");
    expect(degrade("assumed", 5)).toBe("unknown"); // clamped
  });
});

describe("effectiveTier — flags degrade any tier", () => {
  it("conflicting → unknown until reconciled", () => {
    expect(
      effectiveTier(
        ev({ quality: "verified", sources: ["a", "b"], flags: ["conflicting"] }),
        AS_OF,
      ),
    ).toBe("unknown");
  });

  it("insufficient → degrade one tier", () => {
    expect(
      effectiveTier(ev({ quality: "observed", flags: ["insufficient"] }), AS_OF),
    ).toBe("estimated");
  });

  it("verified requires >=2 independent sources, else observed", () => {
    expect(
      effectiveTier(ev({ quality: "verified", sources: ["only-one"] }), AS_OF),
    ).toBe("observed");
    expect(effectiveTier(ev({ quality: "verified", sources: ["a", "b"] }), AS_OF)).toBe(
      "verified",
    );
  });

  it("outdated by validity window → unknown", () => {
    const stale = ev({
      quality: "observed",
      capturedAt: "2020-01-01",
      validityWindowDays: 30,
    });
    expect(isOutdated(stale, AS_OF)).toBe(true);
    expect(effectiveTier(stale, AS_OF)).toBe("unknown");
  });

  it("no capture date → never outdated (cannot claim staleness without data)", () => {
    expect(isOutdated(ev({ quality: "observed" }), AS_OF)).toBe(false);
  });
});

describe("capByWeakest — a recommendation is only as strong as its weakest input", () => {
  it("caps to the weakest effective tier", () => {
    const items = [
      ev({ id: "1", quality: "verified", sources: ["a", "b"] }),
      ev({ id: "2", quality: "unknown" }),
    ];
    expect(capByWeakest(items, AS_OF)).toBe("unknown");
  });

  it("with no load-bearing inputs there is nothing to stand on → unknown", () => {
    expect(capByWeakest([], AS_OF)).toBe("unknown");
  });
});
