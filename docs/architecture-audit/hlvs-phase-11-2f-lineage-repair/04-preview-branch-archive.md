# XI-2F · Archival record — stale preview branch `hlbos-m1-portfolio`

**Purpose of this file:** preserve the evidence about the abandoned preview branch
**before** it is deleted in a later authorized step. Per the phase boundary, the
branch is **NOT deleted in this phase** — this archive must exist first.
All facts below are read-only (`list_branches` + read-only catalog `select`s).

## Branch metadata

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| Branch name        | `hlbos-m1-portfolio`                                  |
| Branch id          | `cd67fccd-a072-45b9-ad25-07daf6e6ecf2`                |
| Project ref        | `moftgnrbnsixeddcwdpz`                                |
| Parent project ref | `mvvtngiopdrgiedjmhfb` (HL-BOS Core production)       |
| is_default         | `false`                                               |
| persistent         | `false`                                               |
| with_data          | `false` (no data copied from parent)                  |
| created_at         | `2026-07-19T21:43:01Z`                                |
| updated_at         | `2026-07-19T21:43:01Z` (never updated since creation) |
| status             | `FUNCTIONS_DEPLOYED` / `ACTIVE_HEALTHY`               |

## Migration inventory (29 — a **different lineage** from the platform)

Shares foundation `0001–0008` with the platform lineage, then diverges entirely:

| #         | Name                                                                                      |
| --------- | ----------------------------------------------------------------------------------------- |
| 0001–0008 | (shared foundation: extensions, identity, roles, audit, seed, provisioning, tenant-class) |
| 0009      | portfolio_schema_and_types                                                                |
| 0010      | portfolio_permissions_and_role                                                            |
| 0011      | portfolio_read_model_tables                                                               |
| 0012      | portfolio_population_functions                                                            |
| 0013      | portfolio_refresh_orchestration                                                           |
| 0014      | portfolio_refresh_actor_type_fix                                                          |
| 0015      | managed_schema_registry                                                                   |
| 0016      | profile_creation_trigger                                                                  |
| 0017      | permission_verb_extension                                                                 |
| 0018      | govcon_schema_and_reference                                                               |
| 0019      | govcon_company_profile                                                                    |
| 0020      | govcon_discovery                                                                          |
| 0021      | govcon_evaluation                                                                         |
| 0022      | govcon_workflow                                                                           |
| 0023      | permission_constraint_correction                                                          |
| 0024      | govcon_permissions                                                                        |
| 0025      | govcon_scoring_engine                                                                     |
| 0026      | govcon_dashboard                                                                          |
| 0027      | govcon_helper_function_grants                                                             |
| 0028      | govcon_dashboard_function_grants                                                          |
| 0029      | govcon_dashboard_security_invoker                                                         |

Latest applied version: `20260720201002` (2026-07-20). Note the collision surface:
this lineage's `0009–0029` reuse the same ordinals as the platform lineage with
entirely different meaning, and its `0028` (`govcon_dashboard_function_grants`) is a
different migration from the platform's `0028` (`knowledge_graph_read_model`).

## Schema inventory (live, read-only)

- Domain schemas present: **`portfolio`** (6 tables), **`govcon`** (43 tables),
  plus shared `identity` (8), `platform` (2), `audit` (2).
- Full schema list: `audit, auth, extensions, govcon, graphql, graphql_public,
identity, pgbouncer, platform, portfolio, public, realtime, storage,
supabase_migrations, vault`.
- `identity.permissions`: **24** rows (verb-extended model, incl. `approve`/`export`).
- `graph` schema: **absent** (migration 0028 knowledge-graph never touched this branch).

## References & provenance

| Item                  | Value                                                                                                                        | Confidence                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Repository of origin  | likely `KeithVenuewise73/HSCS-GLP` ("Government Logistics Intelligence & Contract Management") or an early HL-BOS Core build | **strongly inferred** (HSCS-GLP out of GitHub scope; not inspected) |
| Deployment references | none — branch, `with_data=false`, nothing served                                                                             | verified                                                            |
| Live data             | none (`with_data=false`)                                                                                                     | verified                                                            |

## Inferred purpose & disposition

**Inferred purpose:** the **first build** of HL-BOS Core — a "Milestone 1 portfolio"
plus a government-contracting (`govcon`) prototype — captured as a preview branch on
2026-07-19, **superseded** ~2026-07-25→28 when HL-BOS Core was rebuilt as the current
platform lineage (events/billing/hlvs/bti). **Confidence: high** that it is superseded
and non-authoritative; **medium** on the exact originating repository.

**Disposition:** safe to delete once this archive is committed — it holds **no data**,
serves nothing, and is authoritative for nothing. Deletion is a later authorized step
(not this phase). Until then it is recorded in `.hlbos/canonical.json` as
`abandoned-preview-branch` so it is never mistaken for a validation target again (the
mistake XI-2D made).
