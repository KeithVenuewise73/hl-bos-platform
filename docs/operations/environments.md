# Environments

**Last verified:** 2026-07-15

---

## 1. Canonical HL-BOS Core production project

Owner decision 2026-07-15 (Option 2): HL-BOS Core lives in a **new greenfield project** under the Pro organization. Verified against the live API on 2026-07-15:

| Property         | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| Organization     | `Herman Legacy Software Ventures`                               |
| Organization ID  | `ihtsbcxtvkbfkkpmforp`                                          |
| **Plan**         | **`pro`** ✅                                                    |
| Project ID / ref | `ywrzgursvdowzyhipsmt`                                          |
| Project name     | ⚠️ `keith@venuewise.net's Project` — **needs renaming, see §4** |
| Region           | `us-east-1` ✅                                                  |
| Postgres         | 17.6 (`17.6.1.141`), engine 17, channel `ga`                    |
| Status           | `ACTIVE_HEALTHY`                                                |
| Created          | 2026-07-15T19:13:04Z                                            |

The project **ref is not a secret** — it appears in every client request URL (`https://ywrzgursvdowzyhipsmt.supabase.co`). Recording it here is intentional and safe. The publishable key, service-role key and database password are secrets and appear nowhere in this repository.

## 2. Greenfield verification — evidence

The brownfield project's `public` schema looked nearly empty too, while hiding 133 tables in `hlvs` and `hscs_glp`. So this was verified against the catalogs directly, not by listing one schema:

```sql
select
  (select count(*) from pg_namespace  ...) as non_system_schemas,  -- 1  (public itself)
  (select count(*) from pg_class      ...) as user_tables,          -- 0
  (select count(*) from pg_proc       ...) as user_functions,       -- 0
  (select count(*) from auth.users)        as auth_users,           -- 0
  (select count(*) from storage.buckets)   as storage_buckets,      -- 0
  (select count(*) from pg_extension)      as extensions;           -- 5 (defaults)
```

| Check               | New project      | Brownfield project                      | Verdict           |
| ------------------- | ---------------- | --------------------------------------- | ----------------- |
| Non-system schemas  | **1** (`public`) | 4 (`hlvs`, `hscs_glp`, `public`, `dpi`) | ✅ greenfield     |
| User tables         | **0**            | 156                                     | ✅ greenfield     |
| User functions      | **0**            | 16+                                     | ✅ greenfield     |
| Migrations          | **0**            | 52                                      | ✅ greenfield     |
| Edge Functions      | **0**            | 9                                       | ✅ greenfield     |
| `auth.users`        | **0**            | 1                                       | ✅ greenfield     |
| Storage buckets     | **0**            | 2                                       | ✅ greenfield     |
| Security advisories | **0**            | 32 warnings                             | ✅ clean baseline |

**Confirmed greenfield.** Installed extensions are the Supabase defaults only: `plpgsql`, `uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `supabase_vault`.

All extensions migration `0001` needs are **available** on this project: `pgtap` 1.3.3 (RLS tests), `pg_cron` 1.6.4 (workflow scheduling), `pg_net` 0.20.3 (async webhooks). `supabase_vault` 0.3.1 is already installed — that is where provider credentials go.

Postgres 17 matches `supabase/config.toml` (`db.major_version = 17`).

## 3. Legacy / brownfield project — EXCLUDED

| Property          | Value                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| Organization      | `Herman Supply Chain Solutions` (plan: **free**)                                    |
| Project ref       | `bkfsjhhclbqrhaolvhmz`                                                              |
| Contents          | HLVS, HSCS GLP, Asset Recovery, DPI, Brand Resurrection, KPI data, 9 Edge Functions |
| Status in Core v1 | **Excluded from every migration.** No cross-database dependency.                    |

**This project is no longer reachable from the current connection.** Verified 2026-07-15:

```
get_project(bkfsjhhclbqrhaolvhmz)
  -> MCP error -32600: You do not have permission to perform this action
```

This is a **useful safety property**: HL-BOS tooling now physically cannot modify the legacy database, which enforces the scope boundary in `migration-plan.md` §2 at the credential layer rather than by discipline alone.

⚠️ **It also means the security remediation workstream is currently unexecutable.** Audit finding **SEC-1** remains live: `public.ltr_data`, `kpi_sp_weekly` and `kpi_spe_weekly` grant `USING(true) WITH CHECK(true)` to `PUBLIC` (which includes `anon`), leaving **2,481 rows readable, writable and deletable by anyone holding the publishable key**. That has not changed and is not fixed. Remediation requires either re-scoping a connection to the legacy organization or applying it manually, as a separate reviewed workstream.

## 4. Outstanding — project name

The project carries Supabase's auto-generated default name, `keith@venuewise.net's Project`. The decision specifies `Herman Legacy Business Platform`.

**Note the collision:** the brownfield project is _already_ named `Herman Legacy Business Platform`. Two projects with identical names — one legacy-to-be-secured, one canonical production — makes every future instruction naming that project ambiguous, including instructions to apply a migration. The two now sit in different organizations, which reduces but does not remove the hazard.

Recommended: name this project **`HL-BOS Core`**. Awaiting owner decision.

Renaming is a label change: it does not alter the project ref, connection strings, or data. It cannot be done through the MCP tools available here — it requires the Supabase dashboard.

## 5. Environment matrix

| Environment | Backing                                       | Status                                                  |
| ----------- | --------------------------------------------- | ------------------------------------------------------- |
| Local       | `supabase start` (see `supabase/config.toml`) | Configured, not yet exercised                           |
| Preview     | Supabase branch off `ywrzgursvdowzyhipsmt`    | **Not created.** Branching not yet verified as enabled. |
| Staging     | TBD                                           | Not introduced                                          |
| Production  | `ywrzgursvdowzyhipsmt`                        | Created, empty, **no migrations applied**               |

Per `migration-plan.md` §5, migrations reach production only via a protected workflow with manual approval — never via MCP `apply_migration`, dashboard SQL, or any ad-hoc path. That rule is what the brownfield project's 52 out-of-band migrations exist to warn us about.
