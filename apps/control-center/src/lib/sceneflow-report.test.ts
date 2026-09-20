import { describe, expect, it } from "vitest";
import { hardBlockers, readinessFrom } from "./sceneflow-report";
import type { GpuFinding } from "./gpu-report";

/** A probe result, as gpu-report would have produced it. */
function finding(overrides: Partial<GpuFinding> = {}): GpuFinding {
  return {
    verdict: "yes",
    headline: "",
    detail: "",
    adapters: [],
    nvidia: null,
    canRun: [],
    evidence: ["ran: nvidia-smi"],
    ...overrides,
  };
}

describe("a card that can hold a model", () => {
  const readiness = readinessFrom(
    finding({ nvidia: { name: "NVIDIA GeForce RTX 4090", vramMB: 24_564 } }),
  );

  it("says yes, and names the card and the model", () => {
    expect(readiness.verdict).toBe("yes");
    expect(readiness.headline).toContain("RTX 4090");
    expect(readiness.headline).toContain("24GB");
    expect(readiness.best?.model).toContain("Kontext");
  });

  it("still refuses to claim it can generate anything today", () => {
    // The whole point. A fitting card is not a working product, and a page
    // that said otherwise would be a control that cannot do its job.
    expect(readiness.canGenerateToday).toBe(false);
    expect(readiness.detail).toContain("cannot generate anything today");
  });

  it("says nothing would be metered and no photograph would leave the machine", () => {
    expect(readiness.detail).toContain("Nothing would be metered");
    expect(readiness.detail).toContain("leave this machine");
  });

  it("states that it chooses the model itself, so nobody has to relay a number", () => {
    expect(readiness.detail).toContain("it decides that itself");
  });
});

describe("a card that is too small", () => {
  const readiness = readinessFrom(
    finding({ nvidia: { name: "NVIDIA GeForce GTX 1660", vramMB: 6_144 } }),
  );

  it("says no without pretending the card is absent", () => {
    expect(readiness.verdict).toBe("no");
    expect(readiness.headline).toContain("GTX 1660");
    expect(readiness.best).toBeNull();
  });

  it("names the shortfall in gigabytes rather than in jargon", () => {
    expect(readiness.detail).toContain("6.0GB");
    // 7.8GB, not 8.0: the thresholds are in the MiB units nvidia-smi reports,
    // so the smallest tier's 8,000 MiB is 7.8 GiB. The threshold sits below the
    // marketing size on purpose — a card sold as "8GB" reports ~8,192 MiB and
    // clears it, and one sold as "24GB" reports 24,564, not 24,576.
    expect(readiness.detail).toContain("7.8GB");
  });

  it("offers the alternatives instead of stopping at no", () => {
    expect(readiness.detail).toContain("renting a machine");
  });
});

describe("a card whose driver did not answer", () => {
  // gpu-report already distinguishes "no card" from "card, broken driver".
  // Flattening that to "no" would send someone to buy hardware they own.
  const readiness = readinessFrom(
    finding({
      verdict: "unknown",
      headline: "There is an NVIDIA card here, but its driver tools did not answer.",
      detail: "Windows reports NVIDIA GeForce RTX 3080, so the hardware is present.",
      adapters: ["NVIDIA GeForce RTX 3080"],
    }),
  );

  it("carries the distinction through rather than flattening it", () => {
    expect(readiness.verdict).toBe("unknown");
    expect(readiness.headline).toContain("driver tools did not answer");
    expect(readiness.detail).toContain("hardware is present");
  });
});

describe("the rented-machine and hosted-service routes are not conflated", () => {
  const readiness = readinessFrom(
    finding({ verdict: "no", headline: "No NVIDIA card.", detail: "Intel only." }),
  );

  it("keeps renting a machine open, because we would still run the model", () => {
    expect(readiness.detail).toContain("Renting a machine with a card");
    expect(readiness.detail).toContain("running the model ourselves");
  });

  it("separates a hosted service, whose terms demand recorded consent", () => {
    expect(readiness.detail).toContain("hosted image service");
    expect(readiness.detail).toContain("recorded consent");
  });
});

describe("no NVIDIA card at all", () => {
  const readiness = readinessFrom(
    finding({
      verdict: "no",
      headline: "No NVIDIA card — the graphics here are built into the processor.",
      detail: "The only display hardware found is Intel UHD Graphics.",
      adapters: ["Intel UHD Graphics"],
    }),
  );

  it("reports no without sending us to a route that has its own consent bar", () => {
    expect(readiness.verdict).toBe("no");
    expect(readiness.detail).toContain("recorded consent");
  });

  it("never reports a verdict of yes without a card", () => {
    expect(readiness.verdict).not.toBe("yes");
  });
});

describe("a probe that read a card but reported no memory", () => {
  it("does not promote it to yes", () => {
    const readiness = readinessFrom(finding({ verdict: "yes", nvidia: null }));
    expect(readiness.verdict).toBe("unknown");
    expect(readiness.best).toBeNull();
  });
});

describe("what is still in the way", () => {
  const readiness = readinessFrom(
    finding({ nvidia: { name: "RTX 4090", vramMB: 24_564 } }),
  );

  it("names the missing runtime as a hard blocker, whatever the hardware says", () => {
    const hard = hardBlockers(readiness).map((b) => b.id);
    expect(hard).toContain("runtime");
    expect(hard).toContain("moderation");
  });

  it("keeps the output check as a hard requirement even on our own machine", () => {
    const moderation = readiness.blockers.find((b) => b.id === "moderation");
    expect(moderation?.hard).toBe(true);
    // The property, not the wording: an unchecked image is not shown, and a
    // failed one is destroyed rather than kept.
    expect(moderation?.what).toContain("is not displayed");
    expect(moderation?.what).toContain("deleted");
  });

  it("writes down the private-use licence decision so it is not re-litigated", () => {
    const licence = readiness.blockers.find((b) => b.id === "licence-scope");
    expect(licence?.owner).toBe("ceo");
    expect(licence?.what).toContain("private tool, not a product for sale");
    expect(licence?.what).toContain("paying users");
  });

  it("carries the probe's evidence through, so nothing is a black box", () => {
    expect(readiness.evidence).toContain("ran: nvidia-smi");
  });
});
