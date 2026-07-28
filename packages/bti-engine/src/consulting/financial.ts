// Financial framework. Computes a value ONLY where the assessment supplied the
// evidence for it. Where an input is missing, it returns the value as null with
// the exact note the PCO requires: "Additional financial information required."
// It never fabricates ROI, savings, revenue, or benchmarks.

import type { FinancialInput, FinancialLine } from "./types.ts";

const REQUIRED = "Additional financial information required.";

export function buildFinancial(input: FinancialInput | undefined): FinancialLine[] {
  const f = input ?? {};
  const lines: FinancialLine[] = [];

  // Automation savings — only if labor hours AND cost/hour are given.
  if (
    typeof f.laborHoursPerMonth === "number" &&
    typeof f.laborCostPerHour === "number"
  ) {
    // A conservative, stated assumption: 20% of measured manual hours are automatable.
    const automatable = f.laborHoursPerMonth * 0.2;
    lines.push({
      label:
        "Estimated automation savings (illustrative, 20% of measured manual hours)",
      value: Math.round(automatable * f.laborCostPerHour),
      unit: "per month",
      note: "Assumption-based on supplied labor hours and cost/hour; validate before quoting.",
    });
  } else {
    lines.push({
      label: "Automation savings",
      value: null,
      unit: "per month",
      note: REQUIRED + " Provide monthly manual labor hours and loaded cost per hour.",
    });
  }

  // Operating efficiency — only if operating cost is given.
  if (typeof f.monthlyOperatingCost === "number") {
    lines.push({
      label: "Operating cost baseline (from supplied figure)",
      value: Math.round(f.monthlyOperatingCost),
      unit: "per month",
      note: "Baseline only; reduction targets require an operational assessment.",
    });
  } else {
    lines.push({
      label: "Operating cost reduction",
      value: null,
      unit: "per month",
      note: REQUIRED + " Provide monthly operating cost.",
    });
  }

  // Revenue opportunity — never computed without explicit revenue evidence.
  if (typeof f.monthlyRevenue === "number") {
    lines.push({
      label: "Revenue baseline (from supplied figure)",
      value: Math.round(f.monthlyRevenue),
      unit: "per month",
      note: "Baseline only; growth projections require validated conversion and pipeline data.",
    });
  } else {
    lines.push({
      label: "Revenue growth opportunity",
      value: null,
      unit: "per month",
      note: REQUIRED + " Provide current monthly revenue and conversion data.",
    });
  }

  // Recurring-revenue opportunity is always evidence-gated.
  lines.push({
    label: "Recurring revenue opportunity",
    value: null,
    unit: "per month",
    note: REQUIRED + " Requires a service/subscription model decision (CEO).",
  });

  return lines;
}

export const FINANCIAL_REQUIRED_NOTE = REQUIRED;
