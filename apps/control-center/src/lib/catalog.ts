import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
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

/**
 * Resolve the real repository root regardless of how the console is launched
 * (dev server, `next start`, or the relocated standalone bundle whose cwd is
 * its own directory). We walk up from cwd until we find the workspace marker,
 * falling back to the shell's best guess. This keeps the scan honest instead of
 * silently reading an empty tree.
 */
function resolveRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(path.join(dir, "supabase", "migrations"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return REPO_ROOT;
}

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
  const inv = await scanRepository(resolveRepoRoot());
  const report = completeness(catalog, inv);
  return { catalog, metrics: metrics(catalog, report), completeness: report };
}

export { buildCatalog, groupByKind, assetsByKind, neighborhood, search, KIND_LABEL };
export type { Asset, AssetKind, Catalog, Metrics, CompletenessReport };
