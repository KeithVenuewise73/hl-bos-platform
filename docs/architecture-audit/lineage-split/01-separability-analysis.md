# Splitting the out-of-band lineage — what can actually move

**Date:** 2026-09-17 · **Decision:** CEO chose "separate it into its own Supabase project"
from the three options in
[playtime-0049-production-deployment/02-drift-findings.md](../playtime-0049-production-deployment/02-drift-findings.md).
**Method:** read-only measurement of HL-BOS Core `mvvtngiopdrgiedjmhfb`.

## The headline

**The "other lineage" is not one thing. It is two, and they need opposite treatment.**

Executing the split literally — moving all 50 out-of-band migrations — would tear HL-BOS
Venture Studio in half. Roughly a fifth of that work is not a foreign product at all; it is
HL-BOS's own code that happened to be applied off-book.

|                                              | Schemas                                                 | Tables | Rows | Verdict                                         |
| -------------------------------------------- | ------------------------------------------------------- | ------ | ---- | ----------------------------------------------- |
| **Group A — separate products**              | `jobscout`, `dma`, `barberos`, `transform_audit`        | 60     | 959  | **Split.** This is what the decision was about. |
| **Group B — HL-BOS's own, applied off-book** | `disco` + `hlvs_board_*`, `ingest_*`, `temp_perftest_*` | 5      | 136  | **Adopt, do not split.**                        |

## Why Group B must not move

Every Group B migration touches `vstudio`:

| Migration                                          | Schemas touched                      |
| -------------------------------------------------- | ------------------------------------ |
| `disco_0003_search_pattern_and_navigation_indexes` | disco, **vstudio**                   |
| `ingest_capture_search_pattern`                    | disco, **vstudio**                   |
| `temp_perftest_page_twin`                          | disco, **vstudio**                   |
| `hlvs_board_page_server_side_navigation`           | disco, **vstudio**, public, identity |
| `hlvs_board_facets`                                | disco, **vstudio**, public, identity |

`vstudio` is HL-BOS's own schema — migrations 0029–0045 in this repository, **342 MB and
62,250 opportunities**, the largest thing in the database. `disco` is an analysis layer
sitting directly on top of it: `disco.assessments` and `disco.evidence_against` both carry
foreign keys to `vstudio.opportunities`.

Moving `disco` to another project would mean either duplicating a 342 MB schema or severing
the reference that gives it meaning. Neither is a split; both are damage.

**These migrations should be written into `supabase/migrations` as proper HL-BOS
migrations.** They are already applied; adopting them is a paperwork exercise against a
database that already matches, not a schema change.

## Group A — how deeply each product is anchored

56 foreign keys point **out** of the Group A schemas into schemas that would stay behind.
Zero point **in**. Nothing in HL-BOS depends on these products, which is what makes the
split possible at all.

| Schema            | Tables | Rows | Outbound FKs | Anchored to                                                    |
| ----------------- | ------ | ---- | ------------ | -------------------------------------------------------------- |
| `jobscout`        | 8      | 533  | **0**        | nothing — fully self-contained                                 |
| `dma`             | 28     | 157  | 21           | `platform.tenants` ×20, `visibility.assessment_categories`     |
| `barberos`        | 14     | 52   | 11           | `platform.tenants` ×6, `auth.users` ×4, `visibility.prospects` |
| `transform_audit` | 10     | 217  | 14           | `platform.tenants`, `auth.users` ×6, `visibility.prospects` ×4 |

### The anchors are shallow

This is the good news, and it is what makes the split cheap:

| Anchor                 | Rows actually referenced           |
| ---------------------- | ---------------------------------- |
| `platform.tenants`     | **1 distinct tenant** (4 exist)    |
| `auth.users`           | **2 users in the entire database** |
| `visibility.prospects` | 50 rows                            |

Twenty-one foreign keys to `platform.tenants` sound like deep coupling. They resolve to
**one tenant row**. The same is true of `auth.users`: two users, both of them internal.

### The one genuinely hard part

`auth.users` identities **do not survive a move between Supabase projects.** A user in the
new project is a different row with a different UUID, so every `created_by`, `enabled_by`,
`published_by`, `answered_by`, `sent_by`, `decided_by` and `confirmed_by` column in
`barberos` and `transform_audit` has to be either re-mapped or dropped.

With two users total this is a lookup table with two entries, not a migration project. It
still has to be done deliberately rather than assumed.

### `barberos` and `transform_audit` are one product, not two

Four out-of-band migrations — `hlbos_0050`, `0051`, `0054` (discovery call), `0055`
(proposal) — modify `barberos` and `transform_audit` _together_, alongside `identity`,
`platform` and `visibility`. They are the same BarberOS engagement flow. They move together
or not at all.

## The shared `public` namespace

`public` holds **1,114 functions**. Among them: **17 `barberos_*`** and **6 `hlvs_*`**.

The out-of-band lineage put its RPC surface into HL-BOS's own exposed API schema. Two of
the `barberos_*` functions are `SECURITY DEFINER` and callable by `anon` — they are the
only anonymous-executable functions in the database, and they are already flagged by the
security advisor.

Splitting the schemas without moving these functions leaves a public API in Core that
queries tables which are no longer there. **They must move in the same window.**

## Recommended treatment

| Schema                                             | Action                                                                                | Difficulty                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| `jobscout`                                         | Move as-is                                                                            | **Trivial** — zero coupling |
| `dma`                                              | Move; re-anchor 21 tenant FKs to a local tenants table or drop them                   | Low                         |
| `barberos` + `transform_audit`                     | Move together; re-anchor 1 tenant, re-map 2 users, carry 50 prospects or drop the FKs | Moderate                    |
| `disco` + `hlvs_*` + `ingest_*` + `temp_*`         | **Do not move.** Adopt into `supabase/migrations`                                     | Paperwork                   |
| 17 `barberos_*` + 6 `hlvs_*` functions in `public` | `barberos_*` move with the product; `hlvs_*` stay and are adopted                     | Low                         |

## What blocked completing it today

1. **The target project could not be created.** `create_project` timed out three times
   (60s each); `list_projects` confirms nothing was created on any attempt. Worth
   re-checking the dashboard in case one lands late.
2. **The consuming applications are outside this session.** `hl-jobscout` and `homehuddle`
   exist as repositories but are not in scope here, and no repository for BarberOS was
   found. A schema cannot be cut over until the application reading it is repointed.
3. **Data should not be copied ahead of cutover.** The applications keep writing to Core,
   so any copy taken now is stale before it lands. The copy belongs _inside_ the cutover
   window, not before it.

None of these is a reason to change the decision. They are reasons the execution needs one
more session with a working `create_project` and the product repositories in scope.
