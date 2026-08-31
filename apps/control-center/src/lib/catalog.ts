import "server-only";
import {
  buildCatalog,
  scanRepository,
  completeness,
  metrics,
  groupByKind,
  assetsByKind,
  neighborhood,
  search,
  KIND_LABEL,
  type Asset,
  type AssetKind,
  type Catalog,
  type CompletenessReport,
  type Metrics,
} from "@hl-bos/catalog";
import { REPO_ROOT } from "@/lib/shell";

// The walk that used to live here now lives in `shell.ts`, because REPO_ROOT is
// used for far more than this scan — every git command runs in it — and having
// only the catalog resolve it correctly left the rest of the console reading
// from the wrong directory in a standalone build.
export interface CatalogView {
  catalog: Catalog;
  metrics: Metrics;
  completeness: CompletenessReport;
}

/**
 * Build the Enterprise Catalog view for the console: the curated registry
 * reconciled against a live scan of this repository. The scan is what keeps the
 * completeness honest — it is recomputed on every request (the console is
 * local and the repo is small).
 */
export async function catalogView(): Promise<CatalogView> {
  const catalog = buildCatalog();
  const inv = await scanRepository(REPO_ROOT);
  const report = completeness(catalog, inv);
  return { catalog, metrics: metrics(catalog, report), completeness: report };
}

export { buildCatalog, groupByKind, assetsByKind, neighborhood, search, KIND_LABEL };
export type { Asset, AssetKind, Catalog, Metrics, CompletenessReport };

// --- Software Factory (Phase IV) -----------------------------------------
export {
  MODULE_REGISTRY,
  PRODUCT_COMPOSITIONS,
  compositionByKey,
  assembleProduct,
  assembleAll,
  executiveReadiness,
  FACTORY_CHECKLIST,
  MATURITY_LABEL,
  REUSE_LABEL,
} from "@hl-bos/catalog";
export type {
  ModuleDef,
  ProductComposition,
  AssemblyResult,
  ExecutiveReadiness,
} from "@hl-bos/catalog";
