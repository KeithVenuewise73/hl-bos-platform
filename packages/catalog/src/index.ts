/**
 * @hl-bos/catalog — the Enterprise Catalog engine.
 *
 * The single source of truth for every Herman Legacy software asset. This
 * package is pure logic + curated data: it reuses and surfaces the HLVS Factory
 * and the discovery catalogs rather than replacing them. The Control Center
 * renders an executive console over it.
 */

export * from "./types";
export * from "./scan";
export * from "./completeness";
export * from "./graph";
export * from "./search";
export * from "./metrics";
export * from "./modules";
export * from "./compositions";
export * from "./factory";
export * from "./app-registry";
export * from "./capabilities";
export * from "./capability-reuse";

import type { Asset, AssetKind, Catalog } from "./types";
import { CATALOG } from "./registry";

/** The curated Enterprise Catalog (the registry). */
export function buildCatalog(): Catalog {
  return CATALOG;
}

export function assetsByKind(catalog: Catalog, kind: AssetKind): Asset[] {
  return catalog.assets
    .filter((a) => a.kind === kind)
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** All kinds present in the catalog, in the executive display order. */
export const KIND_ORDER: AssetKind[] = [
  "product",
  "application",
  "module",
  "shared_service",
  "ai_capability",
  "business_capability",
  "industry_solution",
  "api",
  "edge_function",
  "database",
  "workflow",
  "repository",
  "package",
];

export function groupByKind(
  catalog: Catalog,
): Array<{ kind: AssetKind; assets: Asset[] }> {
  return KIND_ORDER.map((kind) => ({
    kind,
    assets: assetsByKind(catalog, kind),
  })).filter((g) => g.assets.length > 0);
}
