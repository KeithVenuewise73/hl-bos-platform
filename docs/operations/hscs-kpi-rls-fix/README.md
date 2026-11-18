# HSCS KPI tables: close the open access

**Status: written and tested locally. NOT applied to any Supabase project. Needs owner approval.**

Problem (found 2026-11-18): `public.ltr_data`, `kpi_sp_weekly`, `kpi_spe_weekly` in the legacy project
(`bkfsjhhclbqrhaolvhmz`) allow everything to everyone, and the public `herman-supply-chain` repo contains the
project's `anon` key. See `docs/products/hscs-driver-recruitment/01-audit-and-plan.md` section 1b.

## Files
| File | What it is |
| --- | --- |
| `migration.sql` | The fix. Idempotent. One transaction. Deliberately **not** in `supabase/migrations/`, which belongs to HL-BOS Core. |
| `rollback.sql` | Puts the open state back. Reopens the hole. |
| `replica.sql` | Minimal local copy of the live objects, with fake people and rows only. |
| `before.sql`, `after.sql`, `helpers.sql` | The assertions. |
| `run-local-test.sh` | Runs everything against a throwaway PostgreSQL 16. Never contacts Supabase. |

## What the fix does
- `anon` loses all access to the three tables and their sequences.
- Signed-in users need an **active** organisation membership **and** a role.
  Read: any role except `carrier_user`. Insert/update/delete: `owner_ceo`, `contract_admin`, `operations_manager`.
- Nobody except `service_role` can TRUNCATE.
- Two helper functions, `hscs_glp.is_kpi_reader()` / `is_kpi_writer()`, built on the same `user_roles` and
  `organization_users` tables as the existing `hscs_glp` policies. Not callable by `anon`.

## Local result (real output, 2026-11-18)
Before: anon can read, delete and truncate: confirmed (3 assertions). After: 32 assertions pass, covering anon,
a signed-in stranger, `carrier_user`, an inactive `owner_ceo`, `readonly_exec`, `finance_manager`,
`operations_manager` (including the dashboard's delete-all-then-insert upload), `owner_ceo` and `service_role`.
Re-applying the migration is harmless (32 pass again). Reopening one table's policy makes the suite fail, so the
tests can detect the hole. `rollback.sql` restores the open state.

## What this does NOT prove
- The replica is **emulation**. KPI column types are guesses (only names were read); function bodies and the
  before-state policies and grants were copied from live metadata. It runs as a superuser session using
  `SET ROLE`, not PostgREST. Run the same assertions against a Supabase branch before trusting production.
- The dashboard pages: see `dashboard-signin/`. **Applying this without them will break `Lowes-KPI.html` and `dashboard.html`
  until they sign in**: they read and write as `anon` today. Needed companion change in `herman-supply-chain`
  (read-only to this session, so not done): add a sign-in step and use the session token for reads and uploads.
- Live data now: 2 auth users, 1 active member, whose role is `owner_ceo`. Only that person will see the data
  after the fix. I have not confirmed that account is the owner's.
- The old anon key stays valid for the project's other tables. Rotating it is a separate decision.

## Supabase branch result (2026-11-18)

Branch `kpi-rls-fix-test` (project ref `zqltotsbfjhzrexbdxvd`, parent: the legacy project). Production was not touched:
afterwards it still has the 3 "Allow all" policies and none of the new helper functions.

- **The branch is incomplete.** Its build stopped at migration 5 of production's history (`MIGRATIONS_FAILED`), so it
  has the three real KPI tables (real column types, real "Allow all" policy, no data) but **no `hscs_glp` schema**.
  I recreated only what the fix reads (`glp_role`, `organization_users`, `user_roles`) with fake users. The real
  `hscs_glp` tables and functions were not exercised.
- Branch permissions were aligned to production's before-state (anon/authenticated full, service_role full).
  Before that, `service_role` had no SELECT on the branch and the first run showed 1 of 31 checks failing for that
  reason. The migration does not touch `service_role`.
- **Before:** anon read 2 rows, deleted 1, inserted 1 and truncate was allowed. The hole reproduces on a real
  Supabase database.
- **After** (`apply_migration` on the branch): 31 of 31 checks hold, same scenarios as `after.sql`, including the
  dashboard's delete-all-then-insert upload as `operations_manager`.
- **Mutation:** reopening one table made the anon check return 2 rows instead of "denied". It was undone and the check
  returned "denied" again.
- Not tested: the HTTP API (PostgREST), a real signed-in session, and the dashboard pages. Roles were switched with
  `set_config('role', ...)` inside a database function.

## Applied to production (2026-11-18)
- Applied `migration.sql` unchanged (the text tested locally and on the branch) to project `bkfsjhhclbqrhaolvhmz`.
- **Why it was safe to apply before the dashboards had sign-in:** the owner confirmed the Lowe's dashboard is a **template, not used by Lowe's or HSCS**.
  `Lowes-KPI.html` and `dashboard.html` in `herman-supply-chain` still read with the public key, so they now return nothing until they get the sign-in change in
  `dashboard-signin/`. That publishing is no longer urgent.
- **Pre-flight:** 1,144 / 287 / 1,050 rows, 3 open policies present, helpers absent, 3 sequences present, no dependent views.
- **Live verification (rolled-back probes):** anon cannot read, insert, update or delete any of the three tables; a signed-in non-staff user sees 0 rows and cannot insert;
  0 old policies, 0 anon privileges, row security on; **row counts unchanged**; exactly one person (the active `owner_ceo`) can read or write.
- **Rollback:** `rollback.sql` (reopens the hole).
