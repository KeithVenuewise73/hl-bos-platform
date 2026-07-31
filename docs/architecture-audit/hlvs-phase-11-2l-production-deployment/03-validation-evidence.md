# XI-2L · Validation evidence — production, post-apply

All results below were produced by querying canonical production
(`mvvtngiopdrgiedjmhfb`) immediately after the apply. Each row is an observed value against
an expected value.

## Structural validation — 17/17 PASS

| #   | Check                                  | Expected         | Observed                |
| --- | -------------------------------------- | ---------------- | ----------------------- |
| 1   | Migration count                        | 28               | **28** ✅               |
| 2   | Latest version                         | `20260731090000` | **`20260731090000`** ✅ |
| 3   | `graph` schema exists                  | true             | **true** ✅             |
| 4   | `graph` base tables                    | 6                | **6** ✅                |
| 5   | `graph.node_types` rows                | 17               | **17** ✅               |
| 6   | `graph.edge_kinds` rows                | 21               | **21** ✅               |
| 7   | `graph.scopes` rows                    | 3                | **3** ✅                |
| 8   | `graph.%` permissions seeded           | 3                | **3** ✅                |
| 9   | Total `identity.permissions`           | 95 (92+3)        | **95** ✅               |
| 10  | Role grants for `graph.%` (dormant)    | 0                | **0** ✅                |
| 11  | RLS **enabled** on all 6 graph tables  | 6                | **6** ✅                |
| 12  | RLS **forced** on all 6 graph tables   | 6                | **6** ✅                |
| 13  | Non-SELECT policies on `nodes`/`edges` | 0                | **0** ✅                |
| 14  | `public.graph_*` RPCs                  | 7                | **7** ✅                |
| 15  | RPCs granted to `authenticated`        | 7                | **7** ✅                |
| 16  | RPCs executable by `anon`              | 0                | **0** ✅                |
| 17  | Active projection                      | none (sealed)    | **none** ✅             |

These mirror exactly the 11/11 structural checks that passed on the XI-2J production-cut
preview, extended with the migration-count/version, permission-total, and dormancy checks.

## Runtime fail-closed proof

The graph read RPCs are `SECURITY DEFINER` and enforce authorization **inside** the function
via `identity.has_platform_permission('graph.projection.read')`. Because no role has been
granted the graph permissions, every caller must be denied. Verified directly on production:

```
select public.graph_active_projection_status();
-- ERROR: 42501: insufficient privilege
-- CONTEXT: PL/pgSQL function public.graph_active_projection_status() line 5 at RAISE
```

`42501` is `insufficient_privilege`. The gate fires: **nobody can read or publish the graph
until permissions are explicitly granted.** This is the same enforcement exhaustively
validated at runtime on the XI-2J preview (publisher denial, reader gating, tenant
isolation, no existence inference).

## Version-state confirmation

Production applied set ends at `20260731090000` (0028), immediately following
`20260728182949` (0027) — monotonic and contiguous. `pnpm lineage` (offline governance)
passes against this state.

## Scope confirmation

- Exactly one migration applied (0028). Nothing in `0001–0027` changed.
- Zero role grants for graph permissions — the feature is installed but inert.
- Zero projections published — no graph data exists yet.
- No application deployed; no reviewer gate or secret armed; no unrelated change.
