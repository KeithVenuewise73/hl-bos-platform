# @hl-bos/catalog

The **Enterprise Catalog engine** — the single source of truth for every Herman Legacy software asset. Pure logic + curated data. It **reuses and surfaces** the HLVS Factory and the discovery catalogs; it does not replace them.

The Control Center renders an executive console over this package (`apps/control-center` → `/catalog`).

## What it contains

| File              | Responsibility                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`        | The closed vocabulary: `AssetKind`, `RelationKind`, `ReuseFlag`, `Maturity`, `Asset`, `Catalog`.                                           |
| `registry.ts`     | **The registry** — every real asset, verified in Project Atlas Phase I and cross-checked against the live database. This is the authority. |
| `scan.ts`         | Deterministic repository scanner: what physically exists (schemas, tables, migrations, edge functions, apps, packages, tests).             |
| `completeness.ts` | Reconciles the registry against a scan → completeness % per discoverable kind. An unregistered object is a named gap.                      |
| `metrics.ts`      | Executive dashboard metrics (counts, reuse %, catalog completion %, enterprise health).                                                    |
| `search.ts`       | Global search across name/id/summary/tags/owner/relationships; returns related assets too.                                                 |
| `graph.ts`        | Relationship graph: outgoing edges + derived incoming edges.                                                                               |
| `index.ts`        | Public surface + `buildCatalog()`, `assetsByKind()`, `groupByKind()`.                                                                      |

## Design rules

- **Honest by construction.** Nothing aspirational is `live`; dormant objects are `dormant`. Completeness is measured against a scan, never asserted.
- **Register before you build.** New assets are added to `registry.ts` (reviewed, version-controlled) before development, so the catalog never trails reality.
- **No dangling edges.** Every relationship target must be a real asset id — enforced by `catalog.test.ts`.

## Usage

```ts
import {
  buildCatalog,
  scanRepository,
  completeness,
  metrics,
  search,
  neighborhood,
} from "@hl-bos/catalog";

const catalog = buildCatalog();
const inv = await scanRepository("/path/to/repo");
const report = completeness(catalog, inv); // completeness % per kind
const m = metrics(catalog, report); // CEO dashboard numbers
const hits = search(catalog, "stripe"); // global search + related assets
const graph = neighborhood(catalog, "prod.hl-bti"); // dependencies + dependents
```

## Tests

`pnpm --filter @hl-bos/catalog test` — 15 tests: registry integrity (unique ids, valid enums, no dangling relationships), a live scan of this repository, completeness reconciliation, metrics, search, and the relationship graph.
