# HLVS Asset Inventory

**Companion to:** `HLVS_FORENSIC_TRACE.md` · **Date:** 2026-08-01 · **Read-only.**

This inventory separates **legacy HLVS Venture Studio** assets (the original product, unreachable) from **current-platform** assets that are functional successors or reuse of the name. Confidence labels: **VERIFIED / STRONGLY SUPPORTED / INFERENCE / UNKNOWN**.

> Key: "In this environment" = present in `hl-bos-platform` and/or the reachable Supabase projects. "Legacy" = the parked `legacy-herman-platform` project (`bkfsjhhclbqrhaolvhmz`) and its separate frontend repo(s), **not reachable here**.

---

## 1. Frontend assets

| Asset                                                              | Where                                                                                       | State                                                                                     | Confidence                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Original HLVS Venture Studio UI (catalog page, dashboards, nav)    | Legacy platform (separate repo/host)                                                        | **Not in this environment**; never in `hl-bos-platform` history                           | VERIFIED (absent here) / UNKNOWN (legacy state) |
| Any `hlvs`/`venture` page, route, layout, nav in `hl-bos-platform` | —                                                                                           | **None exist** in `main` or any branch                                                    | VERIFIED                                        |
| Enterprise Catalog UI (new)                                        | `apps/executive-portal/src/app/catalog/page.tsx`                                            | Built; titled "Enterprise Catalog"; renders the asset registry, **not** the legacy studio | VERIFIED                                        |
| Other current frontends                                            | `apps/hl-bti`, `apps/executive-portal`, `apps/control-center`, `apps/herman-legacy-digital` | Built; none is HLVS Venture Studio                                                        | VERIFIED                                        |

**Recoverable frontend IP in this environment:** none of the legacy UI code; only the **UI assessment** describing it (`docs/architecture-audit/hlvs-phase-1-atlas/06-ui-assessment.md`).

---

## 2. Backend assets

| Asset                                                                                            | Where                                                                                  | State                                           | Confidence                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Legacy HLVS backend / API (single-org)                                                           | Legacy project `bkfsjhhclbqrhaolvhmz`                                                  | Parked, unreachable                             | STRONGLY SUPPORTED / UNKNOWN (live) |
| New `hlvs` Factory schema + definer RPCs                                                         | HL-BOS Core `hlvs.*`; `supabase/migrations/…_0025_hlvs_factory.sql` (commit `3ce208d`) | **Live, tested**                                | VERIFIED                            |
| Shared platform backend (identity, billing, ai, events, workflows, provisioning, comms, storage) | HL-BOS Core schemas                                                                    | Live (DB); some edge functions built-undeployed | VERIFIED                            |
| Edge functions                                                                                   | `supabase/functions/**` (8, inert by design)                                           | Built-undeployed                                | STRONGLY SUPPORTED                  |

---

## 3. Tables

| Table set                                               | Where                        | Count                  | Populated                                                                                                   | Confidence                   |
| ------------------------------------------------------- | ---------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Legacy HLVS `hlvs` schema**                           | Legacy project (unreachable) | **59** (documented)    | UNKNOWN (doc notes ~2,481 anon-readable rows in legacy estate, SEC-1)                                       | STRONGLY SUPPORTED / UNKNOWN |
| **New `hlvs` Factory**                                  | HL-BOS Core                  | **19**                 | 4 populated (`extraction_candidates` 12, `capabilities` 10, `industry_templates` 7, `products` 7); 15 empty | VERIFIED (live)              |
| `identity` (shared)                                     | HL-BOS Core                  | 8                      | —                                                                                                           | VERIFIED                     |
| `discovery` (research/recommendation/scoring successor) | HL-BOS Core                  | 19                     | —                                                                                                           | VERIFIED                     |
| `comms` (alerts/notifications successor)                | HL-BOS Core                  | 7                      | —                                                                                                           | VERIFIED                     |
| `storage_meta` / `storage` (documents successor)        | HL-BOS Core                  | 1 / 8                  | —                                                                                                           | VERIFIED                     |
| `venture_studio` (planned)                              | anywhere                     | **0 — does not exist** | —                                                                                                           | VERIFIED                     |

---

## 4. Workflows

| Workflow                                                                                                                                                | Where                                                               | State                       | Confidence |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- | ---------- |
| Legacy studio workflows (opportunity → venture lifecycle)                                                                                               | Legacy (unreachable)                                                | Not in this environment     | UNKNOWN    |
| Factory creation loop (opportunity → CREATE decision → catalog search → blueprint → creation order → run → conformance → build package → HL-BOS intake) | HL-BOS Core `hlvs.*`; described in `…_0025_hlvs_factory.sql` header | Live, governed, human-gated | VERIFIED   |
| Shared `workflows` schema                                                                                                                               | HL-BOS Core (3 tables)                                              | Live (DB)                   | VERIFIED   |

---

## 5. Scoring logic

| Asset                                    | Where                                                                                                     | State                   | Confidence |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- | ---------- |
| Legacy opportunity-scoring               | Legacy (unreachable)                                                                                      | Not in this environment | UNKNOWN    |
| Recommendation / scoring successor       | HL-BOS Core `discovery` (`score_dimensions`, `profile_scores`, `recommendation_rules`, `recommendations`) | Live (DB)               | VERIFIED   |
| Portfolio opportunity model (TypeScript) | `packages/catalog` — `OPPORTUNITY_CATALOG` (20 opportunities), `evaluateIdea`, `priorityFor`              | Built, tested           | VERIFIED   |
| BTI scoring engine                       | `@hl-bos/bti-engine`                                                                                      | Built, tested           | VERIFIED   |

---

## 6. Research logic

| Asset                                               | Where                                                                                                    | State                                             | Confidence                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| Legacy "research engine" / "Friday Research Engine" | Legacy (unreachable)                                                                                     | **No trace in this environment** (`git grep` → 0) | VERIFIED (absent) / UNKNOWN (legacy) |
| Discovery/research successor                        | HL-BOS Core `discovery` (`website_scans`, `collectors`, `evidence`, `assessments`, `blueprint_findings`) | Live (DB)                                         | VERIFIED                             |

---

## 7. Documentation (the strongest recoverable asset)

| Document                                  | Path                                                                         | Content                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| HLVS current architecture                 | `docs/architecture-audit/hlvs-phase-1-atlas/02-current-hlvs-architecture.md` | The three-meaning disambiguation; the value chain                           |
| Existing feature inventory                | `…/03-existing-feature-inventory.md`                                         | Every capability, its belonging (HL-BOS/HLVS/HL-BTI/Legacy) and disposition |
| Database assessment                       | `…/04-database-assessment.md`                                                | Schema inventory; legacy SEC-1/SEC-2 findings                               |
| UI assessment                             | `…/06-ui-assessment.md`                                                      | The frontends and their shapes                                              |
| Recommended architecture / roadmap        | `…/11-recommended-architecture.md`, `…/12-implementation-roadmap.md`         | The intended target state                                                   |
| HLVS↔HL-BOS boundary                      | `docs/architecture/46-hlvs-hlbos-responsibility-boundary.md`                 | Definitive responsibility split                                             |
| Catalog registration & migration sequence | `docs/architecture/72-hlvs-catalog-registration-and-migration-sequence.md`   | **Proposals only** — the closest thing to a migration plan                  |
| Legacy evidence audits                    | `docs/architecture/68–71`                                                    | Venuewise/homehuddle/5star evidence; duplicate & unsafe-legacy report       |

---

## 8. Deployment assets

| Asset                                                 | Where                                                               | State                                                     | Confidence |
| ----------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| HLVS-specific deployment (Dockerfile/workflow/domain) | —                                                                   | **None** — no artifact references HLVS as deployable      | VERIFIED   |
| Current deployment patterns                           | `apps/*/Dockerfile`, `.github/workflows/{ci,deploy,db-migrate}.yml` | Built; `deploy.yml` is manual-only, Edge-Functions-scoped | VERIFIED   |

---

## 9. Recoverable intellectual property

| IP                                                            | Recoverable from this environment?                                        | Source                          | Confidence             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- | ---------------------- |
| Domain model & feature list of legacy HLVS                    | ✅ Yes                                                                    | Atlas Phase 1 assessment (docs) | VERIFIED               |
| Engine designs (discovery, recommendation, scoring, research) | ✅ Yes — as **new implementations** in `discovery.*` + `packages/catalog` | Live DB + repo                  | VERIFIED               |
| Legacy **frontend code**                                      | ❌ No                                                                     | Separate legacy repo/host       | VERIFIED (absent)      |
| Legacy **row data** (59 tables)                               | ❌ No                                                                     | Unreachable legacy project      | VERIFIED (unreachable) |
| Migration/disposition intent                                  | ✅ Yes                                                                    | docs 11/12/46/72                | VERIFIED               |

**Summary:** the _knowledge_ of HLVS is fully preserved and reusable in this repository; the _running legacy artifact_ (frontend + data) is not present here and would have to be recovered from the parked legacy platform and its original source repos, which are outside this environment.
