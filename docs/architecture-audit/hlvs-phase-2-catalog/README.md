# Project Atlas — Phase II: Enterprise Catalog Activation

**For:** Keith Herman (CEO / Product Owner) · **Date:** 2026-07-29
**Type:** Activation — a working capability, not a plan. Reuse before rebuild; nothing existing was redesigned.

---

## What was delivered

The Enterprise Catalog is now a **usable executive system**, not a set of backend capabilities. It lives inside the CEO Development Control Center at **`/catalog`** and is backed by a new shared package, **`@hl-bos/catalog`**, that is the single, honest source of truth for every Herman Legacy software asset.

Open the console (`scripts\control-center.bat`) and click **Enterprise Catalog** in the header. No terminal, no SQL.

**Proven, not asserted:** `pnpm typecheck`, `pnpm lint`, and `pnpm test` (96 tests, including 15 for the catalog engine) all pass. The screenshots below were captured from the running app.

## 1. HLVS Factory evaluation (Objective 1)

Verified against the live HL-BOS Core database (2026-07-29):

| Factory / catalog component                                          | State                            | Evidence                                 |
| -------------------------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| Capability registry (`hlvs.capabilities`)                            | **Operational**                  | 10 rows seeded                           |
| Product catalog (`hlvs.products`)                                    | **Operational**                  | 7 rows seeded                            |
| Industry templates (`hlvs.industry_templates`)                       | **Operational**                  | 7 rows seeded                            |
| Extraction candidates (`hlvs.extraction_candidates`)                 | **Operational**                  | 12 rows seeded                           |
| Commercial catalogs (`discovery.service_catalog` / `module_catalog`) | **Operational**                  | 25 / 23 rows                             |
| **Engineering module registry (`hlvs.modules`)**                     | **Dormant**                      | **0 rows** — created but never populated |
| Product editions (`hlvs.product_editions`)                           | **Dormant**                      | 0 rows                                   |
| Product blueprints, creation orders, dev runs, build packages        | **Dormant (awaiting first run)** | 0 rows each                              |
| Factory RPCs, conformance & readiness engines                        | **Built, live in DB**            | migration 0025, tested                   |
| Factory edge worker (`hlvs-factory-worker`)                          | **Built, not deployed**          | inert by design                          |

**The headline gap:** the factory's _catalog content_ is partly seeded, but the _engineering module registry is empty_ even though 23 commercial modules exist in discovery. The Enterprise Catalog surfaces this honestly rather than hiding it — and the catalog registry (`packages/catalog/src/registry.ts`) now records the real modules so they are no longer invisible.

## 2. Updated architecture

The Catalog is a **surface over what exists**, exactly as Phase I recommended — it introduces no competing storage and duplicates nothing.

```
  CEO Control Center  →  /catalog  (executive console: dashboard · browse · search · asset detail)
                                │  renders
                                ▼
                     @hl-bos/catalog  (new shared package — the single source of truth)
                    ┌───────────────┬───────────────┬───────────────┐
                    │  registry     │  scanner      │  metrics /     │
                    │  (curated)    │  (live repo)  │  search / graph│
                    └──────┬────────┴──────┬────────┴───────────────┘
                           │ reconciles     │ reads
                           ▼                ▼
                 HLVS Factory (hlvs.*)   the repository (migrations, functions, apps, packages)
                 + discovery catalogs    — ground truth for completeness
```

- **Registry (curated truth):** every asset's classification, reuse posture, maturity, owner, and relationships.
- **Scanner (ground truth):** what physically exists in the repo, on every page load.
- **Reconciliation:** completeness % = registered ÷ discovered. An unregistered schema/function/app/package is a named gap — the governance signal.

## 3. Screenshots

Captured from the running console (`docs/architecture-audit/hlvs-phase-2-catalog/screenshots/`):

| File                                | What it shows                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `01-ceo-dashboard.png`              | The CEO dashboard: 12 headline tiles, completeness, reuse intelligence, browse-by-type, governance                            |
| `02-search-stripe.png`              | Global search for "Stripe" → Billing Webhook + Billing, each with its related assets & dependencies                           |
| `03-browse-shared-services.png`     | Browse view: all 14 shared services with maturity + reuse                                                                     |
| `04-asset-hl-bti-relationships.png` | Asset detail for HL-BTI: at-a-glance facts + the full relationship graph (uses / extends / owned-by / provides / provided-by) |
| `05-asset-ai-gateway.png`           | Asset detail for the AI Gateway service                                                                                       |

## 4. New database objects

**None applied — by design.** The Catalog reuses the existing HLVS Factory (`hlvs.*`) and discovery catalogs, and the asset graph is held as version-controlled code (`packages/catalog/src/registry.ts`), which is auditable and reviewable. This honors the operating contract: no migration is applied without explicit approval, and the running system depends on no new schema.

A **proposed, not-applied** persistence migration is included for Phase III consideration at
[`proposed/0028-catalog-registry.sql`](proposed/0028-catalog-registry.sql). It would persist the asset graph and reuse classifications into the `hlvs` schema for durable, multi-surface governance. It requires CEO approval before it is ever applied, and the console does not need it to function.

## 5. New APIs

Two surfaces, both new:

- **The `@hl-bos/catalog` package API** — `buildCatalog`, `scanRepository`, `completeness`, `metrics`, `search`, `neighborhood`, `assetsByKind`, `groupByKind` (see the package README). Pure, typed, tested.
- **The console routes** — `/catalog` (dashboard + server-rendered global search via `?q=`), `/catalog/[kind]` (browse), `/catalog/asset/[id]` (asset detail + relationships). Search is server-rendered, so it works with or without JavaScript.

## 6. New UI components

In `apps/control-center`:

- `src/lib/catalog.ts` — server loader that builds the catalog and reconciles it against a live repo scan (with a robust repo-root resolver).
- `src/components/CatalogUI.tsx` — executive presentational kit: `Tile`, `Bar`, `ReusePill`, `MaturityBadge`, `AssetRow`.
- `src/app/catalog/page.tsx` — the CEO dashboard + global search.
- `src/app/catalog/[kind]/page.tsx` — browse by asset kind.
- `src/app/catalog/asset/[id]/page.tsx` — asset detail with the relationship graph.
- A header link from the main console to the catalog.

All reuse the existing Control Center design language (dark theme, honest empty states).

## 7. Updated dependency model (asset relationships)

Every asset understands its connections in both directions. Outgoing edges are declared once in the registry; incoming edges are derived. The relation vocabulary is exactly the brief's:
**uses · depends on · provides · consumes · extends · owned by · referenced by · replaced by · successor · deprecated.**

The asset detail page groups outgoing edges by relation and shows derived incoming edges (e.g. "used by", "provided by"), so leadership can trace both dependencies and dependents from any node.

## 8. Executive dashboard & catalog completion metrics

The dashboard computes everything from the catalog + a live scan — no hand-entered numbers:

| Metric                                         | Value (2026-07-29)                              |
| ---------------------------------------------- | ----------------------------------------------- |
| Total assets catalogued                        | **104**                                         |
| Products / Modules / Shared services           | 7 / 13 / 14                                     |
| AI capabilities / Edge functions / Databases   | 7 / 8 / 17                                      |
| Business solutions (capabilities + industries) | 17                                              |
| Reusable assets                                | 81                                              |
| **Catalog completion**                         | **100%** (31/31 discoverable assets registered) |
| **Platform reuse**                             | **78%**                                         |
| Enterprise health                              | Healthy                                         |

Completeness by discoverable kind: Databases 17/17 · Edge Functions 8/8 · Applications 3/3 · Shared Packages 3/3. If a future migration adds a schema (or a new function/app/package) without registering it, the score drops and the object is named — that is the mechanism, not a static badge.

## 9. Atlas governance

The catalog is the single source of truth, kept honest by three rules (shown in the console):

1. **Register before you build** — a new asset is added to the registry before development.
2. **Every scan updates the catalog** — completeness is recomputed from the repository on each visit; unregistered objects are named.
3. **Honest maturity** — dormant objects are marked dormant, not green (e.g. `hlvs.modules` = 0 rows is shown as a gap, not hidden).

## Recommendations before Phase III

1. **Populate the engineering module registry.** `hlvs.modules` is empty; register the real modules (already catalogued here) into the live `hlvs` schema via the existing RPCs — with approval — so the factory's authoritative record matches reality.
2. **Approve the persistence migration** ([`proposed/0028-catalog-registry.sql`](proposed/0028-catalog-registry.sql)) if you want the asset graph durable in the database rather than code-only.
3. **Wire the scan into CI** so an unregistered new asset fails the build — enforcing "register before you build" mechanically.
4. **Switch on the runtime** (Phase I roadmap Stage 1) so dormant factory objects can move to live and the catalog can show real runs.
5. **Do not merge the two module catalogs.** Keep `discovery.module_catalog` (commercial) and `hlvs.modules` (engineering) separate and linked — the catalog UI now makes the distinction visible.

**Phase III is the Enterprise Catalog's next expansion (persistence, CI enforcement, and live-run visibility) — not a redesign.** The activation is done and working.
