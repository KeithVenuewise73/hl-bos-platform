# XI-2F · Migration repair strategy + production readiness checklist

> **Status update (Phase XI-2I, 2026-07-31):** Option R1/D was **executed** — repo
> `0023–0027` renamed to production's applied versions (content byte-identical). The
> "next phase" items below are now done for the drift repair. Evidence:
> [../hlvs-phase-11-2i-reconciliation-execution/01-reconciliation-audit.md](../hlvs-phase-11-2i-reconciliation-execution/01-reconciliation-audit.md).
> The XI-2F text below is preserved as the original plan.

**Not executed in this phase** (boundary: no production migration, no history rewrite).
This is the approved-forward-only plan. The repair is content-safe because the SQL of
`0023–0027` is proven identical (see [01](01-migration-drift-report.md)); only the
version identifier drifts.

## The goal

Make the repo's `0023–0027` version identifiers agree with production's applied history
so `supabase db push` proceeds cleanly to `0028` — **without** rewriting production's
authoritative history and **without** re-running any already-applied SQL.

## Two mechanisms (choose one; both forward-only, production-safe)

### Option R1 — Align the repository to production (recommended)

Rename the repo files `0023–0027` to production's applied version identifiers:

| From (repo)                                               | To (production applied)                                   |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `20260727090000_hlbos_0023_blueprint_engine.sql`          | `20260728181327_hlbos_0023_blueprint_engine.sql`          |
| `20260727090100_hlbos_0024_commerce_provisioning.sql`     | `20260728182035_hlbos_0024_commerce_provisioning.sql`     |
| `20260727090200_hlbos_0025_hlvs_factory.sql`              | `20260728182459_hlbos_0025_hlvs_factory.sql`              |
| `20260727090300_hlbos_0026_bti_platform.sql`              | `20260728182832_hlbos_0026_bti_platform.sql`              |
| `20260728090000_hlbos_0027_bti_intake_and_public_api.sql` | `20260728182949_hlbos_0027_bti_intake_and_public_api.sql` |

- **Content unchanged** (SQL identical); only the filename version prefix changes.
- Then `pnpm lineage:write` (regenerates the checksum manifest) and remove the
  `knownMigrationDrift` block from `.hlbos/canonical.json` — the drift is gone.
- `supabase migration list` then shows `0023–0027` as matched (local == remote), and
  `db push` sees only `0028` pending.
- **Production untouched.** This is a repository-side alignment to the authoritative
  production record — not a history rewrite.
- CI ordering is preserved: the new versions still sort after `0022` (`20260726…`) and
  before `0028` (`20260731…`), and `supabase db reset` (empty-DB apply) is unaffected.
- Trade-off: renaming files changes their version identity in git. That is why it is an
  **explicit, approved** step, recorded in the manifest diff — not a silent edit.

> Note: Option R1 requires renaming migration files, which the XI-2E/XI-2F _analysis_
> boundary forbade doing unilaterally. It is presented here for CEO approval and
> executed only in the next authorized step.

### Option R2 — Repair the remote bookkeeping (`supabase migration repair`)

Use `supabase migration repair --status applied <repoVersion>` (and/or revert the
production versions) so the remote `schema_migrations` records the repo's version
strings. This **modifies production's bookkeeping table** (not its schema/data), so it
is out of bounds this phase and must run only through the gated, reviewer-approved
`db-migrate` path. R1 is preferred because it touches **nothing** remote.

## Recommendation

**Option R1** — align the repo to production. Zero remote risk, content-safe, and it
leaves one clean lineage where file version == applied version.

## When does migration 0028 (Knowledge Graph) become safe to apply?

`0028` is unchanged except for the XI-2D permission-key correction
(`graph.projection.read` / `graph.projection.manage`), confirmed by the checksum lock.
It becomes safe to apply when **all** of the following hold:

1. ✅/⏳ **Tail drift repaired** (Option R1) so `db push` reaches `0028` cleanly.
2. ⏳ **A faithful preview exists** — cut a fresh preview branch from _current_
   production (after R1) and validate `0028` there (the runtime RLS/tenant-isolation/
   RPC/portal checks XI-2D could not do). The stale `hlbos-m1-portfolio` branch must
   **not** be used.
3. ⏳ **Preview validation passes**, then production apply via the gated `db-migrate`
   workflow with reviewer approval.

Until 1–3, `0028` stays in the repo (correct number, checksum-locked) and is **not**
applied. `notYetApplied: 28` in the registry keeps CI honest about that.

## Production readiness checklist (for the eventual 0028 apply)

| #   | Gate                                                                                                         | Status                         |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | Tail drift `0023–0027` repaired (R1) + manifest regenerated                                                  | ⏳ next phase                  |
| 2   | `pnpm lineage` green (sequence, checksum, canonical)                                                         | ✅ now                         |
| 3   | `scripts/check-migrations.sh` green (filename/rollback/secret/destructive)                                   | ✅ now                         |
| 4   | `supabase db reset` + pgTAP green in CI (empty-DB apply, incl. `28_knowledge_graph.sql`)                     | ✅ in CI                       |
| 5   | Online drift-check green vs canonical (no foreign remote versions)                                           | ✅ fixture; ⏳ live when armed |
| 6   | Fresh faithful preview branch cut from current production                                                    | ⏳ next phase                  |
| 7   | `0028` applied + validated on the faithful preview (RLS, tenant isolation, RPC, portal)                      | ⏳ next phase                  |
| 8   | `db-migrate` armed (`SUPABASE_ACCESS_TOKEN` + canonical `SUPABASE_PROJECT_REF`) + `production` env reviewers | 🔑 CEO                         |
| 9   | Reviewer-approved apply of `0028` to production                                                              | 🔑 CEO                         |
| 10  | Post-apply `supabase migration list` shows `0028` applied; drift-check green                                 | ⏳                             |

Legend: ✅ done · ⏳ pending a later authorized phase · 🔑 CEO action.
