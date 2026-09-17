# Production Drift Map — and the correction to the BarberOS audit

**Date:** 2026-09-17 · **Project audited:** `mvvtngiopdrgiedjmhfb` (HL-BOS Core, canonical production)
**Method:** read-only queries against the live database. Nothing was created, altered, applied or deleted.
**Supersedes:** the headline finding of `01-current-state-audit.md`.

---

## 1. The correction

Yesterday's audit stated, as its headline finding, that **BarberOS does not exist**. That conclusion was drawn from a
complete search of this repository, and **for this repository it is correct** — there is still no BarberOS migration,
package, app, route or test in source control.

**But it is wrong about the product.** BarberOS exists. It is installed and running in canonical production, and it
has never been committed to this repository.

Production contains **eleven migrations** that are in no repository file:

| Version        | Name                                     |
| -------------- | ---------------------------------------- |
| 20260909203027 | `hlbos_0048_barberos_capability_catalog` |
| 20260909203607 | `hlbos_0049_transform_audit`             |
| 20260909203954 | `hlbos_0050_citext_guard_semantics`      |
| 20260909205112 | `hlbos_0051_unknown_is_not_complete`     |
| 20260910215806 | `hlbos_0052_barberos_owned_website`      |
| 20260910223719 | `hlbos_0053_barberos_public_site_read`   |
| 20260911175642 | `hlbos_0054_discovery_call`              |
| 20260911185433 | `hlbos_0055_proposal`                    |
| 20260913003755 | `hlbos_0056_barberos_shop_api`           |
| 20260913023845 | `hlbos_0057_barberos_product_map`        |
| 20260913025202 | `hlbos_0058_barberos_client_crm`         |

They created a **`barberos` schema (14 tables)**, a **`transform_audit` schema (10 tables)**, **27 functions in each**,
and **17 public `barberos_*` RPCs**. Yesterday's audit said the operational data model was 0% built. In the repository
that remains true. In production it is not.

**Why the audit missed it:** it audited source control, which is the only place the operating contract treats as
authoritative, and it did so before checking the live database. The drift blocker recorded in `.hlbos/milestone.json`
named "about forty" unknown migrations under three naming schemes — it did not say that BarberOS itself was among
them, and I did not look before concluding. The lesson is recorded in §7.

---

## 2. The exact drift

Computed by diffing the 98 rows of `supabase_migrations.schema_migrations` against the 48 files in
`supabase/migrations/`.

| Measure                                                         |  Count |
| --------------------------------------------------------------- | -----: |
| Migration rows in production                                    | **98** |
| Migration files in this repository                              | **48** |
| Applied in production, absent from the repository               | **54** |
| Present in the repository, never applied to production          |  **4** |
| Matched by name                                                 |     44 |
| Matched by name but applied under a **different version stamp** | **16** |

### 2a. The 54 in production but not in the repository

| Family                         |  Count | What it is                                                                                 |
| ------------------------------ | -----: | ------------------------------------------------------------------------------------------ |
| `dma_*`                        |     17 | An unknown "DMA" product line (28 tables). Not in any repo, doc or catalog entry.          |
| **BarberOS / transform_audit** | **11** | **The subject of this document.**                                                          |
| `jobscout_*`                   |      8 | A job-search product (8 tables, 2 views). Not in the repo.                                 |
| `disco_*`                      |      7 | A discovery layer (5 tables). Partially overlaps `vstudio`.                                |
| `hlbos_*` variants             |      5 | `0034r01`, `0034r02`, `0044a`, `0044b`, `0045_..._honestly` — split/renamed at apply time. |
| `hlvs_board_*`, `ingest_*`     |      3 | HLVS board paging/facets, applied out of band.                                             |
| `temp_perftest_page_twin`      |      1 | **A temporary performance-test object still installed in production.**                     |

### 2b. The 4 in the repository but never applied

- `hlbos_0030_ceo_notebook` — milestone state already records this as awaiting approval. Correct.
- `hlbos_0031_transformation_intake` — **milestone state does not record this as unapplied.** The
  `intake.transformation_submissions` table does not exist in production, so the live intake route at
  `/api/business-transformation-intake` cannot persist through the canonical RPC. This is a real gap, previously
  untracked.
- `hlbos_0044_capability_extraction`, `hlbos_0045_reframe_pain_portfolio` — superseded in production by `0044a`/`0044b`
  and `0045_..._honestly`. Same intent, different files.

### 2c. Sixteen version-stamp mismatches

Same migration, different recorded version. `0029`, `0032`–`0043`, `0046`, `0047`, `0048_ats`. A drift check comparing
stamps will fail on every one, which is the mechanical reason the protected one-click path is blocked.

### 2d. A migration-number collision

**`hlbos_0048` has been used twice**, by two unrelated products:

- `hlbos_0048_barberos_capability_catalog` — applied 2026-09-09
- `hlbos_0048_ats_resume_optimizer` — applied 2026-09-16, and the file in this repository

Both are in production. Numbering is no longer a reliable identifier, and the next migration author cannot pick a
number safely without consulting the live database first.

### 2e. Milestone state is out of date on a shipped item

`.hlbos/milestone.json` records, as an open CEO task: _"Apply migration 0048 (ats) to production … UNAPPLIED to any
project."_ **It has been applied** — version `20260916190643`, and the `ats` schema holds its 17 tables in production.
The milestone file the Control Center reads is telling Keith that work is outstanding when it is done.

---

## 3. What BarberOS actually is in production

### 3a. `barberos` — the shop, the site and the client book (14 tables)

Every table has RLS **enabled and forced** with one policy. That matches the platform's house discipline.

| Group           | Tables                                                                                         | Notes                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Shop            | `shops`                                                                                        | one row per tenant: `shop_name`, `chair_count`, `timezone`, `origin_prospect_id`                                                    |
| Website         | `sites`, `site_services`, `site_hours`, `site_links`                                           | slug, headline, about, address, `booking_url`, `status`, `published_at` — **a real owned-website builder with a publish lifecycle** |
| Client book     | `clients`, `visits`, `tools`, `visit_tools`                                                    | see below                                                                                                                           |
| Product catalog | `capabilities`, `bundles`, `bundle_capabilities`, `capability_requires`, `tenant_capabilities` | 16 capabilities, 3 bundles, 17 bundle links, 10 dependency edges                                                                    |

**`barberos.visits` is the most interesting thing in the schema.** Its columns are:

```
visited_on, barber, service_name, price_cents, duration_minutes,
sides_guard, top_finish, top_guard, fade, beard, beard_guard, line_up, part, notes
```

That is not a generic appointments table — it is a **haircut specification**. It records exactly how a given client's
hair was cut, so the next barber can reproduce it. Yesterday's audit assumed BarberOS would need a conventional
appointment model and did not anticipate this. It is a genuine differentiator and closer to Phase 7/8 of the brief
(service preferences, household-quality detail) than to a booking system.

**It is service _history_, not scheduling.** `visited_on` is a date in the past. There is no future appointment, no
availability, no chair or resource model, no staff table (`barber` is free text), and one shop per tenant with no
second location.

### 3b. The rebooking engine exists and is real

`barberos.clients_due(tenant)` → exposed as `public.barberos_clients_due`:

```sql
select ... from barberos.clients c
cross join lateral (select barberos.client_rhythm(c.id) as rhythm) r
where c.tenant_id = p_tenant
  and (r.rhythm->>'typical_days') is not null
  and coalesce((r.rhythm->>'overdue_by_days')::int, 0) > 0
order by overdue_by_days desc
```

`barberos.client_rhythm()` learns a client's typical interval from their visit history and computes how many days
overdue they are. **This is Phase 9 of the brief — the interval-learning and overdue-detection engine — and it is
built.** It is permission-gated on `barberos.client.read` and fails closed.

Yesterday's audit listed this as MISSING and put it at action 9 of 10. It should be struck from the build list.

### 3c. The 17 public RPCs

```
barberos_my_shops        barberos_save_site       barberos_publish
barberos_site            barberos_set_hours       barberos_unpublish
barberos_save_service    barberos_set_link        barberos_published_site
barberos_delete_service  barberos_tools           barberos_published_sitemap
barberos_clients         barberos_save_client     barberos_record_visit
barberos_client          barberos_clients_due
```

A complete CRUD + publish + client-book API. `barberos_published_site` and `barberos_published_sitemap` are
**deliberately anon-executable** — they serve the public shop website. The security advisor flags both; in this case
the flag is expected behaviour, not a defect, and migration `0053_barberos_public_site_read` exists precisely to grant
it.

### 3d. `transform_audit` — the prospect diagnostic engine (10 tables)

`runs`, `shop_profiles`, `discovery`, `dimension_scores`, `findings`, `recommendations`, `proposals`,
`run_competitors`, `campaigns`, `campaign_weights`.

`findings` carries `dimension, code, statement, evidence_url, observed jsonb, confidence, severity, detector` —
evidence-gated by construction. `runs` carries `composite_score`, `dimensions_scored`, `dimensions_possible`, and an
**`outreach_hook` linked to the specific finding that justifies it** (`outreach_hook_finding_id`). That is a
well-designed lead-generation diagnostic.

**It has been exercised on real prospects.** 50 shop profiles, all Western New York:

> Buffalo 10 · Lockport 7 · Depew 5 · West Seneca 4 · Amherst 4 · Hamburg 4 · Orchard Park 3 · East Aurora 2 ·
> Niagara Falls 2 · North Tonawanda 2 · Lancaster 2 · Cheektowaga 2 · and others

40 runs: 35 completed, 5 partially completed.

---

## 4. The honest limits of what is there

This section matters more than §3, because §3 looks like a finished product and it is not.

**1. The client book is empty.** `clients` = 0 rows. `visits` = 0 rows. `tools` = 0, `visit_tools` = 0. The rebooking
engine is real code with nothing to run on. `client_rhythm` cannot learn an interval from zero visits.

**2. The only shop is a test.** `shops` = 1 row: _"Herman Legacy Test Shop"_, 2 chairs, `America/New_York`. Its site
(`slug: hl-test-shop`) is **unpublished**, with 1 service and 1 hours row. No real barbershop is onboarded.

**3. The diagnostic has never looked at a website.** Across all 40 runs there are 45 findings, and they are only
these three:

| Finding                    | Severity | Confidence   | Evidence URLs | Count |
| -------------------------- | -------- | ------------ | ------------: | ----: |
| `website / no_website`     | critical | **inferred** |         **0** |    35 |
| `website / owned_domain`   | high     | **inferred** |         **0** |     5 |
| `website / online_booking` | info     | **inferred** |         **0** |     5 |

Every finding is `confidence = inferred` and **not one has an `evidence_url`**. All 35 completed runs have
`composite_score = 0`. Across all 50 shop profiles: **0 have a Google Place ID, 0 have an Instagram URL, 0 have a
Facebook URL, 0 have a detected website platform.**

The engine is inferring "no website" from the absence of a website field in an imported spreadsheet
(`source_file`/`source_row` columns confirm a file import), not from having looked. To its credit it labels this
`inferred` rather than `observed` — the honesty discipline held. But **no diagnostic has actually been performed on
any barbershop.** This is the same root cause as everything else: nothing is deployed and nothing has egress.

**4. `transform_audit` has no public API.** There are 27 functions in the schema and **zero** corresponding
`public.*` RPCs. Nothing outside the database can read those 40 runs, 45 findings or 40 recommendations. The
diagnostic results are, at present, unreachable.

**5. There is no BarberOS application anywhere in this repository.** 17 RPCs exist to be called and no committed code
calls them. Either an app was built outside source control, or the API has no client. **This is an open question only
Keith can answer** (§6).

**6. None of it is tested here.** No pgTAP file covers `barberos` or `transform_audit`, because no migration for them
exists in the repo. The 860 unit tests and 44 pgTAP files verify none of this. The RLS discipline visible in the live
schema looks right, but **this repository has never proven it.**

---

## 5. Corrected status of the BarberOS workflow

Revising §8 of the audit. Changes are marked.

| Stage                     | Was         | **Now**                   | Basis                                                                                            |
| ------------------------- | ----------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| Lead / business discovery | PARTIAL     | **PARTIAL (better)**      | 50 real WNY prospects imported; no enrichment                                                    |
| Onboarding                | MISSING     | **PARTIAL**               | `shops`/`sites`/`site_services`/`site_hours` + RPCs; one test shop; no staff, no second location |
| Diagnostic                | PARTIAL     | **PARTIAL (unchanged)**   | Engine installed, exercised 40×, but every finding inferred and unevidenced                      |
| Business health report    | PARTIAL     | **PARTIAL**               | `findings`/`recommendations`/`dimension_scores` exist; unreachable — no API                      |
| Revenue leakage           | MISSING     | **MISSING**               | Needs visit data; there is none                                                                  |
| Transformation plan       | PARTIAL     | **PARTIAL**               | + `transform_audit.proposals`, `0055_proposal`                                                   |
| Owner approval            | EXISTS      | **EXISTS**                | unchanged                                                                                        |
| Implementation            | PARTIAL     | **PARTIAL**               | unchanged                                                                                        |
| **CRM**                   | **MISSING** | **PARTIAL**               | `barberos.clients` + `visits` + 5 RPCs — schema real, **0 rows**                                 |
| Marketing                 | MISSING     | **PARTIAL**               | `transform_audit.campaigns` + `campaign_weights` (1 campaign row)                                |
| **Retention / rebooking** | **MISSING** | **PARTIAL**               | **`client_rhythm` + `clients_due` are built.** No data, no sending                               |
| Review engine             | MISSING     | **MISSING**               | unchanged                                                                                        |
| Capacity recovery         | MISSING     | **MISSING**               | `chair_count` exists; no availability model                                                      |
| SEO                       | PARTIAL     | **PARTIAL**               | + `barberos_published_sitemap`                                                                   |
| **Website**               | **PARTIAL** | **PARTIAL (much better)** | A real owned-site builder with publish/unpublish; site is unpublished                            |
| Analytics                 | MISSING     | **MISSING**               | unchanged                                                                                        |
| ROI                       | PARTIAL     | **PARTIAL**               | unchanged                                                                                        |
| AI recommendations        | PARTIAL     | **PARTIAL**               | unchanged                                                                                        |
| Continuous optimization   | MISSING     | **MISSING**               | unchanged                                                                                        |

**Was 1 EXISTS / 9 PARTIAL / 10 MISSING. Now 1 EXISTS / 12 PARTIAL / 7 MISSING.**

BarberOS is meaningfully further along than the audit said. The revised completeness estimate is **≈35%** rather than
20–25% — with the caveat that the additional 10 points are **schema and code with no data behind them, no tests, and
no source control**.

---

## 6. What I need from Keith — three questions

These are access and history questions only he can answer. They are not engineering chores.

1. **Where is the BarberOS application?** Seventeen RPCs exist with no committed client. If an app was built (Lovable,
   Bolt, v0, a separate repo, a local folder), it needs to come into source control — otherwise it can be lost, and
   nothing can test or review it.
2. **Where did the 50 prospect shops come from?** A `source_file`/`source_row` pair says they were imported from a
   spreadsheet. If that file still exists it is the seed of the real prospect list.
3. **Do the `dma_*` (17 migrations, 28 tables) and `jobscout_*` (8 migrations, 8 tables) product lines still matter?**
   They are in production, in no repository, in no document, and in no catalog entry. Keep, export, or retire.

---

## 7. The lesson, recorded so it does not happen again

The audit was thorough about the repository and wrong about the product, because it treated source control as the
whole truth. In this platform it is not: **production has been written to out of band for months.** Any future
current-state audit must read the live database _first_, not last.

This is also the strongest possible argument for fixing the drift rather than living with it. Sixty-one thousand
records of venture-studio intelligence, an entire BarberOS product and two unknown product lines exist only as
deployed database objects, with no file, no test, no review and no rollback path. If that project were lost, nothing
in this repository could rebuild it.

---

## 8. Recommended next actions, revised

The audit's original list is superseded from action 3 onward.

1. **Bring BarberOS into source control.** Reverse-engineer `0048_barberos_capability_catalog` through
   `0058_barberos_client_crm` from the live schema into repository migrations that reproduce production exactly, plus
   the pgTAP suite that should have accompanied them (tenant isolation, RLS+FORCE, anon reachability of exactly the two
   public-site functions and nothing else). **Nothing is applied** — this makes the repo match reality, verified by
   applying from empty in CI.
2. **Resolve the `0048` collision and re-stamp the lineage** so migration numbers identify migrations again.
3. **Locate and commit the BarberOS application** (pending Keith's answer to §6.1).
4. **Give `transform_audit` a public API** so its 40 runs and 45 findings can be read. Diagnostic results that nothing
   can display are a control that does not control anything.
5. **Make the diagnostic actually look.** Deploy the scan worker and wire egress so findings become `observed` with an
   `evidence_url` instead of `inferred` with none. Until then every composite score will stay 0.
6. **Onboard one real barbershop** — replacing "Herman Legacy Test Shop" — and enter real visit history, so
   `client_rhythm` has something to learn from.
7. **Then, and only then, the rebooking loop**: `clients_due` → draft message → owner approval via `workflows` → send
   via `comms` → attribute the return visit. Every piece but sending and attribution now exists.
8. Decide the fate of `dma_*` and `jobscout_*` (§6.3).
9. Remove `temp_perftest_page_twin` from production.
10. Apply `0031_transformation_intake`, or retire the intake route that depends on it.

Items 1, 2, 4 and 9 need nothing from Keith. Items 3, 6 and 8 need his answers. Item 5 needs deployment authorization.

---

## 9. Evidence

Every figure above came from read-only SQL against `mvvtngiopdrgiedjmhfb` on 2026-09-17.

| Claim                                            | Query                                                         |
| ------------------------------------------------ | ------------------------------------------------------------- |
| 98 production migrations                         | `mcp list_migrations`                                         |
| 48 repository migrations                         | `ls supabase/migrations/*.sql`                                |
| 54 / 4 / 44 / 16 drift counts                    | `comm` + `join` over both lists                               |
| `0048` collision                                 | both names present in the production ledger                   |
| 14 `barberos` tables, RLS forced, 1 policy each  | `pg_class.relrowsecurity`, `relforcerowsecurity`, `pg_policy` |
| clients 0, visits 0, shops 1                     | `count(*)` per table                                          |
| "Herman Legacy Test Shop", unpublished           | `barberos.shops` ⋈ `barberos.sites`                           |
| `client_rhythm` / `clients_due` logic            | `pg_get_functiondef`                                          |
| 17 public `barberos_*` RPCs                      | `pg_proc` ⋈ `pg_namespace` where nspname='public'             |
| `transform_audit` has 0 public RPCs              | same query, no matches                                        |
| 40 runs, all completed scores = 0                | `transform_audit.runs` grouped by status                      |
| 45 findings, all inferred, 0 evidence URLs       | `transform_audit.findings` grouped                            |
| 50 WNY prospects, 0 GBP/IG/FB                    | `transform_audit.shop_profiles` grouped by locality           |
| anon-executable public-site RPCs                 | `get_advisors(security)`                                      |
| `ats` applied despite milestone saying otherwise | migration `20260916190643` + 17 `ats` tables                  |
