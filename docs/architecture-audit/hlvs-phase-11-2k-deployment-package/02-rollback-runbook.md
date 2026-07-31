# XI-2K · Rollback runbook — migration 0028

**Nothing here has been executed against production.** This is the reviewable plan for
reversing migration `0028` if the production apply (see
[01-deployment-runbook.md](01-deployment-runbook.md)) needs to be undone.
🔑 = CEO trust/authorization decision · ⚙️ = Claude/CI executes after the preceding 🔑.

## What 0028 changes (so we know what to reverse)

`0028` is **purely additive** to an isolated `graph` schema — it touches nothing in the
existing `0001–0027` foundation:

| Object created by 0028                                                          | Reversal                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `graph` schema + 6 tables (`vocab_*`, `nodes`, `edges`, `projections`)          | `DROP SCHEMA graph CASCADE`                                                                  |
| 7 `public.graph_*` RPCs (read + publisher)                                      | `DROP FUNCTION` (each)                                                                       |
| 3 permission rows (`graph.projection.read`/`.manage`, `graph.opportunity.read`) | `DELETE FROM identity.permissions/​role_permissions WHERE key/permission_key LIKE 'graph.%'` |

There are **no** `ALTER`s to existing tables, **no** data migrations of foundation data,
and **no** destructive changes. Reversing 0028 therefore restores the exact `0001–0027`
state. This was **executed and verified on the XI-2J preview** (schema removed, 0 `graph_*`
functions, 0 `graph.%` permissions, identity/platform foundation intact).

## Decision tree — pick the smallest reversal that solves the problem

```
Did the apply itself fail (db push errored, migration partially applied)?
  └─ YES → Case A: failed / partial apply
Did the apply succeed, but a projection publish/activation is wrong?
  └─ YES → Case B: projection-only rollback (NO migration reversal)
Did the apply succeed, structure is fine, but we must remove the feature entirely?
  └─ YES → Case C: full migration reversal
```

Prefer the **smallest** reversal. 0028 ships **empty** (it seeds vocab + permissions but
publishes no projection and grants no role), so a bad _projection_ never requires touching
the schema.

## Case A — failed or partial apply

`supabase db push` applies each migration in a transaction; a failed `0028` rolls itself
back and the migration ledger does **not** record it. Steps:

1. ⚙️ Read the `db-migrate` `apply` job log — capture the exact Postgres error.
2. ⚙️ Confirm state: `supabase migration list` should still show `0028` as **not applied**
   (remote history ends at `0027`); `select to_regnamespace('graph')` should be `NULL`.
3. If a partial object somehow remains (schema present but ledger not advanced): 🔑 approve,
   then ⚙️ run the **Case C reversal block** to remove `graph`, and re-confirm `0027` state.
4. Fix the migration in the repo, re-run local gates + CI `database-tests`, and re-arm the
   apply. **Do not** hand-edit production; the fix flows through the same gated workflow.

## Case B — projection-only rollback (no migration reversal)

If the schema is healthy but the **active projection** is wrong (bad publish, stale
checksum, wrong version), reverse the _data_, not the _structure_:

- 🔑 Authorize a projection change (requires `graph.projection.manage`).
- ⚙️ `select public.graph_active_projection_status();` — capture the current active version.
- ⚙️ `select graph.rollback_projection();` — re-activates the immediately-prior projection
  (verified on the preview: publish v1 → v2 → activate v2 → `rollback_projection()` →
  **v1 active, exactly one active**).
- ⚙️ Re-confirm `graph_active_projection_status()` shows the intended version/counts.

If **no** prior projection should be active, ⚙️ deactivate instead (an admin action gated
on `graph.projection.manage`) so the read RPCs return the graceful empty state. No schema
change is involved.

## Case C — full migration reversal (remove 0028 entirely)

Use only when the **feature** must be withdrawn, not just its data. The reversal SQL is the
`-- rollback:` block embedded at the top of the migration file
(`supabase/migrations/20260731090000_hlbos_0028_knowledge_graph_read_model.sql`) — it was
**executed on the XI-2J preview** and left the foundation intact. Sequence:

| #   | Step                                                                                                                                                                                                                                                                                                                                                            | Who    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | 🔑 Authorize a production reversal (this is a schema-destroying action on production).                                                                                                                                                                                                                                                                          | 🔑 CEO |
| 2   | ⚙️ Snapshot first: `pg_dump -n graph` (structure + any published projection rows) so the withdrawal is auditable and re-publishable.                                                                                                                                                                                                                            | ⚙️     |
| 3   | ⚙️ Execute the `-- rollback:` block inside a single transaction: `DROP FUNCTION` for all 7 `public.graph_*` RPCs → `DROP SCHEMA IF EXISTS graph CASCADE` → `DELETE FROM identity.role_permissions WHERE permission_key LIKE 'graph.%'` → `DELETE FROM identity.permissions WHERE key LIKE 'graph.%'`.                                                           | ⚙️     |
| 4   | ⚙️ Reconcile the migration ledger so remote history reflects that `0028` is no longer applied: `supabase migration repair --status reverted 20260731090000`, then `supabase migration list` (expect the applied set to end at `0027`).                                                                                                                          | ⚙️     |
| 5   | ⚙️ Update governance to match reality: set `0028` back to `notYetApplied` in `.hlbos/migration-lineage.json` / `.hlbos/canonical.json` (or remove it if it is being retired), run `pnpm lineage`, commit.                                                                                                                                                       | ⚙️     |
| 6   | ⚙️ Post-reversal verification (mirror of [03-production-validation-checklist.md](03-production-validation-checklist.md), inverted): `graph` schema absent, 0 `public.graph_*` functions, 0 `graph.%` permissions, **identity/platform foundation intact** (spot-check `identity.permissions` count unchanged for non-graph keys, `platform.tenants` untouched). | ⚙️     |

### Verified reversal outcome (from the XI-2J preview)

| After running the rollback block | Result             |
| -------------------------------- | ------------------ |
| `graph` schema                   | **removed** ✅     |
| `public.graph_*` functions       | **0 remaining** ✅ |
| `graph.%` permissions            | **0 remaining** ✅ |
| identity + platform foundation   | **intact** ✅      |

## Recovery point / data-loss statement

- **Before any projection is published:** reversing 0028 loses **nothing** — the schema is
  empty of business data (vocab + permission seeds are re-created by re-applying 0028).
- **After a projection is published:** Case C drops the published projection rows. The
  Step-2 `pg_dump -n graph` snapshot preserves them, and any projection is fully
  **re-derivable** from source via `serializeGraph()` (deterministic — no `Date`/random).
  So even without the snapshot, the graph can be republished byte-for-byte. **No
  irreplaceable data exists in the `graph` schema.**
- Production carries **no customer data** today; a 0028 reversal cannot affect customer
  records because 0028 never touches them.

## What this runbook will NOT do without explicit approval

Execute any reversal against production; drop the `graph` schema; delete permissions; run
`migration repair` against production; alter the migration ledger. Every step above is
gated on an explicit 🔑 authorization and flows through the same controlled path as the
forward apply.
