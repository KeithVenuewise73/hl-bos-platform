import { describe, expect, it } from "vitest";
import {
  balance,
  canAfford,
  costOf,
  entitlementAllows,
  settle,
  type CreditEntry,
} from "./credits";

const grant: CreditEntry = {
  amount: 10,
  eventType: "grant",
  generationJobId: null,
  description: "grant",
};

describe("costs", () => {
  it("charges per scene for a storyboard", () => {
    expect(costOf("single")).toBe(1);
    expect(costOf("story-3")).toBe(3);
    expect(costOf("story-6")).toBe(6);
    expect(costOf("variation")).toBe(1);
    expect(costOf("regenerate")).toBe(1);
  });
});

describe("settlement", () => {
  it("charges for a delivered generation", () => {
    const s = settle({ type: "story-6", outcome: "complete", jobId: "j" });
    expect(s.charge).toBe(6);
    expect(s.refund).toBe(0);
    expect(s.entries[0]?.amount).toBe(-6);
  });

  it("charges nothing for a blocked request", () => {
    const s = settle({ type: "story-6", outcome: "blocked", jobId: "j" });
    expect(s.charge).toBe(0);
    expect(s.refund).toBe(6);
    expect(s.entries[0]?.description).toContain("no credits used");
  });

  it("charges nothing when the provider fails", () => {
    expect(
      settle({ type: "single", outcome: "provider-failure", jobId: "j" }).charge,
    ).toBe(0);
  });

  it("charges nothing when our own output is rejected", () => {
    // The user did nothing wrong; we generated something we then refused to
    // show them. Charging for that is charging for our mistake.
    const s = settle({ type: "single", outcome: "output-rejected", jobId: "j" });
    expect(s.charge).toBe(0);
    expect(s.refund).toBe(1);
  });

  it("charges only for the panels a partial storyboard delivered", () => {
    const s = settle({
      type: "story-6",
      outcome: "partial",
      jobId: "j",
      scenesDelivered: 3,
      scenesRequested: 6,
    });
    expect(s.charge).toBe(3);
    expect(s.refund).toBe(3);
    expect(s.entries.map((e) => e.eventType)).toEqual(["debit", "refund"]);
  });

  it("refunds everything when a partial run delivered nothing", () => {
    const s = settle({
      type: "story-3",
      outcome: "partial",
      jobId: "j",
      scenesDelivered: 0,
      scenesRequested: 3,
    });
    expect(s.charge).toBe(0);
    expect(s.refund).toBe(3);
  });

  it("never charges more than was held", () => {
    const s = settle({
      type: "story-3",
      outcome: "partial",
      jobId: "j",
      scenesDelivered: 99,
      scenesRequested: 3,
    });
    expect(s.charge).toBeLessThanOrEqual(3);
  });

  it("records a refund as a second entry, never as an edit", () => {
    const s = settle({ type: "single", outcome: "blocked", jobId: "j" });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]?.eventType).toBe("refund");
    expect(s.entries[0]?.generationJobId).toBe("j");
  });
});

describe("balance and affordability", () => {
  it("sums an append-only ledger", () => {
    expect(
      balance([
        grant,
        { amount: -3, eventType: "debit", generationJobId: "j", description: "" },
        { amount: 3, eventType: "refund", generationJobId: "j", description: "" },
      ]),
    ).toBe(10);
  });

  it("reports the shortfall rather than just refusing", () => {
    const check = canAfford([{ ...grant, amount: 2 }], "story-6");
    expect(check.affordable).toBe(false);
    expect(check.shortfall).toBe(4);
  });

  it("allows a generation that exactly spends the balance", () => {
    expect(canAfford([{ ...grant, amount: 6 }], "story-6").affordable).toBe(true);
  });
});

describe("entitlements are a server-side gate", () => {
  it("holds free accounts to a single scene", () => {
    const check = entitlementAllows("free", { type: "story-3" });
    expect(check.allowed).toBe(false);
    if (check.allowed) return;
    expect(check.requiredEntitlement).toBe("plus");
  });

  it("holds Plus to three scenes", () => {
    expect(entitlementAllows("plus", { type: "story-3" }).allowed).toBe(true);
    const six = entitlementAllows("plus", { type: "story-6" });
    expect(six.allowed).toBe(false);
    if (six.allowed) return;
    expect(six.requiredEntitlement).toBe("story_pro");
  });

  it("gates Continue From Here behind Story Pro", () => {
    const check = entitlementAllows("plus", { type: "continue" });
    expect(check.allowed).toBe(false);
    if (check.allowed) return;
    expect(check.reason).toBe("continue_from_here");
    expect(entitlementAllows("story_pro", { type: "continue" }).allowed).toBe(true);
  });

  it("allows Story Pro the full six", () => {
    expect(entitlementAllows("story_pro", { type: "story-6" }).allowed).toBe(true);
  });
});
