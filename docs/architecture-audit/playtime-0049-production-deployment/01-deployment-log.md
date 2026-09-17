# Migration 0049 (playtime) — deployment log

**Date:** 2026-09-17 · **Engineer:** Claude (AI engineer) · **Authorization:** CEO approved
in session, in response to a written request naming migration 0049 and the canonical
project. **Target:** HL-BOS Core `mvvtngiopdrgiedjmhfb` (canonical production).

The real, chronological record. Every line is something that happened, with the evidence
it produced.

## Pre-flight (read-only)

| Check                                    | Result                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Local gates (`pnpm check`)               | green — 963 tests, lineage locked at 49 migrations                 |
| Local verification of 0049               | 35 pgTAP assertions against PostgreSQL 16.13 from empty, 0 failing |
| `playtime` schema present in production? | **No** — safe to apply, additive                                   |
| Repo file                                | `20260916210000_hlbos_0049_playtime_tracker.sql`, 549 lines        |

The pre-flight read also turned up three things the repository did not know, recorded in
[02-drift-findings.md](02-drift-findings.md). None of them made the apply unsafe; one of
them changed what the approval implied, and is called out there.

## One change made before applying

The file's header asserted **"NOT YET APPLIED ANYWHERE"**. Applying it would have made that
comment false, and editing an applied migration afterwards to fix it is precisely the drift
this lineage governs against. Migrations 0028 and 0046 assert their status nowhere, so the
claim was removed _before_ the apply, the checksum manifest regenerated, and the file
applied in its final form. Repo and production therefore hold the same bytes.

sha256 after the edit: `58d986b1a9210f6bc5ae717116eb1bf4966d48adc3b969a51f1a27bb3fe59b85`

## Timeline

| #   | Action                                                                                                                                       | Evidence           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | Applied 0049 via `apply_migration`, full SQL, onto the existing set.                                                                         | success            |
| 2   | Tool stamped the version as `20260917004911`; **reconciled the ledger** to the exact repo version `20260916210000`, per the XI-2L procedure. | ledger query below |
| 3   | **Structural validation — 11/11.**                                                                                                           | table below        |
| 4   | **Fail-closed proof — 5/5**, by assuming the role and setting JWT claims the way PostgREST does.                                             | table below        |
| 5   | Security advisors run. **Zero net-new findings**; counts identical to the pre-apply run; none names `playtime`.                              | table below        |
| 6   | Added `playtime` to PostgREST's exposed schemas by **appending** to the `authenticator` role setting.                                        | below              |
| 7   | **End-to-end proof — 8/8** with a real auth user, then deleted it via the product's own account-deletion path.                               | table below        |
| 8   | Confirmed all seven tables empty and no stray test account.                                                                                  | below              |
| 9   | Governance made truthful: `canonical.json`, `milestone.json`, the Control Center portfolio and the Enterprise Catalog.                       | this PR            |

### Ledger, after reconciliation

```
version           name
20260916210000    hlbos_0049_playtime_tracker     <- matches the repo exactly
20260916190643    hlbos_0048_ats_resume_optimizer <- unreconciled, see 02
```

### Structural validation — 11/11

| Check                                    | Value | Expected |
| ---------------------------------------- | ----- | -------- |
| tables                                   | 7     | 7        |
| RLS enabled **and forced**               | 7     | 7        |
| policies                                 | 28    | 28       |
| policies not scoped to `authenticated`   | 0     | 0        |
| functions                                | 5     | 5        |
| functions without a pinned `search_path` | 0     | 0        |
| `SECURITY DEFINER` functions             | 2     | 2        |
| triggers on playtime tables              | 5     | 5        |
| trigger on `auth.users`                  | 1     | 1        |
| `anon` / `PUBLIC` privileges             | 0     | 0        |
| `authenticated` table grants             | 28    | 28       |

The 0047 lesson held: every one of the five functions pins `search_path`.

### Fail-closed proof — 5/5

| Check                                                     | Result          |
| --------------------------------------------------------- | --------------- |
| `anon` cannot read `playtime.players`                     | PASS (42501)    |
| `anon` cannot call `delete_my_account()`                  | PASS (42501)    |
| a signed-in user cannot write a row owned by someone else | PASS (42501)    |
| a signed-in user sees none of another user's teams        | PASS (0 rows)   |
| a signed-in user's own-scope query succeeds               | PASS (no error) |

### Exposed schemas

```sql
-- before: public, graphql_public, dma, vstudio, jobscout
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, dma, vstudio, jobscout, playtime';
notify pgrst, 'reload config';
```

**Appended, never replaced.** This role setting is what PostgREST exposes for the whole
platform; overwriting it would have taken every other application's API offline. Revert is
the same statement without `, playtime`.

### End-to-end proof — 8/8

Run against production with a real `auth.users` row, using the same scenario the pgTAP
suite asserts, so the expected seconds were known in advance. Self-cleaning: the final step
is `delete_my_account()`, which is itself one of the things under test, and the exception
handler removes the user on any failure.

| Check                                            | Result                 |
| ------------------------------------------------ | ---------------------- |
| profile created by the `auth.users` trigger      | PASS                   |
| event log is append-only (UPDATE refused)        | PASS (P0001)           |
| `rebuild_sessions` row count                     | PASS (3)               |
| athlete 1 seconds, halftime excluded             | **PASS (1440)**        |
| duplicate check-in did not open a second session | PASS (1 session)       |
| athlete 2 seconds                                | **PASS (1320)**        |
| athlete 2 entries                                | PASS (2)               |
| `delete_my_account()` removed everything         | PASS (0 rows anywhere) |

1440 and 1320 are the same two numbers asserted by the TypeScript engine and by the local
pgTAP suite. The database, the device and the local test harness agree to the second.

### After

All seven `playtime` tables: 0 rows. `auth.users`: 2 rows, unchanged from before; no
address matching the test user remains.

## Advisors — before vs after

| Lint                                                        | Before | After |
| ----------------------------------------------------------- | ------ | ----- |
| `rls_enabled_no_policy` (INFO)                              | 9      | 9     |
| `function_search_path_mutable` (WARN)                       | 6      | 6     |
| `extension_in_public` (WARN)                                | 2      | 2     |
| `anon_security_definer_function_executable` (WARN)          | 2      | 2     |
| `authenticated_security_definer_function_executable` (WARN) | 20     | 20    |
| `auth_leaked_password_protection` (WARN)                    | 1      | 1     |

No ERROR-level findings. **Zero net-new findings**, and not one names the `playtime`
schema. Every finding above belongs to a pre-existing schema.

## Outcome

Migration 0049 is applied to canonical production at version `20260916210000`, verified
structurally, verified fail-closed, and verified end to end against real data that was then
deleted by the product's own account-deletion path.

## What was NOT done (by design / boundary)

- **No application was deployed and no build was pointed at the database.** No build has
  been given `NEXT_PUBLIC_SUPABASE_URL`, so PlayTime Tracker still runs entirely on the
  device and says so on its Account screen. **The app-to-PostgREST hop has never been
  exercised** — it could not be reached from the build sandbox. The database side is
  proven; that one network hop is not.
- **No other migration was applied**, and nothing in the existing set was modified.
- **No drift was repaired.** See [02-drift-findings.md](02-drift-findings.md); reconciling
  the forked lineages is an architectural decision, not a cleanup task.
- **Nothing was submitted to either store.**
