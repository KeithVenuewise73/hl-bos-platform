## Phase 2 — Identity, Tenancy, Permissions, Audit

Implements the owner-approved Phase 2 design. **6 migrations, 77 tests, all executed.**

> ⚠️ **Nothing has been applied to any Supabase project.** Migrations are authored and tested against a local PostgreSQL 17.6 only. Preview branching is not yet enabled (see Blockers).

### What this adds

HL-BOS can now provision tenants atomically, enforce tenant isolation, accept invitations by token, and keep an audit log that users cannot write to or tamper with.

|           |                                                                    |
| --------- | -----------------------------------------------------------------: |
| Tables    |                              11 — RLS enabled **and FORCED 11/11** |
| Policies  |                                                                 21 |
| Functions | 20 (13 `SECURITY DEFINER`, **all 13** with explicit `search_path`) |
| Triggers  |                                                                 17 |
| Seed      |                               8 roles / 17 permissions / 46 grants |

**Invariants (all zero):** RLS coverage violations · `USING(true)` on tenant tables · secdef functions without `search_path` · grants to `anon` · grants to `service_role`.

### Test results — actually run

PostgreSQL **17.6** (production match) + real pgTAP **1.3.5**.

```
01_tenant_isolation       12    05_bootstrap_and_coverage  14
02_audit_and_access       17    06_atomicity                3
03_provisioning            9    07_privilege_escalation     8
04_invitations            13
                                TOTAL: 76 passed, 0 failed
concurrency (2 sessions)   1    GRAND TOTAL: 77 / 0
```

### 🔴 Three privilege-escalation paths found and fixed in final review

Each was demonstrated against the running database before being fixed:

1. **`tenant_admin` could self-grant `tenant_owner`**, obtaining `tenancy.tenant.manage` — the one permission it is deliberately denied.
2. **`manager` could confer `tenant_owner` via an invitation** `role_key`, despite deliberately lacking `role.assign`.
3. **Invitations could carry a platform role**, failing at accept time on the invitee rather than at insert on the inviter.

Root cause: nothing enforced that you cannot grant a role more powerful than your own. Fixed with `identity.can_grant_role()`, applied to `membership_roles` INSERT/DELETE and `invitations` INSERT.

### Four bugs found by running the code

- Denial logging was **dead code** — Postgres has no autonomous transactions, so the `RAISE` rolled back the audit row it had just written. Removed; limitation pinned by a test.
- `gen_random_uuid()` is in `pg_catalog`, not pgcrypto (moved to core in PG13).
- An inline `CASE` in an `INSERT` yields `text` and won't coerce to an enum.
- A harness bug hid a real runtime failure: `extensions.digest()` was undefined while migrations still "applied cleanly", because plpgsql resolves calls at runtime.

### Known limitation — needs a decision

**Denials are not audited in-database.** Successful paths audit correctly. Denied paths raise, and the raise destroys any audit row written first. Options: API layer (Phase 6) · `dblink` autonomous txn (needs credentials _inside_ the DB, one connection per denial) · `pg_cron` sweep. **Recommend accepting the limitation and logging at the API layer.**

### Rollback

`DROP SCHEMA audit, identity, platform CASCADE`. Nothing outside those three is touched; `auth`/`storage` never modified; no destructive DDL in the set.

### Blockers before any apply

- [ ] Preview branching not enabled (`list_branches` errors)
- [ ] Owner `auth.users` record — invitation flow, **not** Auto Confirm
- [ ] Two projects now exist in the Pro org; **HL-BOS Core** (`mvvtngiopdrgiedjmhfb`) is in **us-west-2**, not us-east-1
- [ ] Denial-audit decision

### Not included

No migration applied. No production deployment. No Phase 3. No billing/AI/comms/workflow/reputation/UI.
