# Phase XI-2B · Live Graph Reconnaissance

Confirmed against the repository before implementation (repo is the source of truth).

| #   | Checked              | Finding                                                                                                                                                                                    |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `AssetKind`          | 13 kinds in `types.ts` (product, application, module, package, shared_service, ai_capability, api, repository, database, workflow, edge_function, industry_solution, business_capability). |
| 2   | `RelationKind`       | 10 kinds: uses, depends_on, provides, consumes, extends, owned_by, referenced_by, replaced_by, successor, deprecated.                                                                      |
| 3   | `INVERSE_RELATION`   | Complete inverse map for all 10 — the graph is already directed+invertible.                                                                                                                |
| 4   | `graph.ts`           | `neighborhood()` (outgoing + derived incoming), `assetById`, `referencedIds` (dangling-edge integrity). Reused, not replaced.                                                              |
| 5   | Catalog identity     | Assets are `${kind-prefix}.${slug}` ids; a closed vocabulary; a completeness/reconciliation discipline already exists.                                                                     |
| 6   | Capability Library   | `providedByModules`, `dependsOn`, `aliases`, `duplicatesConsolidated`, `productsForCapability`, `applicationsForCapability` — the semantic core; computed links.                           |
| 7   | Application Registry | `repository`, `currentBranch`, `environment`, `deploymentStatus`, `hosting`, `reusableModules`, `executiveOwner`.                                                                          |
| 8   | Scope/authz          | Portal `authz` role×view matrix (Phase IX); `hlvs.*` gated on `hlvs.catalog.read`; tenant data permission-gated; opportunity views executive-gated.                                        |
| 9   | Existing tests       | `catalog.test.ts` includes a referenced-id integrity test over `Asset.relationships`.                                                                                                      |
| 10  | Blueprint vs reality | Two discrepancies (below).                                                                                                                                                                 |

## Discrepancies (blueprint XI-2A vs repository)

1. **Two module namespaces.** The catalog registry has `module` assets (`mod.*`, hyphenated keys like `mod.discovery-engine`), while the authoritative engineering registry is `MODULE_REGISTRY` (underscore keys like `discovery_engine`) — and the Capability Library's `providedByModules` reference the underscore keys. **Decision:** the graph projects modules from `MODULE_REGISTRY` (what capabilities point at); the catalog `mod.*` assets are the older descriptive Atlas view and are not projected as separate module nodes (avoiding a duplicate, conflicting module set).
2. **Shared services == shared modules.** The catalog `shared_service` assets (`svc.identity`, `svc.events`…) are 1:1 with the shared spine in `MODULE_REGISTRY` (`identity_core`, `events_bus`…). **Decision:** services are represented as their implementing module nodes — not duplicated as separate service nodes — honoring the no-duplication rule.

Neither discrepancy requires a redesign; both are resolved by choosing the authoritative source and documenting it.

## Consequence

The blueprint holds. The graph is built as a deterministic projection over `MODULE_REGISTRY` + Capability Library + `PRODUCT_COMPOSITIONS` + Application Registry + catalog `api` assets, reusing the existing `RelationKind`/`INVERSE_RELATION` vocabulary (extended with the closed XI-2A edge set). No new source of truth; no migration.
