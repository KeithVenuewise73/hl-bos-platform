# XI-2K · Production validation checklist — migration 0028

**Nothing here has been executed against production.** This is the reviewable checklist to
run **before** arming, **immediately after** the apply, and to **enable** first use. Each
item is a query or observable fact with an explicit expected result, so a reviewer can
confirm the outcome without trusting a narrative.

Legend: 🔑 = CEO trust/authorization decision · ⚙️ = Claude/CI executes.

## A. Pre-apply verification (must all hold before arming the apply)

| #   | Check                               | How                                                                                              | Expected                                         |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| A1  | Local gates green                   | `pnpm check` (format:check, lint, typecheck, lineage, test) + `bash scripts/check-migrations.sh` | all pass                                         |
| A2  | Full test suite                     | `pnpm test`                                                                                      | **247/247**                                      |
| A3  | CI `database-tests` green on the PR | `supabase db reset` (applies `0001–0028` from empty) + pgTAP incl. graph **execution** tests     | green                                            |
| A4  | `0028` pending in registry          | `.hlbos/migration-lineage.json`                                                                  | `0028` `notYetApplied: true`, sha256 `f750be18…` |
| A5  | No unexpected checksum drift        | `pnpm lineage` (checksum-lock)                                                                   | clean; only `0028` differs from applied set      |
| A6  | Production is at `0027`             | `supabase migration list` (via `drift-check`)                                                    | applied set ends at `0027`; `0028` absent        |
| A7  | Canonical target                    | `SUPABASE_PROJECT_REF` variable                                                                  | `mvvtngiopdrgiedjmhfb` (guards refuse any other) |

If any A-row fails, **do not arm**. Fix in-repo and re-run.

## B. Post-apply structural validation (run immediately after `db push` succeeds)

These mirror the 11/11 structural checks that passed on the XI-2J preview. Run via a
read-only SQL session against production.

| #   | Check                 | Query (abbreviated)                                                              | Expected                                                           |
| --- | --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| B1  | Migration recorded    | `supabase migration list`                                                        | applied set now ends at **`0028`**                                 |
| B2  | `graph` schema exists | `select to_regnamespace('graph')`                                                | not null                                                           |
| B3  | 6 graph tables        | `count(*) from information_schema.tables where table_schema='graph'`             | **6**                                                              |
| B4  | Vocab seeded          | counts of `graph.vocab_node_types` / `vocab_edge_kinds` / `vocab_scopes`         | **17 / 21 / 3**                                                    |
| B5  | Permissions seeded    | `count(*) from identity.permissions where key like 'graph.%'`                    | **3** (`projection.read`, `projection.manage`, `opportunity.read`) |
| B6  | RLS forced            | `relrowsecurity && relforcerowsecurity` for all 6 `graph` tables                 | **all true**                                                       |
| B7  | Mutation denial       | count of non-SELECT policies on `graph.nodes` / `graph.edges`                    | **0**                                                              |
| B8  | RPCs present          | `count(*)` of `public.graph_*` functions                                         | **7**                                                              |
| B9  | RPC grants            | `graph_*` execute granted to `authenticated`                                     | **7/7**                                                            |
| B10 | Anon locked out       | `graph_*` executable by `anon`                                                   | **0**                                                              |
| B11 | Foundation intact     | non-`graph` `identity.permissions` count unchanged; `platform.tenants` untouched | unchanged                                                          |

**Any B-row failing → stop and consult [02-rollback-runbook.md](02-rollback-runbook.md)
(Case A/C).** Do not proceed to enablement.

## C. Post-apply runtime validation (feature is inert but must fail-closed)

Immediately after apply, **no role holds the graph permissions**, so the feature is
correctly dormant. Confirm the fail-closed posture rather than functionality:

| #   | Check                                                                           | Expected                                  |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| C1  | No projection active (`select public.graph_active_projection_status()`)         | empty / no active projection              |
| C2  | Read RPC denied for an ordinary authenticated user (no `graph.projection.read`) | `insufficient_privilege`                  |
| C3  | Publisher denied for an ordinary user (no `graph.projection.manage`)            | `insufficient_privilege`                  |
| C4  | Anon denied                                                                     | `insufficient_privilege` / not executable |

This is the same denial behavior validated at runtime on the XI-2J preview (checks 1, 8 of
the runtime matrix). The graph is **installed but sealed**.

## D. Enablement validation (only after the separate 🔑 grant authorization)

Run **only** after the CEO authorizes granting graph permissions and publishing the first
projection (see [01-deployment-runbook.md](01-deployment-runbook.md) "Enabling actual
use"). This is a **distinct** authorization from the migration apply.

| #   | Step                                                                                                                                                                                                      | Expected                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | 🔑 Grant `graph.projection.manage` + `.read` to `platform_owner`; `.read` to `platform_admin` (forward migration or approved admin action)                                                                | rows in `identity.role_permissions`                                                       |
| D2  | ⚙️ Publish `serializeGraph()` output: `graph.publish_projection(1,'kg-0.1.0',<commit>,'e4e3dc8b…',true,<nodes>,<edges>)`                                                                                  | one projection row, integrity ok                                                          |
| D3  | ⚙️ `graph.activate_projection(1)`                                                                                                                                                                         | exactly one active projection                                                             |
| D4  | ⚙️ `select public.graph_active_projection_status()`                                                                                                                                                       | **145 nodes / 427 edges** (parity, checksum `e4e3dc8b…`)                                  |
| D5  | ⚙️ Execute each read RPC once as `platform_owner` — `graph_get_node`, `graph_get_neighbors`, `graph_find_dependencies`, `graph_find_blast_radius` (incl. depth cap → **12**), capability/application RPCs | all return correctly; blast-radius returns transitive dependents (the XI-2J bug-fix path) |
| D6  | ⚙️ Confirm tenant/scope isolation posture holds (all 145 nodes are platform-scoped today; a platform-read user sees platform nodes only)                                                                  | consistent with XI-2J runtime result                                                      |

Only when **D1–D6** pass is the Knowledge Graph **live and correct** in production.

## E. Sign-off

- [ ] A1–A7 all pass (pre-apply) — **reviewer initials / date**
- [ ] B1–B11 all pass (structure) — **reviewer initials / date**
- [ ] C1–C4 all pass (fail-closed) — **reviewer initials / date**
- [ ] D1–D6 all pass (enablement, if/when authorized) — **reviewer initials / date**

A failure at any stage routes to [02-rollback-runbook.md](02-rollback-runbook.md). No stage
proceeds on a "should be fine" — each row is an observed result or the apply is halted.
