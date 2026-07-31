# Phase XI-1 · Live-Registry Reconnaissance Report

**Requirement:** the repository is the source of truth. Before changing anything, every capability-like registry was inspected in the actual code/migrations. This confirms — and corrects — the Phase X blueprint.

## The registries that actually exist

| #   | Registry                     | Location                                     | Form                   | Rows                         | Consumers                                     | Read gate                         |
| --- | ---------------------------- | -------------------------------------------- | ---------------------- | ---------------------------- | --------------------------------------------- | --------------------------------- |
| 1   | `MODULE_REGISTRY`            | `packages/catalog/src/modules.ts`            | in-code `ModuleDef[]`  | **19**                       | Factory assembler, compositions, app-registry | n/a (in-code)                     |
| 2   | `business_capability` assets | `packages/catalog/src/registry.ts` (`cap.*`) | in-code catalog assets | **10**                       | Enterprise Catalog, government module         | n/a (in-code)                     |
| 3   | `hlvs.capabilities`          | migration `0025`                             | DB table               | **10** seeded                | hlvs factory RPCs                             | platform perm `hlvs.catalog.read` |
| 4   | `hlvs.modules`               | migration `0025`                             | DB table               | **0** (dormant; runtime RPC) | hlvs factory                                  | `hlvs.catalog.read`               |
| 5   | `discovery.module_catalog`   | migration `0023`                             | DB table               | **23**                       | commerce/provisioning, `hlvs.modules` FK      | `authenticated`                   |
| 6   | `discovery.service_catalog`  | migration `0023`                             | DB table               | **25**                       | sales proposals, provisioning                 | `authenticated`                   |

### Corrections to the Phase X blueprint (repo differs from doc)

1. **`MODULE_REGISTRY` has 19 modules, not "19/18"** — the file header comment says "18" but the array has 19 entries. (Cosmetic; noted, not "fixed" to avoid churn.)
2. **`hlvs.modules` is genuinely empty (0 seeded rows)** — it is runtime-populated via `hlvs.register_module` (gated on `hlvs.catalog.manage`). The in-code `MODULE_REGISTRY` is the real, reviewable source of truth, exactly as its header states.
3. **There are effectively SIX capability-like registries, not three** — the blueprint named three "module/capability" registries; ground truth adds the catalog's `business_capability` assets and splits the discovery catalogs into `module_catalog` (23) + `service_catalog` (25). All six are catalogued above.

## Per-registry detail (fields, overlaps, risks)

- **`MODULE_REGISTRY`** — fields: `key, name, schema, capabilityCategory, maturity, reuse[], provides[], dependsOn[], discoveryModuleKey?, evidence`. `provides[]` holds commercial capability keys (e.g. `ai_receptionist`, `dashboards`, `reviews`). **Unique value:** the only registry with honest build maturity (`live` / `built_undeployed`) and dependency edges. **Risk of removal:** breaks the Factory assembler + compositions + app-registry. **Kept, unchanged.**
- **`business_capability` assets** (`cap.ai-receptionist`, `cap.scheduling`, `cap.route-assessment`, …) — maturity `reference` (i.e. planned). **Unique value:** business-facing capability names. **Risk:** consumed by the Enterprise Catalog graph. **Kept, unchanged; mapped in via aliases.**
- **`hlvs.capabilities`** (10: `ai_receptionist, reputation_recovery, scheduling, event_management, registration, route_assessment, kpi_scoring, communications, tenant_identity, document_extraction`) — the factory's product-intelligence catalog. **Kept; mapped in.**
- **`discovery.module_catalog` (23)** and **`discovery.service_catalog` (25)** — the **commercial** provisioning/services vocabulary (`crm`, `seo`, `website`, `managed_services`, …). **Boundary decision:** these are _sellable services/modules_, a different projection from _reusable engineering capabilities_. They are **linked, not force-merged** into the Capability Library — collapsing "sellable service" and "reusable capability" would create the ambiguity Phase XI-1 exists to remove. They remain the commercial layer of the Enterprise Catalog.

## Overlapping keys (the duplication the library resolves)

`ai_receptionist`, `reputation_recovery`/`reviews`, `communications`, `scheduling`, `kpi_scoring`, `tenant_identity`, `document_extraction`/`document_management`, `payments`, `dashboards`, `workflow_automation`, `lead_capture`, `local_visibility` all appear across ≥2 registries with **different keys, categories and namespaces**. The canonical library gives each **one id** and folds the legacy keys in as `aliases` + `duplicatesConsolidated` (15 legacy keys consolidated).

## Compatibility & migration requirements

- **No production migration is required or performed.** The Capability Library is in-code, alongside `MODULE_REGISTRY`.
- **All existing consumers preserved.** `MODULE_REGISTRY`, `moduleByKey`, `PRODUCT_COMPOSITIONS`, the `business_capability` assets, and the DB catalogs are untouched; the library imports and maps them.
- **A reconciliation guard** (`reconcileCapabilities`) + a source allow-list (`KNOWN_CAPABILITY_SOURCES`) fail CI if a module or business-capability is left unmapped, or if a new source registry is introduced without conscious review — preventing new parallel registries.
