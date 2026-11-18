# HSCS delivery-performance (dpi) tables: close public read and public insert

**Status: written and tested LOCALLY only. NOT applied to any Supabase project. NOT yet tested on a Supabase branch
(the branch request was declined this session). Needs owner approval.**

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

## What this does NOT prove
- Emulation: superuser session with `SET ROLE`, not PostgREST. **No Supabase branch test yet.** Note that a branch built from
  the legacy project's migration history will not contain `dpi` or `hscs_glp` (neither is in that history, and the branch
  build stopped early last time), so a branch test again means recreating them by hand, as before.
- `service_role` has no USAGE on schema `dpi` today (live). This migration does not change that. If a server-side job is
  meant to read these tables, it cannot today either.
- The skip-duplicates upload was tested as SQL `ON CONFLICT DO NOTHING`. How PostgREST translates the dashboard's header
  was not tested.
- Other schemas were not audited for the same pattern in this pass. The advisor's view finding
  (`public.recovery_compliance_exceptions`) is still open.

## Order of events (so nothing goes dark)
1. Publish the sign-in pages (`../hscs-kpi-rls-fix/dashboard-signin/`). 2. Apply the KPI fix. 3. Apply this fix.
Applying this before `dashboard.html` has the sign-in change would make that page show "Connection failed".
