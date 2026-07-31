# XI-2K · Production deployment runbook — migration 0028

**Nothing here has been executed.** This is the reviewable plan for applying migration
`0028` (Enterprise Knowledge Graph read model) to canonical production.
🔑 = CEO trust/authorization decision · ⚙️ = Claude/CI executes after the preceding 🔑.

## Target (verified)

|                    |                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Canonical project  | **HL-BOS Core** `mvvtngiopdrgiedjmhfb` (us-west-2), org `Herman Legacy Software Ventures` |
| Current state      | 27 migrations applied (`0001–0027`); 1 bootstrap owner; **no customer data**              |
| Migration to apply | `20260731090000_hlbos_0028_knowledge_graph_read_model.sql` (sha256 `f750be18…`)           |
| Apply mechanism    | `.github/workflows/db-migrate.yml` — manual, `production`-environment-gated               |
| Lineage state      | Reconciled (XI-2I); repo↔production identities match; **only `0028` is pending**          |
| Validation         | Runtime-validated on a production-cut preview (XI-2J); blast-radius bug fixed             |

## Pre-flight (must all be true before arming)

- [ ] `pnpm format:check` / `lint` / `typecheck` / `check-migrations` / `lineage` green; `pnpm test` 247/247. (Currently ✅.)
- [ ] CI `database-tests` green on the PR (local `supabase db reset` + pgTAP incl. the new graph execution tests).
- [ ] `.hlbos/migration-lineage.json` shows `0028` `notYetApplied:true`; no unexpected checksum changes.
- [ ] The PR containing `0028` (+ XI-2 governance) is reviewed and ready to merge.

## Arming (one-time — the trust decisions)

1. 🔑 Create a GitHub **Environment** named `production` with **required reviewers**
   (this reviewer approval _is_ the manual production gate).
2. 🔑 Set repo **secret** `SUPABASE_ACCESS_TOKEN` (a Supabase personal access token; value never appears in the repo or logs).
3. 🔑 Set repo **variable** `SUPABASE_PROJECT_REF` = `mvvtngiopdrgiedjmhfb` (the guards refuse any non-canonical ref).

Until all three exist, `db-migrate.yml` is **inert** (it cannot apply anything).

## Apply sequence (via `db-migrate.yml`)

| #   | Step                                                                                                                                                                           | Who                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1   | Run `db-migrate` with `mode=validate` — `supabase start` → `db reset` (applies `0001–0028` from empty) → pgTAP → `db lint`. Proves the whole set applies cleanly.              | ⚙️ CI                |
| 2   | `drift-check` job: canonical-target guard → `supabase link` → `supabase migration list` → `scripts/check-lineage-drift.mjs` (production applied set must match the registry).  | ⚙️ CI                |
| 3   | Re-run `db-migrate` with `mode=apply`. Guards refuse a non-canonical target; offline `check-lineage` runs; then the `production` environment **pauses for reviewer approval**. | 🔑 reviewer approves |
| 4   | On approval: `supabase link` → **`supabase db push`** (forward-only; applies only the pending `0028`) → `supabase migration list`.                                             | ⚙️ CI                |
| 5   | Post-apply verification (see [03-production-validation-checklist.md](03-production-validation-checklist.md)).                                                                  | ⚙️                   |

## Enabling actual use (post-migration, separate authorization)

Migration `0028` **seeds the permissions** (`graph.projection.read`/`.manage`,
`graph.opportunity.read`) but does **not** grant them to any role. To let the platform
owner publish/read the graph:

- [ ] 🔑 Authorize granting `graph.projection.manage` + `graph.projection.read` to the
      `platform_owner` role (and `graph.projection.read` to `platform_admin`), via a small
      forward migration or an approved admin action. Nothing can read/publish the graph until
      this is done (fail-closed by design).
- [ ] ⚙️ Publish the first projection from `serializeGraph()` (145 nodes / 427 edges,
      checksum `e4e3dc8b`) via `graph.publish_projection(1, 'kg-0.1.0', <commit>, <checksum>,
true, <nodes>, <edges>)`, then `graph.activate_projection(1)`.
- [ ] ⚙️ Confirm `public.graph_active_projection_status()` returns 145/427 (parity).

## What this runbook will NOT do without explicit approval

Apply `0028` (or anything) to production; grant permissions in production; publish a
projection; deploy the Executive Portal; schedule an automatic refresh; expose any graph
write path to consumers.
