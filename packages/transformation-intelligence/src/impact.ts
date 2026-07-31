/**
 * Business Impact & ROI — the quantified, evidence-gated layer.
 *
 * The existing consulting engine states impact qualitatively and only computes a
 * single automation-savings line. This module adds per-recommendation monetary
 * estimates, but under a hard honesty rule (Principle 10):
 *
 *   - If the caller did NOT supply the required financial figure, the value is
 *     `null` and the note says what is missing. We never invent a number.
 *   - Any value we DO compute is derived from a supplied figure times a
 *     transparent, configurable assumption, and is flagged `illustrative: true`
 *     with its basis stated.
 *   - Payback is `null` because Herman Legacy pricing is a pending CEO decision;
 *     we will not assert a payback period against a price that does not exist.
 */

import type { DomainKey, Priority } from "@hl-bos/bti-engine";
import type { EngineConfig } from "./config";

export interface FinancialInput {
  monthlyRevenue?: number;
  monthlyOperatingCost?: number;
  laborHoursPerMonth?: number;
  laborCostPerHour?: number;
}

export type RoiBand = "high" | "medium" | "low";

export interface ImpactEstimate {
  label: string;
  /** Estimated monthly value in the caller's currency. null => insufficient input. */
  monthlyValue: number | null;
  annualValue: number | null;
  roiBand: RoiBand | null;
  /** null: pricing is a pending CEO decision, so payback cannot be asserted. */
  paybackMonths: number | null;
  /** true when derived from an assumption rather than a directly supplied figure. */
  illustrative: boolean;
  /** Transparent statement of exactly how the value was derived (or why it is null). */
  basis: string;
  note: string;
}

const REQUIRED_NOTE = "Additional financial information required — value withheld.";
const PRICING_NOTE =
  "Payback withheld: Herman Legacy pricing is a pending CEO decision.";

function round(n: number): number {
  return Math.round(n);
}

function roiBandFor(
  monthlyValue: number | null,
  monthlyRevenue: number | undefined,
  config: EngineConfig,
): RoiBand | null {
  if (monthlyValue === null || monthlyRevenue === undefined || monthlyRevenue <= 0) {
    return null;
  }
  const ratio = monthlyValue / monthlyRevenue;
  if (ratio >= config.impact.roiBands.high) return "high";
  if (ratio >= config.impact.roiBands.medium) return "medium";
  return "low";
}

/**
 * Automation savings from measured labour. Requires BOTH labour hours/month and
 * cost/hour; otherwise null. Illustrative: applies the configurable automatable
 * fraction to measured hours.
 */
export function automationSavings(
  fin: FinancialInput | undefined,
  config: EngineConfig,
): ImpactEstimate {
  const hours = fin?.laborHoursPerMonth;
  const rate = fin?.laborCostPerHour;
  if (hours === undefined || rate === undefined) {
    return {
      label: "Automation labour savings",
      monthlyValue: null,
      annualValue: null,
      roiBand: null,
      paybackMonths: null,
      illustrative: false,
      basis: "Requires measured labour hours/month and cost/hour.",
      note: REQUIRED_NOTE,
    };
  }
  const monthly = round(hours * config.impact.automatableHoursFraction * rate);
  return {
    label: "Automation labour savings",
    monthlyValue: monthly,
    annualValue: monthly * 12,
    roiBand: roiBandFor(monthly, fin?.monthlyRevenue, config),
    paybackMonths: null,
    illustrative: true,
    basis: `${Math.round(config.impact.automatableHoursFraction * 100)}% of ${hours} measured labour hours/month × ${rate} per hour.`,
    note: PRICING_NOTE,
  };
}

/**
 * Illustrative revenue uplift for a prioritised finding. Requires a supplied
 * monthly-revenue figure; otherwise null (we do not invent revenue).
 */
export function revenueUplift(
  priority: Priority,
  fin: FinancialInput | undefined,
  config: EngineConfig,
): ImpactEstimate {
  const revenue = fin?.monthlyRevenue;
  const fraction = config.impact.revenueUpliftByPriority[priority];
  if (revenue === undefined) {
    return {
      label: "Revenue uplift",
      monthlyValue: null,
      annualValue: null,
      roiBand: null,
      paybackMonths: null,
      illustrative: false,
      basis: "Requires a supplied monthly-revenue figure.",
      note: REQUIRED_NOTE,
    };
  }
  const monthly = round(revenue * fraction);
  return {
    label: "Revenue uplift",
    monthlyValue: monthly,
    annualValue: monthly * 12,
    roiBand: roiBandFor(monthly, revenue, config),
    paybackMonths: null,
    illustrative: true,
    basis: `${Math.round(fraction * 100)}% of ${revenue} monthly revenue at ${priority} priority.`,
    note: PRICING_NOTE,
  };
}

/** Domains whose findings are primarily efficiency (savings) rather than revenue. */
const EFFICIENCY_DOMAINS: ReadonlySet<DomainKey> = new Set<DomainKey>([
  "operations",
  "technology",
  "ai_readiness",
]);

/**
 * The single per-finding impact estimate. Efficiency-domain findings use
 * automation savings; the rest use revenue uplift. Either way, the value is
 * null unless the caller supplied the figure it depends on.
 */
export function estimateFindingImpact(
  domain: DomainKey,
  priority: Priority,
  fin: FinancialInput | undefined,
  config: EngineConfig,
): ImpactEstimate {
  return EFFICIENCY_DOMAINS.has(domain)
    ? automationSavings(fin, config)
    : revenueUplift(priority, fin, config);
}

export interface PortfolioImpact {
  /** Sum of the estimates that have a value; null contributors are excluded. */
  totalMonthlyValue: number | null;
  totalAnnualValue: number | null;
  estimatesWithValue: number;
  estimatesGated: number;
  /** True when at least one estimate had to be withheld for missing inputs. */
  incomplete: boolean;
  note: string;
}

/** Aggregate a set of impact estimates honestly — gated items are counted, not guessed. */
export function portfolioImpact(estimates: ImpactEstimate[]): PortfolioImpact {
  const withValue = estimates.filter((e) => e.monthlyValue !== null);
  const gated = estimates.length - withValue.length;
  const totalMonthly = withValue.length
    ? withValue.reduce((s, e) => s + (e.monthlyValue ?? 0), 0)
    : null;
  return {
    totalMonthlyValue: totalMonthly,
    totalAnnualValue: totalMonthly === null ? null : totalMonthly * 12,
    estimatesWithValue: withValue.length,
    estimatesGated: gated,
    incomplete: gated > 0,
    note:
      gated > 0
        ? `${gated} estimate(s) withheld for missing financial inputs; totals reflect only the ${withValue.length} with supplied figures.`
        : "All estimates derived from supplied figures.",
  };
}
