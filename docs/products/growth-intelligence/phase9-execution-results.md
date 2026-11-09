# HLG Phase 9 — execution results (in progress)

## 1. JobScout security remediation (S-B2) — COMPLETED AND VERIFIED

Production project `mvvtngiopdrgiedjmhfb`, 2026-11-05. All evidence is non-sensitive:
row **counts** and catalog metadata only. No record contents were read.

### Before the change (VERIFIED)

| Check                                                                         | Result                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public key, real API, `HEAD` with exact count: `jobscout.v_shortlist`         | **200, 74 rows reachable**                                                                                                                                                                                                                                 |
| Same: `jobscout.v_last_runs`                                                  | **200, 5 rows reachable**                                                                                                                                                                                                                                  |
| Same: base tables `jobs`, `scores`, `companies`, `runs`, `resumes`, `runtime` | 401 (refused)                                                                                                                                                                                                                                              |
| Same: `applications`                                                          | 200, 0 rows (RLS filters everything for anon; untouched)                                                                                                                                                                                                   |
| Cause                                                                         | the API serves `jobscout` (`pgrst.db_schemas`); anon has `USAGE` on the schema; both views granted `anon=r/postgres`; both views ran with the owner's rights (no `security_invoker`), bypassing the tables' RLS                                            |
| View ACLs                                                                     | `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres}` (both)                                                                                                                                                                       |
| View definitions (md5)                                                        | `v_shortlist` 772dc06bccb4a99a34fc3e9fb6ad98fe · `v_last_runs` 2e2cbe67c16cab512538cf304a6c9578                                                                                                                                                            |
| Dependents                                                                    | no views, functions or cron jobs reference either view                                                                                                                                                                                                     |
| Legitimate readers                                                            | every deployed JobScout function reads through the **service role** (`jobscout-dashboard` via `_shared/page.ts`; `jobscout-score` and `jobscout-tailor` read tables, not the views). 24 h of API logs: **no** request to either view other than this check |
| Isolated validation                                                           | `security-packages.db.test.ts` on the production-equivalent copy: 6/6 (service role reads both views after; anon refused; rollback restores privileges exactly)                                                                                            |
| Recovery point                                                                | the exact prior state above (ACLs, options, definitions) plus the tested rollback. The change touches only view options and grants. A database-wide backup was **not** confirmed from here                                                                 |

### Change applied

Production migration version **`20261105185109`** `hlbos_sec_b2_jobscout_views_invoker`
(SQL kept byte-for-byte in `supabase/applied/`):

```sql
alter view jobscout.v_shortlist set (security_invoker = true);
alter view jobscout.v_last_runs set (security_invoker = true);
revoke select on jobscout.v_shortlist, jobscout.v_last_runs from anon, authenticated;
```

### After the change (VERIFIED)

| Check                                           | Result                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Public key, real API, `v_shortlist`             | **401 — `permission denied for view v_shortlist`**                                     |
| Public key, real API, `v_last_runs`             | **401 — `permission denied for view v_last_runs`**                                     |
| Service role (the dashboard's path), row counts | **74 and 5 — unchanged**                                                               |
| View ACLs                                       | `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`; `security_invoker=true` |
| View definitions (md5)                          | unchanged (same two hashes)                                                            |
| Supabase security advisor                       | no "security definer view" finding remains                                             |
| Production migration history                    | 112 rows (was 111); `.hlbos/production-ledger.json` updated                            |

### Rollback (prepared, not needed)

```sql
alter view jobscout.v_shortlist reset (security_invoker);
alter view jobscout.v_last_runs reset (security_invoker);
grant select on jobscout.v_shortlist, jobscout.v_last_runs to anon;
```

### Observed, not changed

Production has a schema `hlbos_stage` with tables `m0052` and `migration_0052`, which the advisor lists.
They were not created in this phase, and I have not touched them.
