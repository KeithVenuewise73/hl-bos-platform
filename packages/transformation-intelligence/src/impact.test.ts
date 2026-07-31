import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import {
  automationSavings,
  revenueUplift,
  estimateFindingImpact,
  portfolioImpact,
} from "./impact";

const C = DEFAULT_CONFIG;

describe("impact — evidence gating (Principle 10)", () => {
  it("withholds automation savings when labour inputs are missing", () => {
    const e = automationSavings(undefined, C);
    expect(e.monthlyValue).toBeNull();
    expect(e.illustrative).toBe(false);
    expect(e.note).toMatch(/required/i);
  });

  it("computes automation savings deterministically from supplied labour", () => {
    const e = automationSavings({ laborHoursPerMonth: 200, laborCostPerHour: 30 }, C);
    // 200 * 0.20 * 30 = 1200
    expect(e.monthlyValue).toBe(1200);
    expect(e.annualValue).toBe(14400);
    expect(e.illustrative).toBe(true);
    expect(e.basis).toContain("20%");
  });

  it("withholds revenue uplift when monthly revenue is missing", () => {
    const e = revenueUplift("critical", {}, C);
    expect(e.monthlyValue).toBeNull();
  });

  it("computes revenue uplift from supplied revenue and priority", () => {
    const e = revenueUplift("critical", { monthlyRevenue: 50000 }, C);
    // 50000 * 0.06 = 3000
    expect(e.monthlyValue).toBe(3000);
    expect(e.roiBand).not.toBeNull();
  });

  it("NEVER asserts a payback period (pricing is a pending CEO decision)", () => {
    const a = automationSavings({ laborHoursPerMonth: 200, laborCostPerHour: 30 }, C);
    const r = revenueUplift("high", { monthlyRevenue: 50000 }, C);
    expect(a.paybackMonths).toBeNull();
    expect(r.paybackMonths).toBeNull();
  });

  it("routes efficiency domains to savings and growth domains to revenue", () => {
    const fin = {
      monthlyRevenue: 40000,
      laborHoursPerMonth: 100,
      laborCostPerHour: 25,
    };
    const ops = estimateFindingImpact("operations", "high", fin, C);
    const growth = estimateFindingImpact("growth", "high", fin, C);
    expect(ops.label).toMatch(/automation/i);
    expect(growth.label).toMatch(/revenue/i);
  });

  it("aggregates a portfolio honestly, excluding gated estimates", () => {
    const withValue = revenueUplift("high", { monthlyRevenue: 10000 }, C); // 400
    const gated = revenueUplift("high", {}, C); // null
    const p = portfolioImpact([withValue, gated]);
    expect(p.totalMonthlyValue).toBe(400);
    expect(p.estimatesWithValue).toBe(1);
    expect(p.estimatesGated).toBe(1);
    expect(p.incomplete).toBe(true);
  });

  it("reports null totals when nothing has a value", () => {
    const p = portfolioImpact([revenueUplift("low", {}, C)]);
    expect(p.totalMonthlyValue).toBeNull();
    expect(p.totalAnnualValue).toBeNull();
  });
});
