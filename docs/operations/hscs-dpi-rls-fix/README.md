# HSCS delivery-performance (dpi) tables: close public read and public insert

**Status: written, tested locally AND on a Supabase branch (since deleted). NOT applied to production. Needs owner approval.**

Problem (found 2026-11-18): `dpi.deliveries`, `dpi.surveys`, `dpi.drivers`, `dpi.dsp_companies` in the legacy project
(`bkfsjhhclbqrhaolvhmz`) have "Public read" (SELECT, role public, USING true) and "Public insert" policies. The `anon`
key is in the public `herman-supply-chain` repo. Live row counts when checked: 400 deliveries, 244 surveys, 0 drivers,
5 DSP companies (which carry `contact_name` and `contact_email`). Live grants: anon and authenticated hold SELECT and
INSERT only; anon also has USAGE on schema `dpi`.

## Files
| File | |
| --- | --- |
| `migration.sql` | The fix. Idempotent, one transaction. **Refuses to run unless `../hscs-kpi-rls-fix/migration.sql` has been applied first.** |
| `rollback.sql` | Reopens the hole. |
| `replica_dpi.sql` | Local copy of the live dpi schema (columns, constraints, policies, ACLs from live metadata), fake rows only. |
| `before.sql`, `after.sql` | Assertions. Reuse `../hscs-kpi-rls-fix/helpers.sql`. |
| `run-local-test.sh` | Whole experiment on a throwaway local PostgreSQL 16. |

## What it does
- anon: no access to the four tables, and no USAGE on schema `dpi`.
- Signed in with an **active** membership: read for any role except `carrier_user`; insert for `owner_ceo`,
  `contract_admin`, `operations_manager`. Same two helper functions as the KPI fix.
- **UPDATE and DELETE stay refused to everyone**, as today. The dashboard's "clear existing data first" option has never
  worked (the database refuses the DELETE) and its log line still says "Cleared existing ... data"; that false message is
  in `dashboard.html` and is not fixed by this migration. Granting DELETE to staff would be a new capability, so it is a
  separate decision.

## Local result (real output, 2026-11-18)
- Before: anon read deliveries, surveys and DSP contact emails, and inserted a fake delivery (4 assertions).
- Guard: the migration refuses to run before the KPI migration.
- After: **32 assertions pass**: anon; signed-in stranger; `carrier_user`; inactive `owner_ceo`; `readonly_exec`;
  `finance_manager`; `operations_manager` (insert with a generated id, skip-duplicates insert, insert of a survey linked to a
  delivery, insert of a DSP, update and delete still refused); `owner_ceo`.
- Re-applying is harmless (32 pass again). The KPI suite still passes after this migration.
- Mutation: reopening one table made the suite fail. `rollback.sql` restores the open state.

## Supabase branch result (2026-11-18)
Branch `dpi-rls-fix-test` (project ref `gftsmvbqaonhqjedghdm`), created from the legacy project and **deleted afterwards**.
A first attempt to create a branch was declined by the session's permission check and not worked around; a second request,
approved by the owner, succeeded. Production was checked after the test and is unchanged: 8 open dpi policies, 3 open KPI
policies, no helper functions, anon still has USAGE on `dpi`.

- **The branch is incomplete, as before.** It replayed 4 of production's migrations and stopped (`MIGRATIONS_FAILED`): it has the
  three real KPI tables but no `hscs_glp` and no `dpi`. I recreated `dpi` by hand from live metadata (columns, constraints,
  policies, ACLs) and a minimal `hscs_glp` with fake users. So the real `dpi` and `hscs_glp` objects were not exercised.
- **Before:** on a real Supabase database anon read deliveries, surveys and DSP contact emails and inserted a fake delivery;
  update and delete were already refused (matches live grants).
- **Guard:** the guard clause aborted a migration run before the KPI migration (tested with a copy of the guard block, not the
  whole file).
- **After** (both migrations applied with `apply_migration`; KPI first): **40 of 40 checks hold**: 32 dpi scenarios (same as
  `after.sql`) plus 8 KPI regression checks, including the KPI dashboard's delete-all-then-insert upload and `service_role`.
- Row security is on for all four dpi tables afterwards.
- **Mutation:** granting anon a read policy and USAGE made the anon check return 2 rows instead of "denied".
- Skip-duplicates was exercised as `ON CONFLICT DO NOTHING` (0 rows, no error).

## What this does NOT prove
- Emulation caveats above; roles were switched with `set_config('role', ...)` inside a database function, not through the HTTP
  API. A real signed-in session and PostgREST's translation of the dashboard's skip-duplicates header were not tested.
- `service_role` has no USAGE on schema `dpi` today (live) and this migration does not change that.
- Other schemas were not audited for the same pattern in this pass. The advisor's view finding
  (`public.recovery_compliance_exceptions`) is still open.

## Order of events (so nothing goes dark)
1. Publish the sign-in pages (`../hscs-kpi-rls-fix/dashboard-signin/`). 2. Apply the KPI fix. 3. Apply this fix.
Applying this before `dashboard.html` has the sign-in change would make that page show "Connection failed".
