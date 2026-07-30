/**
 * Executive metrics for the CEO dashboard.
 *
 * Every number here is counted from the catalog or the scan — none is entered
 * by hand. `enterpriseHealth` is derived from asset maturity, not a vibe.
 */

import type { Asset, AssetKind, Catalog, Health, Maturity } from "./types";
import { MATURITY_HEALTH } from "./types";
import type { CompletenessReport } from "./completeness";

export interface Metrics {
  totalAssets: number;
  totals: Record<AssetKind, number>;
  maturity: Record<Maturity, number>;

  // Headline tiles the CEO dashboard asks for.
  products: number;
  modules: number;
  reusableAssets: number;
  repositories: number;
  businessSolutions: number; // industry solutions + business capabilities
  aiServices: number;
  sharedServices: number;
  edgeFunctions: number;
  databases: number;

  /** Share of catalog flagged reusable or commercial. */
  reusePct: number;
  /** Share of shared services + modules that are live (deployed / usable now). */
  activationPct: number;
  /** From the completeness report (discoverable kinds). */
  catalogCompletionPct: number;
  enterpriseHealth: Health;
}

const ALL_KINDS: AssetKind[] = [
  "product",
  "application",
  "module",
  "package",
  "shared_service",
  "ai_capability",
  "api",
  "repository",
  "database",
  "workflow",
  "edge_function",
  "industry_solution",
  "business_capability",
];

const ALL_MATURITIES: Maturity[] = [
  "live",
  "built_undeployed",
  "prototype",
  "reference",
  "dormant",
  "legacy",
  "planned",
];

function count(assets: Asset[], kind: AssetKind): number {
  return assets.filter((a) => a.kind === kind).length;
}

/**
 * Overall health from the mix of asset maturity: red if anything is dormant,
 * green only if nothing needs attention and something is actually live.
 */
function healthFromMaturity(assets: Asset[]): Health {
  if (assets.length === 0) return "unknown";
  const healths = assets.map((a) => MATURITY_HEALTH[a.maturity]);
  const reds = healths.filter((h) => h === "red").length;
  const greens = healths.filter((h) => h === "green").length;
  if (reds > 0) return "yellow"; // dormant assets exist → attention, not failure
  if (greens > 0) return "green";
  return "unknown";
}

export function metrics(catalog: Catalog, completion: CompletenessReport): Metrics {
  const a = catalog.assets;

  const totals = Object.fromEntries(ALL_KINDS.map((k) => [k, count(a, k)])) as Record<
    AssetKind,
    number
  >;
  const maturity = Object.fromEntries(
    ALL_MATURITIES.map((m) => [m, a.filter((x) => x.maturity === m).length]),
  ) as Record<Maturity, number>;

  const reusableAssets = a.filter(
    (x) => x.reuse.includes("reusable") || x.reuse.includes("commercial"),
  ).length;

  // Activation: of the shared services + modules, how many are live now.
  const activationPool = a.filter(
    (x) => x.kind === "shared_service" || x.kind === "module",
  );
  const liveInPool = activationPool.filter((x) => x.maturity === "live").length;

  return {
    totalAssets: a.length,
    totals,
    maturity,
    products: totals.product,
    modules: totals.module,
    reusableAssets,
    repositories: totals.repository,
    businessSolutions: totals.industry_solution + totals.business_capability,
    aiServices: totals.ai_capability,
    sharedServices: totals.shared_service,
    edgeFunctions: totals.edge_function,
    databases: totals.database,
    reusePct: a.length === 0 ? 0 : Math.round((reusableAssets / a.length) * 100),
    activationPct:
      activationPool.length === 0
        ? 0
        : Math.round((liveInPool / activationPool.length) * 100),
    catalogCompletionPct: completion.overallPct,
    enterpriseHealth: healthFromMaturity(a),
  };
}
