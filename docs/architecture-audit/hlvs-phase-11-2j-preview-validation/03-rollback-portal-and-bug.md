# XI-2J · Rollback validation + Executive Portal + the bug found & fixed

## Bug found on the preview + fixed (disclosed)

Real-environment validation surfaced a genuine defect in migration 0028:

- **`public.graph_find_blast_radius` failed at runtime** with
  `ERROR: column reference "n" is ambiguous`. The aggregation used
  `... jsonb_agg(distinct n order by n) from (…) s join lateral (select s.n as n) n on true`
  — the lateral table `n` and the column `n` collided. **The RPC could never
  return results for any node that actually has dependents.**
- **Root cause:** no test — not the XI-2D local run, not the pgTAP suite, not the
  in-code traverse tests — ever **executed** the `graph_*` RPCs. They were checked
  for existence and grants, but never called with data. The bug only surfaces at
  runtime with ≥1 dependent.
- **Fix (in the repo migration 0028):**

  ```sql
  select coalesce(jsonb_agg(n order by n), '[]'::jsonb) into v_nodes
    from (select distinct r.node_id as n from rev r
          where r.node_id <> p_node_id order by r.node_id limit v_lim) s;
  ```

- **Verified:** the corrected RPC returns 9 real transitive dependents of
  `capability:event_bus` on the preview, and passes an independent throwaway-Postgres
  execution test locally. 0028's normalized-SQL hash changed (real behaviour fix,
  not a comment).
- **Regression guard added:** `supabase/tests/28_knowledge_graph.sql` now
  **executes** all five read RPCs against a published `depends_on` chain (plan 18 →
  23), so this class of bug fails in CI. _(The pgTAP suite runs in CI's
  `database-tests` job via `supabase test db`; it was not run locally here — no
  Docker — but the exact RPC calls it makes were verified live on the preview and on
  a local Postgres 16 cluster.)_

This is disclosed per the platform honesty rule: bugs found by testing our own
guards get named.

## Rollback validation

**Projection rollback** (runtime, real identity): publish v1 → publish v2 →
activate v2 (one active) → `rollback_projection()` → **v1 active again, exactly one
active**. ✅

**Migration rollback** (the `-- rollback:` block executed on the preview):

| After running the rollback block | Result             |
| -------------------------------- | ------------------ |
| `graph` schema                   | **removed** ✅     |
| `public.graph_*` functions       | **0 remaining** ✅ |
| `graph.%` permissions            | **0 remaining** ✅ |
| identity + platform foundation   | **intact** ✅      |

The migration reverses cleanly and leaves the foundation untouched.

## Executive Portal validation

- The RPCs the Executive Portal `/graph` view consumes — the **capability graph**
  (`graph_find_capabilities_for_application` / `graph_find_applications_for_capability`)
  and the **dependency graph** (`graph_find_dependencies` / `graph_find_blast_radius`)
  — are **functional and correctly gated** on `graph.projection.read` (verified above).
- The portal itself is **not deployed** (0 deploy runs, by design pending CEO
  authorisation), so a live browser→RPC round-trip was not exercised. The portal's
  production build compiles (24 routes incl. `/graph`), and its `/graph` card reads
  the in-code `projectionStatus()` today; wiring it to **live** `graph_*` RPCs is a
  separate, post-deploy step (publishable key only; never service-role in the
  browser).
- **Conclusion:** the graph read surface the portal depends on is validated;
  connecting the (undeployed) portal to it is a later deployment step, not a 0028
  concern.
