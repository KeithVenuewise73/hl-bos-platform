# Recovered production SQL — fleet, scorecards, medical cards (2026-10-17)

**These files are evidence, not migrations.** They are deliberately outside
`supabase/migrations/`, so nothing — CI, `supabase db reset`, the Control
Center — will ever apply them. Do not move them into the migrations folder
without an approved reconciliation plan.

## What they are

Seven migrations were applied to **HL-BOS Core (`mvvtngiopdrgiedjmhfb`)** on
2026-10-17 from outside any repository. They created the production `fleet`
and `scorecard` schemas, their APIs (`public.hlg_fleet_rpc`,
`public.hlg_fleet_medical_rpc`, `public.hlg_scorecard_rpc`,
`public.hlg_scorecard_account_rpc`) and two private storage buckets
(`hlg-fleet-documents`, `hlg-driver-medical-cards`). No repository contained
their source, so the Phase 4 source-control recovery had not captured them.

On 2026-11-04 each file was read, read-only, from
`supabase_migrations.schema_migrations.statements[1]` and written **byte for
byte**. Each was verified against the database's own `md5()`:

| Version        | Name                        |  Bytes | md5                                |
| -------------- | --------------------------- | -----: | ---------------------------------- |
| 20261017180151 | hlg_fleet_module            | 32,627 | `985a8c54b7bfb5b7f347347254215360` |
| 20261017180946 | hlg_fleet_query_scoping     | 20,420 | `25045884ebaa93f3566b8133225bb201` |
| 20261017182143 | hlg_fleet_validation_guards | 20,963 | `0c55f209ad84b2720c21df12a07dd613` |
| 20261017185208 | hscs_company_scorecards     |  8,837 | `4a7022364ffbf400c57145bcb3644a3c` |
| 20261017191105 | independent_scorecards      | 14,465 | `a17fdc09cdd8aa9484cb6ca753ff410d` |
| 20261017210755 | driver_medical_cards        |  5,626 | `5640c6e875207102c560a8483d39d1fe` |
| 20261017210958 | medical_card_orphan_cleanup |    209 | `34232767ab82b53a2ed5bc6e1ee53359` |

A scan for secrets, passwords, keys, tokens and e-mail addresses found none.

Production usage on 2026-11-04: one fleet workspace ("HSCS Fleet Management",
not initialized), one member, **0 vehicles, 0 inspections, 0 service records,
0 medical cards**; one scorecard company, **0 definitions, 0 runs**.

## How they are used

`scripts/local-test/tms-fleet-db.sh` builds an **isolated local** PostgreSQL
database from the repo's Supabase shim, HL-BOS migrations 0001–0008 (which
`fleet` depends on: `platform.tenants`, `platform.tenant_is_operable`) and
these seven files, in order. They apply cleanly. The TMS parity suite
(`packages/tms/src/backend.parity.test.ts`) then runs the same scenarios
against this SQL and against the app's in-memory port.

Local divergences: PostgreSQL 16.15 (production is 17.6), `auth`/`storage`
emulated by `scripts/local-test/supabase-shim.sql` + `tms-fleet-shim.sql`, and
pgTAP is not installed (its `create extension` line in 0001 is skipped; fleet
does not use it).
