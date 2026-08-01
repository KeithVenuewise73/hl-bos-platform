# HLVS Forensic Trace — Phase 1

**For:** Keith Herman, CEO / Product Owner
**Author:** Claude (AI engineer) · **Date:** 2026-08-01
**Type:** Read-only forensic investigation. Nothing was rebuilt, migrated, deployed, or altered. No database was written.

**Evidence base:** the `hl-bos-platform` repository (`origin/main` @ `1bf2b12` and full git history across all refs), and read-only inspection of the two reachable Supabase projects. Every material conclusion carries a confidence label: **VERIFIED** (directly observed here), **STRONGLY SUPPORTED** (consistent documentary + structural evidence), **INFERENCE** (reasoned from evidence), **UNKNOWN** (not determinable from this environment).

---

## Executive summary

**The original HLVS — "Herman Legacy Software Ventures / HLVS Venture Studio" — was never part of this repository, and it was not deleted from it.** It is a **separate, older application** that lived (and per documentation still lives, preserved) in a **legacy Supabase project that is unreachable from this environment**. What exists in the current platform under the name `hlvs` is a **different system built from scratch**: the _Herman Legacy Software Factory_ (a 19-table Product-Intelligence / software-creation schema in HL-BOS Core). The two share a name and nothing else.

Put plainly:

- The "missing HLVS page" is missing **because the original application is a parked legacy system on an unreachable database**, not because anyone removed it from `hl-bos-platform`. There is no removal commit, because there was never an HLVS Venture Studio page in this repo to remove. **VERIFIED.**
- The documented modernization plan (rename to `venture_studio`, retire single-org auth, adopt shared identity, lift alerts/documents/research into services) was **architectural intent that was never executed as a migration**. `venture_studio` **does not exist anywhere** — not in any schema, not in any branch, not anywhere in git history. **VERIFIED.**
- Instead of migrating the legacy app, the team **rebuilt the shared capabilities fresh** in HL-BOS Core (identity, comms, discovery, storage). The legacy estate was deliberately left parked and out of scope. **STRONGLY SUPPORTED.**

**Bottom line:** HLVS was not lost and not deleted. Its _code and data_ are not recoverable **from this environment** (they were never here), but its _intellectual property_ — the domain model, feature inventory, and engine designs — is fully preserved in the repository's own architecture documentation and is reusable.

---

## The naming collision that explains everything

The repository's own verified assessment (`docs/architecture-audit/hlvs-phase-1-atlas/02-current-hlvs-architecture.md`, commit `282633e`) states the term "HLVS" has meant three different things:

| "HLVS" means…                       | What it actually is                                                                                                    | Status                                         | Confidence                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| **HLVS Venture Studio (legacy)**    | The _original_ product — `hlvs` schema, **59 tables**, single-org auth, in the **unreachable legacy Supabase project** | Parked, preserved, **not reachable from here** | STRONGLY SUPPORTED (doc); current live state UNKNOWN |
| **Herman Legacy Software Ventures** | The _business/studio_, not a software system                                                                           | Organizational                                 | VERIFIED                                             |
| **HLVS = Software Factory**         | The _new_ `hlvs` schema in **HL-BOS Core** (**19 tables**) that governs what to build                                  | **Built, live, tested**                        | VERIFIED (live DB)                                   |

Every question below turns on keeping these three apart. The forensic subject is row 1 (the legacy Venture Studio). The thing people now _see_ named "hlvs" is row 3 (a new build).

---

## Verified timeline

| When          | Event                                                                                                                       | Evidence                                                                                                                                | Confidence         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Pre-project   | Legacy HLVS Venture Studio built and run on a separate platform (its own frontend + `hlvs` schema, 59 tables)               | Documented in Atlas Phase 1; canonical registry lists project `bkfsjhhclbqrhaolvhmz` as `legacy-herman-platform` / `legacy-unreachable` | STRONGLY SUPPORTED |
| Project start | `hl-bos-platform` created as a **ground-up rebuild** (HL-BOS shared spine); legacy estate deliberately out of scope         | `CLAUDE.md` standing constraint; `.hlbos/canonical.json`                                                                                | VERIFIED           |
| 2026-07-27    | Migration `0025_hlvs_factory` creates a **new** `hlvs` schema — the Software **Factory** — in HL-BOS Core, reusing the name | commit `3ce208d`; `supabase/migrations/20260728182459_hlbos_0025_hlvs_factory.sql` ("All new objects live in the NEW `hlvs` schema")    | VERIFIED           |
| 2026-07-27    | Catalog-registration & "migration sequence" written as **PROPOSALS ONLY — nothing inserted, no migration written**          | `docs/architecture/72-hlvs-catalog-registration-and-migration-sequence.md`                                                              | VERIFIED           |
| 2026-07-29    | Atlas Phase 1 HLVS architectural assessment committed (discovery only)                                                      | commit `282633e`, `docs/architecture-audit/hlvs-phase-1-atlas/`                                                                         | VERIFIED           |
| Throughout    | **No `venture_studio` object ever created**; **no HLVS frontend ever added** to this repo                                   | `git log --all -S venture_studio` → 0; `git log --all --diff-filter=A -- '*hlvs*'` → docs only                                          | VERIFIED           |

---

## Current repository status (`origin/main` @ `1bf2b12`)

- **HLVS references:** 192 files, **overwhelmingly documentation** — `docs/architecture-audit` (97), `docs/architecture` (32), `docs/products` (20). Application code references are limited to `packages/catalog` (16) and a handful in `apps/*` and `supabase/functions`. **VERIFIED.**
- **`venture_studio`:** **0 files** in the entire tree; **0 occurrences** in all of git history. **VERIFIED.**
- **HLVS frontend / route / nav in the repo:** **none.** No `apps/*hlvs*`, no `hlvs` page/route/layout file exists in `main` or any branch. The repo's frontends are `control-center`, `hl-bti`, `executive-portal`, and `herman-legacy-digital`. **VERIFIED.**
- **The only `hlvs` DB artifact in-repo:** one migration, `…_0025_hlvs_factory.sql`, which `create schema if not exists hlvs` for the **Factory** (not the legacy 59-table schema). **VERIFIED.**

---

## Git history findings

| Question                                       | Finding                                                     | Evidence                                                                                 | Confidence |
| ---------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| Introduction of an HLVS app/route in this repo | **Never happened**                                          | `git log --all --diff-filter=A --name-only -- '*hlvs*'` returns only `docs/…` files      | VERIFIED   |
| Last working HLVS page/route commit            | **N/A — none ever existed here**                            | same as above; no `.tsx`/route/nav files named or containing an HLVS Venture Studio page | VERIFIED   |
| Removal / deletion of an HLVS page             | **No such commit**                                          | `git log --all --diff-filter=D` shows no deleted `hlvs` frontend files                   | VERIFIED   |
| Rename to `venture_studio`                     | **No such commit; string never appears**                    | `git log --all -S "venture_studio"` → 0 across all refs                                  | VERIFIED   |
| Replacement                                    | The **name** `hlvs` was **reused** for a new Factory schema | commit `3ce208d` (`0025_hlvs_factory`)                                                   | VERIFIED   |
| Other branches                                 | 18 remote branches scanned; **no HLVS application** in any  | branch sweep over `refs/remotes/origin/*`                                                | VERIFIED   |

**Interpretation:** the git record contains no trace of an HLVS Venture Studio _application_ at any point. That is itself the finding — the original app was developed and hosted **outside** `hl-bos-platform` (the legacy platform and, per doc 72, source repos such as `homehuddle` / `5star-sports-media`). **STRONGLY SUPPORTED.**

---

## Database findings (read-only)

Two Supabase projects are reachable from this environment; a third (the legacy) is not.

| Project ref            | Name / role (per `.hlbos/canonical.json`)       | Reachable?                       | `hlvs` schema           | Notes                                                                      |
| ---------------------- | ----------------------------------------------- | -------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `mvvtngiopdrgiedjmhfb` | **HL-BOS Core** — canonical-production          | ✅                               | **19 tables (Factory)** | 27 app schemas; `identity`, `comms`, `discovery`, `storage_meta` present   |
| `ywrzgursvdowzyhipsmt` | keith-venuewise-parked — empty-parked           | ✅                               | none                    | **Empty** — only default `auth`/`storage`/`realtime` schemas, 0 app tables |
| `bkfsjhhclbqrhaolvhmz` | **legacy-herman-platform — legacy-unreachable** | ❌ (absent from `list_projects`) | (documented: 59 tables) | Holds the original HLVS; **not reachable from here**                       |

**HL-BOS Core `hlvs` schema = the Factory, not the legacy app.** Its 19 tables are: `capabilities`, `modules`, `products`, `product_editions`, `product_blueprints`, `industry_templates`, `extraction_candidates`, `duplicate_checks`, `software_creation_orders`, `prompt_packages`, `development_runs`, `checkpoint_reports`, `build_completion_reports`, `conformance_results`, `conformance_exceptions`, `catalog_update_proposals`, `factory_build_packages`, `hlbos_intake`, `hlbos_feedback`. Only 4 hold seed data (`extraction_candidates` 12, `capabilities` 10, `industry_templates` 7, `products` 7); the other 15 are empty. **VERIFIED (live query).** These are "what to build" governance tables — **structurally unlike** a Venture-Studio product's opportunity/venture/alerts/documents/research tables.

- **`venture_studio` schema:** does **not** exist in either reachable project. **VERIFIED.**
- **Shared identity:** `identity` schema exists in Core (8 tables: `profiles`, `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `invitations`, `platform_admins`) — a **fresh** shared identity, not a migration of legacy single-org auth. **VERIFIED (exists) / STRONGLY SUPPORTED (fresh build).**
- **Alerts / documents / research successors (Core, new builds):** `comms` (messages/templates/providers/consent/suppression) ≈ notifications/alerts; `storage_meta.files` + `storage` ≈ documents; `discovery` (assessments/website_scans/evidence/recommendations/score_dimensions/profile_scores) ≈ research/discovery/recommendation/scoring. **STRONGLY SUPPORTED.** No evidence any legacy row was migrated into them. **VERIFIED (no migration path exists in-repo).**
- **Legacy 59-table `hlvs`:** not present in any reachable project; its current live state is **UNKNOWN** from here. Documentation records it as preserved and carrying open security findings (SEC-1: ~2,481 rows anonymous-readable; SEC-2: cross-tenant access) — `docs/architecture-audit/hlvs-phase-1-atlas/04-database-assessment.md`.

---

## Deployment findings

- **No deployment artifact references HLVS as a deployable app.** Searched all `Dockerfile`s, `.github/workflows/**`, and compose/coolify references for `hlvs` → **none**. **VERIFIED.**
- The deployed/deployable frontends are `hl-bti`, `executive-portal`, and (now merged) `herman-legacy-digital`; the CEO console `executive-portal` exposes a `/catalog` route titled **"Enterprise Catalog"** (the new asset registry via `buildCatalog()`), **not** the legacy HLVS Venture Studio catalog. **VERIFIED** (`apps/executive-portal/src/app/catalog/page.tsx`).
- The original HLVS Venture Studio's route/URL/hosting is **UNKNOWN** from this environment — it belonged to the separate legacy platform.

---

## Exact explanation for the missing page

**The visible HLVS page is not in this repository because it never was — it is part of a separate legacy application (its own frontend plus the `hlvs` 59-table schema) hosted on the `legacy-herman-platform` Supabase project (`bkfsjhhclbqrhaolvhmz`), which is deliberately parked and unreachable from this environment.** No commit in `hl-bos-platform` deleted, renamed, or disconnected it, because it was never wired here. The confusion arises entirely from **name reuse**: migration `0025_hlvs_factory` (commit `3ce208d`) created a _new_ `hlvs` schema for the Software Factory, so the name "hlvs" is live and visible in HL-BOS Core — but it points at a different system. The planned `venture_studio` modernization that would have formally superseded the legacy app was **documented but never executed**. **VERIFIED (no in-repo deletion) / STRONGLY SUPPORTED (legacy parked-unreachable cause).**

---

## Confidence summary

| Conclusion                                                            | Confidence                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Original HLVS was never in this repo; not deleted from it             | **VERIFIED**                                                             |
| `venture_studio` never created (schema/app/history)                   | **VERIFIED**                                                             |
| Core `hlvs` = new 19-table Factory, not the legacy 59-table app       | **VERIFIED**                                                             |
| No data migration from legacy `hlvs` to shared services               | **STRONGLY SUPPORTED** (no path exists; migration doc is proposals-only) |
| Shared identity/comms/discovery/storage are fresh rebuilds            | **STRONGLY SUPPORTED**                                                   |
| Legacy 59-table `hlvs` exists, preserved, in unreachable project      | **STRONGLY SUPPORTED** (doc + registry); **live state UNKNOWN** here     |
| Legacy single-org auth not retired/migrated — superseded, left parked | **STRONGLY SUPPORTED**                                                   |
| Original app not recoverable from this environment                    | **VERIFIED**; recoverability elsewhere **UNKNOWN**                       |
