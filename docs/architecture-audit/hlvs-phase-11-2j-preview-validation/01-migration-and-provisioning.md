# XI-2J · Migration report + preview-provisioning finding

## Preview environment

| Field       | Value                                                 |
| ----------- | ----------------------------------------------------- |
| Branch name | `hlbos-graph-preview`                                 |
| Project ref | `adpqczccoququtroetzc`                                |
| Parent      | `mvvtngiopdrgiedjmhfb` (canonical production)         |
| Cost        | $0.01344/hour (branch) — **deleted after validation** |
| Disposition | **Deleted** at end of phase (cost stopped)            |

## Finding: Supabase Branching provisioner failed to build a full clone

On creation the branch reported **`MIGRATIONS_FAILED`**. Postgres logs show:

> `ERROR: schema "workflows" does not exist` — while creating `comms.messages`
> (migration 0019), whose `approval_instance_id` references `workflows.instances`
> (migration 0013).

The branch's schema was inconsistent (ledger recorded 0001–0018, but only
`audit/identity/platform/storage_meta` schemas materialised — not `events`,
`workflows`, `billing`, etc.). **The Branching provisioner applied migrations out
of dependency order.**

**This is a Supabase Branching-provisioner issue, not a defect in our migrations
or in 0028:**

- Our migrations are correctly ordered: `0013_workflows_gate` (`20260725100400`)
  precedes `0019_communications` (`20260726090400`). In version order — the order
  used by `supabase db push` and `supabase db reset` (CI's `database-tests` job) —
  workflows is created before comms.
- **It does not affect the production apply of 0028.** Production already has
  `0001–0027` applied; `db push` applies only the single pending `0028`
  sequentially. The branch provisioner is a different mechanism (fresh full
  rebuild), used only when creating a new branch from scratch.

**Impact on this phase:** 0028's dependency foundation (`0001–0008`:
identity/auth/platform) provisioned **correctly and faithfully** (verified: real
`has_platform_permission(citext)` / `has_permission(uuid,citext)`, the production
`permissions_key_format` constraint, `platform.tenants`, `auth.users`,
`is_platform_admin`). 0028 references **nothing** in the migrations that failed to
provision, so it was validated against a faithful identity/auth context — the exact
context 0028's authorization depends on.

## Migration 0028 applied to the preview

`apply_migration` of the corrected `0028` succeeded. Structural validation (11/11 PASS):

| Check                                                                                 | Result |
| ------------------------------------------------------------------------------------- | ------ |
| `graph` schema created                                                                | ✅     |
| 6 graph tables                                                                        | ✅     |
| vocab: 17 node_types / 21 edge_kinds / 3 scopes                                       | ✅     |
| 3 permissions seeded (`graph.projection.read`/`opportunity.read`/`projection.manage`) | ✅     |
| RLS enabled **and forced** on all 6 tables                                            | ✅     |
| mutation denial: **0** non-SELECT policies on nodes/edges                             | ✅     |
| 7 `public.graph_*` RPCs present                                                       | ✅     |
| 7/7 granted to `authenticated`                                                        | ✅     |
| **0** anon-executable                                                                 | ✅     |

## Recommendation for future previews

Because the Branching provisioner mis-orders our migrations, a full-clone preview
should be built either (a) via `supabase db push`/`db reset` (in-order) into a
fresh project, or (b) by applying migrations in numeric order through the MCP.
This is a **preview-tooling** note; it does **not** gate the production apply of 0028.
