# Phase 2 — Implementation Report

**Status:** ✅ Migrations and tests AUTHORED and EXECUTED locally. **Nothing applied to any Supabase project.**
**Branch:** `feat/phase-2-identity-tenancy`
**Date:** 2026-07-16

---

## 1. What HL-BOS can do today that it could not yesterday

Yesterday HL-BOS was a monorepo and a pile of design documents. Today there is a **working, tested multi-tenant authorization core** — six migrations that apply cleanly from an empty database, and 67 tests that actually ran.

Concretely, the database now:

- **Provisions a tenant atomically** — tenant + owner membership + owner role, or nothing. An ownerless tenant is not reachable, proven by injecting a failure at the last step.
- **Refuses cross-tenant access** — a valid session presenting another tenant's real UUID gets `false`. Not a policy that says so; a test that proves it.
- **Accepts invitations by token** — selector/verifier, constant-time verifier check, replay-proof, concurrency-proof (two live sessions race; exactly one membership results).
- **Cannot be lied to** — users cannot insert audit rows at all. The actor is derived from `auth.uid()`, so there is nothing to forge.
- **Cannot be tampered with** — audit `UPDATE`/`DELETE` is rejected _even for `service_role`_, which has `BYPASSRLS`.
- **Refuses to let a leaked service key mint a platform owner.**

## 2. Verified against the live database

Queried, not counted by hand:

| Object                         |       Count |
| ------------------------------ | ----------: |
| Schemas                        |           3 |
| Tables                         |          11 |
| — RLS enabled                  | **11 / 11** |
| — RLS **FORCED**               | **11 / 11** |
| Policies                       |          21 |
| Functions                      |          18 |
| — `SECURITY DEFINER`           |          12 |
| — …with explicit `search_path` | **12 / 12** |
| Triggers                       |          16 |
| Enums                          |           7 |
| Indexes                        |          23 |
| Roles / Permissions / Grants   | 8 / 17 / 46 |

**Invariants, all zero:**

| Check                                                   | Result |
| ------------------------------------------------------- | -----: |
| RLS coverage violations (`audit.verify_rls_coverage()`) |  **0** |
| `USING(true)` on tenant tables                          |  **0** |
| `SECURITY DEFINER` functions without `search_path`      |  **0** |
| Objects granted to `anon`                               |  **0** |

## 3. Test results — actually executed

PostgreSQL **17.6** (matching production) + pgTAP **1.3.5** (the real extension).

```
### 01_tenant_isolation.sql          12 passed
### 02_audit_and_access.sql          15 passed
### 03_provisioning.sql               9 passed
### 04_invitations.sql               13 passed
### 05_bootstrap_and_coverage.sql    14 passed
### 06_atomicity.sql                  3 passed
========================================
TOTAL: 66 passed, 0 failed

concurrency (2 live sessions):        1 passed
GRAND TOTAL: 67 passed, 0 failed
```

## 4. 🔴 Findings from execution — things review did not catch

Four real bugs, all found by running the code:

**1. Denial logging was dead code.** `provision_tenant` and `accept_invitation` logged a security event and then `RAISE`d. PostgreSQL has no autonomous transactions, so the raise destroys the audit row it just wrote. Proven:

```
insert into audit.security_events ...;
raise exception 'boom';
-> rows written: 0
```

A control that looks real and enforces nothing — the exact anti-pattern we rejected for `invitation.accept`. **Removed.** See §5.

**2. `gen_random_uuid()` is not in pgcrypto.** It moved to core in PG13 and lives in `pg_catalog`. `extensions.gen_random_uuid()` does not exist and fails at DDL time.

**3. An enum cast that only fires at runtime.** An inline `CASE` in an `INSERT` target list yields `text` and will not coerce to an enum. `audit.emit()` escaped it by assigning to a typed variable.

**4. A harness bug that masked a real runtime failure.** Creating `pgcrypto` in `public` before the migrations made `0001`'s `IF NOT EXISTS` a silent no-op, leaving `extensions.digest()` undefined. Because plpgsql resolves function calls at **runtime**, the migrations "applied cleanly" while `accept_invitation` was broken. Only the tests caught it.

Also: the docs said **45** grants; the approved matrix yields **46**. The seed was right, my arithmetic was wrong. The document moved, not the data.

## 5. 🔴 Known limitation — needs an owner decision

**Denials are not audited in-database.** Successful paths audit correctly (they commit). Denied paths raise, and the raise rolls back any audit row written first.

Pinned by `t_denials_are_not_audited_in_database` so it cannot be quietly forgotten or "fixed" by re-adding code that does nothing.

Options, none taken — each is a design change, not an implementation detail:

| Option                                               | Trade                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API layer records denials (Phase 6)                  | Simple. Not database-guaranteed.                                                                                                                       |
| `dblink` autonomous transaction                      | Native-ish. **Requires a connection string — credentials — inside the database**, and opens a connection per denial: a DoS amplifier on the auth path. |
| `pg_background` / `pg_cron` sweep of a durable queue | More moving parts.                                                                                                                                     |

## 6. Rollback

Every migration carries a `-- rollback:` block. Full teardown:

```sql
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS identity CASCADE;
DROP SCHEMA IF EXISTS platform CASCADE;
```

Nothing outside those three schemas is touched. `auth` and `storage` are never modified. No migration in this set drops or alters a table containing data, so no `-- approved-destructive:` marker appears anywhere.

⚠️ **The free-rollback window closes at the first `provision_tenant()` call.** After that, `0002`'s rollback destroys customer data and becomes an approved-destructive operation requiring an impact report.

## 7. Local test environment

The sandbox has no Docker, so `supabase start` is unavailable. Instead: embedded PostgreSQL **17.6** (userland, exact production match) + real pgTAP **1.3.5**, plus `scripts/local-test/supabase-shim.sql` recreating the Supabase roles, `auth` schema and `auth.uid()`.

**The shim is emulation, and that is its weakness** — if it drifts from real Supabase, these tests could pass while production differs. CI is the control: the identical test files run against the real stack via `supabase test db`. Divergences are listed in `scripts/local-test/README.md`.

## 8. Not done, deliberately

No migration applied. No Supabase project modified. No production deployment. No Phase 3. No billing, AI, communications, workflow, reputation, Salon AI, or UI.

## 9. Blockers

| #   | Blocker                                       | Owner action                                                                                                  |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Preview branching not enabled                 | GitHub integration in the dashboard; **"Deploy to production" OFF**                                           |
| 2   | Owner `auth.users` record                     | Add user → **Send invitation** → confirm. Not Auto Confirm.                                                   |
| 3   | Denial-audit decision (§5)                    | Choose an option, or accept the limitation                                                                    |
| 4   | Project ref changed to `mvvtngiopdrgiedjmhfb` | Recorded; not accessed. `environments.md` still cites the previous ref — needs confirmation before any apply. |
