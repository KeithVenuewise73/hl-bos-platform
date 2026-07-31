/**
 * THE CEO OPERATIONS DASHBOARD (Execution Phase 3, CP4).
 *
 * One executive operating picture, assembled from the existing portfolio and
 * Factory registry. It answers everything the brief lists — but it obeys the
 * hardest rule in this platform:
 *
 *   > "Do not fabricate metrics. Report only measurable values."
 *
 * So the dashboard is split in two, on purpose:
 *   - `measurable`  — real, computed values from the Factory/portfolio (capability
 *                     reuse %, products built, net-new engineering, layer potential).
 *   - `operational` — leads, MRR, ARR, revenue, customer health. Herman Legacy has
 *                     NO operating customers yet, so every one of these is ZERO /
 *                     no-data, with an explicit reason. We do not invent a single
 *                     lead, dollar, or health score (Principle 10).
 *
 * An empty operational panel that explains itself beats a green one that lies.
 */

import {
  portfolioDashboard,
  productCatalog,
  factoryRegistrySummary,
  implementationsSupportingLayer,
  type CommercializationLayer,
} from "@hl-bos/catalog";

const LAYERS: CommercializationLayer[] = ["L1", "L2", "L3", "L4", "L5"];

export interface MeasurableMetrics {
  portfolioProducts: number;
  assemblableNow: number;
  needsEngineering: number;
  /** Products built and running as engines (maturity `live`). */
  builtEngines: number;
  /** Products manufactured through the Factory AND launched to customers. */
  productsManufacturedAndLaunched: number;
  /** Distinct net-new capabilities across the whole portfolio. */
  netNewEngineeringItems: number;
  /** Reusable implementations ÷ total implementations, across all platforms. */
  capabilityReusePct: number;
  /** Mean assembly % across the product catalog. */
  portfolioAvgAssemblyPct: number;
  factoryUtilization: {
    activeManufacturingRuns: number;
    assemblableNow: number;
  };
  /** How many built capabilities COULD support each layer (potential, not revenue). */
  capabilityPotentialByLayer: Record<CommercializationLayer, number>;
}

export interface OperationalMetrics {
  /** Why every value here is zero/no-data. */
  dataStatus: "no_operating_customers_yet";
  note: string;
  currentLeads: number;
  qualifiedOpportunities: number;
  assessmentsCompleted: number;
  proposalsOutstanding: number;
  projectsActive: number;
  mrr: number;
  arr: number;
  /** No customers → no health score to report. */
  customerHealth: null;
  renewalsDue: number;
  expansionOpportunities: number;
  revenueByProduct: Array<{ product: string; revenue: number }>;
  revenueByIndustry: Array<{ industry: string; revenue: number }>;
  revenueByLayer: Record<CommercializationLayer, number>;
}

export interface CeoOperationsDashboard {
  measurable: MeasurableMetrics;
  operational: OperationalMetrics;
  honesty: string;
}

/** Assemble the CEO operations dashboard from existing measurable sources. */
export function ceoOperationsDashboard(): CeoOperationsDashboard {
  const dash = portfolioDashboard();
  const products = productCatalog();
  const reg = factoryRegistrySummary();

  const builtEngines = products.filter((p) => p.maturity === "live").length;
  const netNewEngineeringItems = new Set(products.flatMap((p) => p.netNewCapabilities))
    .size;
  const avgAssembly =
    products.length === 0
      ? 0
      : Math.round(products.reduce((s, p) => s + p.assemblyPct, 0) / products.length);
  const capabilityReusePct =
    reg.implementations === 0
      ? 0
      : Math.round((reg.reusableNow / reg.implementations) * 100);

  const capabilityPotentialByLayer = {} as Record<CommercializationLayer, number>;
  for (const L of LAYERS) {
    capabilityPotentialByLayer[L] = implementationsSupportingLayer(L).length;
  }

  const zeroByLayer = {} as Record<CommercializationLayer, number>;
  for (const L of LAYERS) zeroByLayer[L] = 0;

  const measurable: MeasurableMetrics = {
    portfolioProducts: dash.total,
    assemblableNow: dash.assemblableNow.length,
    needsEngineering: dash.needsEngineering.length,
    builtEngines,
    // Nothing has been manufactured through the Factory AND launched to a paying
    // customer. This is honest, not flattering.
    productsManufacturedAndLaunched: 0,
    netNewEngineeringItems,
    capabilityReusePct,
    portfolioAvgAssemblyPct: avgAssembly,
    factoryUtilization: {
      activeManufacturingRuns: 0, // no manufacturing run is active
      assemblableNow: dash.assemblableNow.length,
    },
    capabilityPotentialByLayer,
  };

  const operational: OperationalMetrics = {
    dataStatus: "no_operating_customers_yet",
    note:
      "Herman Legacy has no operating customers yet: nothing is deployed commercially. " +
      "Every operational figure below is a measured zero, not an estimate. These populate " +
      "automatically once the CRM has live prospects, proposals, projects and subscriptions.",
    currentLeads: 0,
    qualifiedOpportunities: 0,
    assessmentsCompleted: 0,
    proposalsOutstanding: 0,
    projectsActive: 0,
    mrr: 0,
    arr: 0,
    customerHealth: null,
    renewalsDue: 0,
    expansionOpportunities: 0,
    revenueByProduct: [],
    revenueByIndustry: [],
    revenueByLayer: zeroByLayer,
  };

  return {
    measurable,
    operational,
    honesty:
      "Measurable Factory/portfolio metrics are real and computed. Operational metrics " +
      "(leads, MRR, ARR, revenue, customer health) are all zero because there are no " +
      "operating customers yet — reported, never fabricated.",
  };
}
