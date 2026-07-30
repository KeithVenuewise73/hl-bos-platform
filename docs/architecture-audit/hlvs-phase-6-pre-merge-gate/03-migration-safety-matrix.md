# Database Migration Safety Matrix

**Scope:** migrations 0009–0027 (in execution order). **Important:** these are **already on `main`** and **already applied to the canonical Supabase project** (HL-BOS Core, `mvvtngiopdrgiedjmhfb`) — verified in Phase I (all 27 present). **PR #16 adds none of them.**

## Universal properties (verified)

- **All additive.** Every migration uses `create ... if not exists`, `do $$ ... exception when duplicate_object`, and `on conflict` — idempotent, no `DROP`/`ALTER ... DROP`/`TRUNCATE` of existing objects.
- **No data transformation.** The only writes are **seed/reference inserts** (roles, permissions, catalogs) — never mutation of existing customer data.
- **Locking/downtime:** negligible — new tables/functions/enums; no rewrites of large existing tables. Applied to a near-empty DB (1 auth user).
- **Every file carries a `-- rollback:` block** (drop the objects it created).
- **Already applied to canonical DB.** Merging `main` applies nothing; there is no auto-apply-on-merge pipeline. Applying to any _new_ environment requires **explicit CEO authorization** (operating contract).

## Matrix

| #    | Migration                 | Purpose                                       | Schema                  | Additive? | Data xform                           | Lock risk | Depends on   | Rollback            | Applied to canonical? | Merge applies it? | Deploy auto-applies? | CEO auth to apply |
| ---- | ------------------------- | --------------------------------------------- | ----------------------- | --------- | ------------------------------------ | --------- | ------------ | ------------------- | --------------------- | ----------------- | -------------------- | ----------------- |
| 0009 | events                    | Transactional outbox event bus                | `events`                | Yes       | none                                 | none      | 0001–0008    | drop `events`       | ✅ Yes                | No                | No                   | Yes (new env)     |
| 0010 | entitlements              | Feature catalog, module activation            | `entitlements`          | Yes       | seed features                        | none      | identity     | drop `entitlements` | ✅                    | No                | No                   | Yes               |
| 0011 | integrations              | Connector/webhook framework                   | `integrations`          | Yes       | seed connectors                      | none      | identity     | drop `integrations` | ✅                    | No                | No                   | Yes               |
| 0012 | ai_gateway                | Provider/model/prompt registry, runs, budgets | `ai`                    | Yes       | seed providers/models                | none      | identity     | drop `ai`           | ✅                    | No                | No                   | Yes               |
| 0013 | workflows_gate            | Human-approval gate                           | `workflows`             | Yes       | none                                 | none      | identity     | drop `workflows`    | ✅                    | No                | No                   | Yes               |
| 0014 | visibility_core           | Sites, content, reviews                       | `visibility`            | Yes       | none                                 | none      | identity, ai | drop tables         | ✅                    | No                | No                   | Yes               |
| 0015 | billing_core              | Providers, products, plans, prices            | `billing`               | Yes       | seed catalog                         | none      | entitlements | drop tables         | ✅                    | No                | No                   | Yes               |
| 0016 | billing_subscriptions     | Subscriptions, invoices, payments             | `billing`               | Yes       | none                                 | none      | 0015         | drop tables         | ✅                    | No                | No                   | Yes               |
| 0017 | visibility_assessments    | Prospects, assessments, scores                | `visibility`            | Yes       | seed 16 categories                   | none      | 0014         | drop tables         | ✅                    | No                | No                   | Yes               |
| 0018 | storage_meta              | File registry, retention                      | `storage_meta`          | Yes       | none                                 | none      | identity     | drop schema         | ✅                    | No                | No                   | Yes               |
| 0019 | communications            | Templates, consent, suppression, messages     | `comms`                 | Yes       | seed providers/templates             | none      | events       | drop schema         | ✅                    | No                | No                   | Yes               |
| 0020 | discovery                 | Collectors → profile → assessment             | `discovery`             | Yes       | seed collectors/questions            | none      | ai, events   | drop schema         | ✅                    | No                | No                   | Yes               |
| 0021 | events_handlers           | Handler registry + worker fns                 | `events`                | Yes       | none                                 | none      | 0009         | drop table          | ✅                    | No                | No                   | Yes               |
| 0022 | website_assessment        | Website scan lifecycle                        | `discovery`             | Yes       | seed subscription                    | none      | 0020, 0021   | drop table          | ✅                    | No                | No                   | Yes               |
| 0023 | blueprint_engine          | Service/module catalogs, findings, roadmap    | `discovery`             | Yes       | seed catalogs/rules                  | none      | 0020         | drop tables         | ✅                    | No                | No                   | Yes               |
| 0024 | commerce_provisioning     | Proposals → provisioning → authorization      | `sales`, `provisioning` | Yes       | seed workstreams/agreements          | none      | 0015, 0023   | drop schemas        | ✅                    | No                | No                   | Yes               |
| 0025 | hlvs_factory              | Governed build loop (19 tables)               | `hlvs`                  | Yes       | seed capabilities/products/templates | none      | 0020, 0024   | drop schema         | ✅                    | No                | No                   | Yes               |
| 0026 | bti_platform              | Executive scoring, ROI, dashboard             | `bti`                   | Yes       | seed domains/packs                   | none      | 0020         | drop schema         | ✅                    | No                | No                   | Yes               |
| 0027 | bti_intake_and_public_api | Snapshots + `public.bti_*` RPCs               | `bti`, `public`         | Yes       | none                                 | none      | 0026         | drop table + fns    | ✅                    | No                | No                   | Yes               |

## Proposed migrations 0028 & 0029 — confirmed OUTSIDE the production path

| Proposed                        | Location                                                    | In `supabase/migrations/`? | Auto-applied? |
| ------------------------------- | ----------------------------------------------------------- | -------------------------- | ------------- |
| `0028-catalog-registry.sql`     | `docs/architecture-audit/hlvs-phase-2-catalog/proposed/`    | **No**                     | **No**        |
| `0029-module-registry-seed.sql` | `docs/architecture-audit/hlvs-phase-4-completion/proposed/` | **No**                     | **No**        |

`supabase/migrations/` contains exactly **27** files (0001–0027). Both proposals live under `docs/` and are never picked up by any migration tool. Applying either requires explicit CEO approval, as documented in each file's header.

## Migration risk of merging PR #16

**Zero.** PR #16 changes no migration and no function. Merging it does not apply, alter, or roll back any database object. The migrations above are already live on the canonical project and are additive-only by construction.
