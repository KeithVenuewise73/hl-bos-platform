# Phase 2 — Proposed Migration Set

**Status:** 🔴 PROPOSED. **Not implemented. Not applied. No SQL authored yet.**
**Target:** `ywrzgursvdowzyhipsmt` (HL-BOS Core, Herman Legacy Software Ventures — Pro)
**Excluded:** `bkfsjhhclbqrhaolvhmz` (legacy HSCS/HLVS). Unreachable from this connection by design.
**Branch:** `feat/phase-2-identity-tenancy` (off `main` @ `345cc71`)

Target verified immediately before writing this: **0 user tables, 0 migrations, 0 auth users.** Postgres 17.6.

---

## 1. Scope

Phase 2 per the brief: tenants, memberships, roles, permissions, invitations, tenant context, RLS foundation, audit foundation, admin authorization.

**Not in Phase 2:** module registry, entitlements, billing, AI, communications, workflows, reputation, storage, the Salon vertical. No table below anticipates them.

## 2. Revision to the migration numbering

`migration-plan.md` §4 put audit at `0011`. **That is wrong for Phase 2** and I am proposing a change rather than quietly deviating.

Audit is a Phase 2 deliverable ("Audit foundation"). Identity tables must be audited _from birth_ — a tenant created before the audit log exists has no creation record, permanently. So audit moves into Phase 2, and the module registry shifts to Phase 3.

| Migration                           | Was        | Now                                          |
| ----------------------------------- | ---------- | -------------------------------------------- |
| `0001_extensions_and_schemas`       | Phase 2    | Phase 2 ✅                                   |
| `0002_identity_and_tenancy`         | Phase 2    | Phase 2 ✅                                   |
| `0003_roles_and_permissions`        | Phase 2    | Phase 2 ✅                                   |
| `0004_audit_foundation`             | was `0011` | **Phase 2** ⬅ moved                          |
| `0005_seed_platform_reference_data` | was `0015` | **Phase 2** ⬅ moved (roles/permissions only) |
| `0006_module_registry`              | was `0004` | Phase 3                                      |

## 3. The five migrations

```
20260716HHMMSS_hlbos_0001_extensions_and_schemas.sql
20260716HHMMSS_hlbos_0002_identity_and_tenancy.sql
20260716HHMMSS_hlbos_0003_roles_and_permissions.sql
20260716HHMMSS_hlbos_0004_audit_foundation.sql
20260716HHMMSS_hlbos_0005_seed_platform_reference_data.sql
```

All satisfy `scripts/check-migrations.sh`: `hlbos_` prefix, unique ordinals, mandatory `-- rollback:` block, no secrets, no destructive DDL (so no `-- approved-destructive:` marker appears anywhere in this set).

### How the RLS ordering problem is solved

There is a genuine circular dependency: `0002`'s policies need `has_permission()`, which needs the role tables from `0003`; but `0003`'s tables need `platform.tenants` from `0002`.

**Resolution: `0002` enables RLS with `FORCE` and defines _zero_ policies.**

In Postgres, **RLS enabled with no policy denies all access** to non-superuser, non-owner roles. So between `0002` and `0003` the tables exist and are _completely inaccessible_ to `anon` and `authenticated`. The intermediate state fails closed. `0003` then adds every policy at once, against a complete permission model.

This also answers the deviation I flagged earlier ("RLS with tables, not deferred to 0014"). The principle holds — a table is never reachable without a policy protecting it — and the mechanism is deny-by-default rather than policy-in-the-same-file.

---

## 4. `0001_extensions_and_schemas`

**Extensions** (into `extensions` schema, never `public`):

| Extension  | Version | Why                                                          |
| ---------- | ------- | ------------------------------------------------------------ |
| `pgcrypto` | 1.3     | `gen_random_uuid()`, invitation token hashing                |
| `citext`   | 1.6     | Case-insensitive emails, slugs, permission keys              |
| `pgtap`    | 1.3.3   | In-database RLS tests. **Verified available on the target.** |

`pg_cron` and `pg_net` are available but **not installed** — nothing in Phase 2 uses them. They arrive with workflows (Phase 4).

**Schemas** (2 of the 11; the rest arrive with their phase — an empty schema is the same anti-pattern as an empty package):

| Schema     | Owner                                     | API-exposed? |
| ---------- | ----------------------------------------- | ------------ |
| `platform` | tenants, lifecycle                        | ❌ No        |
| `identity` | profiles, memberships, roles, permissions | ❌ No        |
| `audit`    | append-only event log                     | ❌ No        |

**Grants — the security spine of the whole phase:**

```
REVOKE ALL ON SCHEMA platform, identity, audit FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA platform, identity, audit TO authenticated;
-- anon gets USAGE on nothing. anon has zero reach into HL-BOS.
ALTER DEFAULT PRIVILEGES ... REVOKE ALL ON TABLES FROM PUBLIC, anon;
```

`supabase/config.toml` already sets `api.schemas = ["public"]`, so PostgREST does not publish these schemas and the helper functions are not reachable as RPC. That is the fix for the SEC-3 class of defect found in the legacy project, applied preventively.

---

## 5. `0002_identity_and_tenancy` — 4 tables, 3 enums

### Enums

| Type                         | Values                                        |
| ---------------------------- | --------------------------------------------- |
| `platform.tenant_status`     | `trial`, `active`, `suspended`, `deactivated` |
| `identity.membership_status` | `invited`, `active`, `suspended`, `removed`   |
| `identity.invitation_status` | `pending`, `accepted`, `revoked`, `expired`   |

### `platform.tenants`

| Column                      | Type                     | Notes                                                            |
| --------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `id`                        | `uuid` PK                | `default gen_random_uuid()`                                      |
| `slug`                      | `citext`                 | **UNIQUE**, `CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')` |
| `name`                      | `text`                   | `NOT NULL`, `CHECK (length(btrim(name)) > 0)`                    |
| `status`                    | `platform.tenant_status` | `NOT NULL DEFAULT 'trial'`                                       |
| `branding`                  | `jsonb`                  | `NOT NULL DEFAULT '{}'`                                          |
| `settings`                  | `jsonb`                  | `NOT NULL DEFAULT '{}'`                                          |
| `created_at` / `updated_at` | `timestamptz`            | `NOT NULL DEFAULT now()`, trigger maintains `updated_at`         |
| `created_by` / `updated_by` | `uuid`                   | → `auth.users(id)` `ON DELETE SET NULL`                          |
| `deactivated_at`            | `timestamptz`            |                                                                  |

`CHECK ((status = 'deactivated') = (deactivated_at IS NOT NULL))` — status and timestamp cannot disagree.

**Soft-deactivation only. No `DELETE` policy exists for any role.**

### `identity.profiles`

| Column                      | Type          | Notes                                                                  |
| --------------------------- | ------------- | ---------------------------------------------------------------------- |
| `id`                        | `uuid` PK     | → `auth.users(id)` `ON DELETE CASCADE`                                 |
| `display_name`              | `text`        |                                                                        |
| `avatar_url`                | `text`        |                                                                        |
| `default_tenant_id`         | `uuid`        | → `platform.tenants(id)` `ON DELETE SET NULL`. Backs tenant switching. |
| `created_at` / `updated_at` | `timestamptz` |                                                                        |

PK **is** `auth.users.id`. No parallel user table, no second password system — per the brief.

⚠️ `default_tenant_id` is a **UI convenience, not an authorization input.** No policy reads it. It is not "the current tenant" — see §9.

### `identity.memberships`

| Column                                              | Type                         | Notes                                                   |
| --------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `id`                                                | `uuid` PK                    |                                                         |
| `tenant_id`                                         | `uuid`                       | `NOT NULL` → `platform.tenants(id)` `ON DELETE CASCADE` |
| `user_id`                                           | `uuid`                       | `NOT NULL` → `auth.users(id)` `ON DELETE CASCADE`       |
| `status`                                            | `identity.membership_status` | `NOT NULL DEFAULT 'invited'`                            |
| `created_at`/`updated_at`/`created_by`/`updated_by` |                              |                                                         |

- **`UNIQUE (tenant_id, user_id)`** — one membership per user per tenant.
- Indexes: `(user_id) WHERE status='active'`, `(tenant_id)`.

The first index is load-bearing: **every RLS check on every table in the platform traverses it.**

### `identity.invitations`

| Column                       | Type                         | Notes                                                      |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `id`                         | `uuid` PK                    |                                                            |
| `tenant_id`                  | `uuid`                       | `NOT NULL` → `platform.tenants(id)` `ON DELETE CASCADE`    |
| `email`                      | `citext`                     | `NOT NULL`, `CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')` |
| `role_key`                   | `citext`                     | → `identity.roles(key)` (added in `0003`)                  |
| **`token_hash`**             | `text`                       | `NOT NULL`, **UNIQUE**                                     |
| `status`                     | `identity.invitation_status` | `NOT NULL DEFAULT 'pending'`                               |
| `expires_at`                 | `timestamptz`                | `NOT NULL`, `CHECK (expires_at > created_at)`              |
| `invited_by` / `accepted_by` | `uuid`                       | → `auth.users(id)`                                         |
| `accepted_at`                | `timestamptz`                |                                                            |

- `UNIQUE (tenant_id, email) WHERE status = 'pending'` — partial index; one live invite per address.
- `CHECK ((status='accepted') = (accepted_at IS NOT NULL))`

🔴 **`token_hash`, never the token.** The raw invitation token is generated in the application, emailed once, and **never stored**. Only `encode(digest(token,'sha256'),'hex')` is persisted. If this table leaks, an attacker cannot accept a single invitation.

Storing raw tokens would make this table a set of bearer credentials granting tenant access — the invitation table is exactly the kind of thing that ends up in a support export.

---

## 6. `0003_roles_and_permissions` — 5 tables + 6 functions + all policies

### Tables

**`identity.roles`** — `key citext PK` · `name` · `description` · `scope identity.role_scope` (`platform`|`tenant`) · `is_system boolean NOT NULL DEFAULT true`

**`identity.permissions`** — `key citext PK` · `description NOT NULL` · `scope identity.role_scope`
`CHECK (key ~ '^[a-z_]+\.[a-z_]+\.(read|create|update|delete|manage|assign)$')` — the closed action vocabulary, enforced.

**`identity.role_permissions`** — `PK (role_key, permission_key)`, both FK `ON DELETE CASCADE`.
`CHECK` via trigger: role.scope must equal permission.scope. A tenant role cannot hold a platform permission. **This is the anti-privilege-escalation constraint.**

**`identity.membership_roles`** — `PK (membership_id, role_key)` · `granted_at` · `granted_by`
Trigger enforces `role.scope = 'tenant'`. A platform role can never be attached to a tenant membership.

**`identity.platform_admins`** — `user_id uuid PK` → `auth.users(id)` · `role_key citext` → `roles(key)` · `granted_at` · `granted_by`
Trigger enforces `role.scope = 'platform'`.
**Deliberately a separate table, not a membership with a magic tenant_id.** A NULL/sentinel tenant on `memberships` would mean every tenant-scoped policy needs a special case for it, and one missed case is a cross-tenant leak.

### Functions — all `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`, fully-qualified identifiers

| Function                                                      | Returns      |
| ------------------------------------------------------------- | ------------ |
| `identity.is_member(p_tenant uuid)`                           | `boolean`    |
| `identity.my_tenant_ids()`                                    | `setof uuid` |
| `identity.has_permission(p_tenant uuid, p_permission citext)` | `boolean`    |
| `identity.is_platform_admin()`                                | `boolean`    |
| `identity.has_platform_permission(p_permission citext)`       | `boolean`    |
| `platform.tenant_is_operable(p_tenant uuid)`                  | `boolean`    |

`SET search_path = ''` (empty, not `'identity, public'`) with every identifier schema-qualified. Stricter than the legacy project, which uses `SET search_path TO 'hscs_glp','public'` — correct, but still resolves unqualified names against `public`, which a tenant could write to if `public` ever became writable.

`GRANT EXECUTE ... TO authenticated;` — **never `anon`, never `PUBLIC`.**

Reference shape (`has_permission`):

```
SELECT EXISTS (
  SELECT 1
  FROM identity.memberships m
  JOIN platform.tenants     t  ON t.id = m.tenant_id
  JOIN identity.membership_roles mr ON mr.membership_id = m.id
  JOIN identity.role_permissions rp ON rp.role_key = mr.role_key
  WHERE m.user_id       = auth.uid()      -- <<< identity from the JWT. Not forgeable.
    AND m.tenant_id     = p_tenant        -- <<< a FILTER. Never proof.
    AND m.status        = 'active'
    AND t.status IN ('trial','active')    -- <<< suspension is real, for every role
    AND rp.permission_key = p_permission
)
```

`auth.uid()` is present in **every** function. `p_tenant` narrows a set the caller already belongs to; it can never widen it.

---

## 7. `0004_audit_foundation` — 2 tables

### `audit.events`

| Column                          | Type               | Notes                                                      |
| ------------------------------- | ------------------ | ---------------------------------------------------------- |
| `id`                            | `bigint`           | `GENERATED ALWAYS AS IDENTITY` PK                          |
| `tenant_id`                     | `uuid`             | → `platform.tenants(id)`. **NULL = platform-level event.** |
| `actor_type`                    | `audit.actor_type` | `user`, `service_account`, `system`, `anonymous`           |
| `actor_id`                      | `uuid`             |                                                            |
| `action`                        | `text`             | `NOT NULL` — e.g. `identity.membership.created`            |
| `resource_type` / `resource_id` | `text`             |                                                            |
| `before` / `after`              | `jsonb`            |                                                            |
| `correlation_id` / `request_id` | `uuid`             |                                                            |
| `ip`                            | `inet`             |                                                            |
| `user_agent`                    | `text`             |                                                            |
| `occurred_at`                   | `timestamptz`      | `NOT NULL DEFAULT now()`                                   |

📌 **`bigint` PK, deviating from "use UUIDs unless documented."** This is the documented reason: `audit.events` is append-only and read in time order. A monotonic identity gives a clustered-friendly, half-width index and a total order that `gen_random_uuid()` cannot. `occurred_at` alone is insufficient — it collides. (PG18's `uuidv7()` would resolve this; the target is 17.6.)

**Indexes:** `(tenant_id, occurred_at DESC)`, `(correlation_id)`, `(actor_id, occurred_at DESC)`.

### `audit.security_events`

Same shape, plus `severity` (`info`|`warning`|`critical`) and `outcome` (`allowed`|`denied`). Permission denials, auth failures, platform-admin actions.

### 🔒 Append-only — enforced three ways

1. **Policy:** `SELECT` and `INSERT` policies only. **No `UPDATE` policy. No `DELETE` policy.** RLS denies what no policy permits.
2. **Grant:** `REVOKE UPDATE, DELETE ON audit.events FROM authenticated, anon, PUBLIC;`
3. **Trigger:** `BEFORE UPDATE OR DELETE` → `RAISE EXCEPTION`. This catches `service_role`, which **bypasses RLS entirely** — layers 1 and 2 would not stop it.

Layer 3 is the one that matters. The threat model lists "audit tampering," and the most privileged thing in the system is the service-role key.

**PII:** `before`/`after` carry only column names and non-sensitive values. No secrets, no tokens, no credential material — per the brief's "do not put secrets or unnecessary PII into logs."

---

## 8. `0005_seed_platform_reference_data`

Versioned reference data, **not `seed.sql`** — production needs these rows, so they must be reviewable and reproducible.

- 8 rows → `identity.roles`
- 17 rows → `identity.permissions`
- 45 rows → `identity.role_permissions` (the grant matrix in `permission-model.md` §4)

All `INSERT ... ON CONFLICT (key) DO UPDATE` — idempotent, re-runnable.

**No tenant. No user. No platform admin.** Bootstrapping the first `platform_owner` is an operator action against a real human's `auth.users` row; seeding one would put a known-key superuser into production. Documented as a runbook step, not a migration.

---

## 9. Notably NOT built

**No `current_tenant()` / `set_tenant()` session function.** Tenant context comes from the `p_tenant` argument at each call, checked against `auth.uid()` every time.

A session-variable current-tenant (`SET app.current_tenant = ...`) is the conventional pattern and it is a **privilege-escalation hazard**: the tenant becomes caller-supplied state that policies trust. Any path that sets it without re-checking membership is a cross-tenant read. Passing `p_tenant` explicitly means it is _never_ trusted — it is re-validated against `auth.uid()` on every single check.

`profiles.default_tenant_id` exists only so the UI can pick a landing tenant. **No policy reads it.**

---

## 10. Object inventory — exactly what gets created

| Kind         | Count                                           | Names                                                                                                                                                                                       |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extensions   | 3                                               | `pgcrypto`, `citext`, `pgtap`                                                                                                                                                               |
| Schemas      | 3                                               | `platform`, `identity`, `audit`                                                                                                                                                             |
| Enums        | 6                                               | `tenant_status`, `membership_status`, `invitation_status`, `role_scope`, `actor_type`, `severity`                                                                                           |
| **Tables**   | **11**                                          | `platform.tenants`; `identity.profiles`, `memberships`, `invitations`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `platform_admins`; `audit.events`, `security_events` |
| Functions    | 6 + `set_updated_at()` + audit guard trigger fn | see §6                                                                                                                                                                                      |
| RLS policies | **~28**                                         | see `rls-policy-matrix.md`                                                                                                                                                                  |
| Triggers     | 12                                              | `updated_at` ×5, scope guards ×3, audit immutability ×2, audit emit ×2                                                                                                                      |
| Seed rows    | 70                                              | 8 roles + 17 permissions + 45 grants                                                                                                                                                        |

**Tables with RLS enabled: 11 of 11. Tables with `FORCE`: 11 of 11.**
**Destructive operations: 0.**

---

## 11. Rollback

Every migration carries `-- rollback:`. Because Phase 2 is purely additive to an empty database, rollback is genuinely clean — there is no data to preserve and nothing pre-existing to restore.

| Migration | Rollback                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `0005`    | `DELETE FROM identity.role_permissions; DELETE FROM identity.permissions; DELETE FROM identity.roles;`          |
| `0004`    | `DROP SCHEMA audit CASCADE;`                                                                                    |
| `0003`    | Drop 6 functions, 5 tables, all policies, `role_scope` enum                                                     |
| `0002`    | `DROP TABLE identity.invitations, identity.memberships, identity.profiles, platform.tenants CASCADE;` + 3 enums |
| `0001`    | `DROP SCHEMA platform, identity, audit CASCADE;` + drop extensions                                              |

**Full rollback = `DROP SCHEMA platform, identity, audit CASCADE`.** Nothing outside these three schemas is touched, so no legacy or Supabase-managed object is at risk. `auth` and `storage` are never modified.

⚠️ **Rollback is only this cheap while the tables are empty.** Once a real tenant exists, `0002`'s rollback destroys customer data and becomes an `-- approved-destructive:` operation needing an impact report. The window for a free rollback closes the moment the first tenant is created.

**Applying to a Supabase preview branch first is what makes this safe to test at all.** Not yet verified as enabled on the target — flagged in §13.

---

## 12. pgTAP isolation tests

Location `supabase/tests/`. Run via `supabase test db` against a **local/preview** database. **Never production.**

Fixtures: 2 tenants (A, B), 6 users, spanning every role.

| #   | Test                                            | Asserts                                                                                                                   |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | `t_tenant_a_cannot_read_tenant_b`               | A's owner selects B's tenant → **0 rows**                                                                                 |
| 2   | `t_tenant_a_cannot_modify_tenant_b`             | A's owner updates B's tenant → **0 rows affected**                                                                        |
| 3   | `t_tenant_a_cannot_read_b_memberships`          | Cross-tenant membership read → 0 rows                                                                                     |
| 4   | 🔴 **`t_arbitrary_tenant_id_is_not_proof`**     | `has_permission(B_id, …)` as A's owner **with a valid session** → `false`. **The single most important test in Phase 2.** |
| 5   | `t_staff_cannot_perform_owner_actions`          | staff → `tenancy.tenant.manage` → `false`                                                                                 |
| 6   | `t_viewer_cannot_modify`                        | viewer UPDATE/INSERT/DELETE on all 11 tables → 0 rows                                                                     |
| 7   | `t_anon_cannot_access_anything`                 | `SET ROLE anon` → every table → **permission denied**                                                                     |
| 8   | `t_platform_admin_has_no_blanket_tenant_access` | platform_admin reads tenant business data → denied                                                                        |
| 9   | `t_suspended_tenant_denies_all`                 | tenant → `suspended` → `tenant_owner` gets `false`                                                                        |
| 10  | `t_removed_member_has_no_permissions`           | membership → `removed` → all `false`                                                                                      |
| 11  | `t_audit_is_append_only`                        | UPDATE/DELETE on `audit.events` → **exception**, incl. as `service_role`                                                  |
| 12  | `t_role_scope_is_enforced`                      | platform role → tenant membership → **exception**                                                                         |
| 13  | `t_permission_scope_is_enforced`                | platform permission → tenant role → **exception**                                                                         |
| 14  | `t_rls_coverage_is_complete`                    | every table in the 3 schemas has `relrowsecurity` AND ≥1 policy                                                           |
| 15  | `t_helpers_are_not_anon_executable`             | `anon` cannot `EXECUTE` any `identity.*` helper                                                                           |
| 16  | `t_invitation_token_is_never_plaintext`         | `token_hash` never equals a known raw token                                                                               |

Test 14 is the machine-checked version of the `verify_rls_coverage()` assertion. Test 4 is the one that would have caught the arbitrary-tenant-ID class of bug the brief warns about.

**No test will be reported as passing unless it was executed and the real output is shown.**

---

## 13. Blockers / open questions

1. 🔴 **This plan is not approved.** No SQL authored.
2. 🟠 **Preview branching not verified** on `ywrzgursvdowzyhipsmt`. Needed to test migrations before production. If unavailable, we need a second Supabase project as staging **before** any production apply.
3. 🟠 **`supabase/tests/` and `supabase test db` are not wired into CI.** pgTAP tests need a local Postgres in the workflow. Phase 2 implementation must add this, or the tests exist but never run — which is worse than no tests.
4. 🟡 **Platform-admin support access** (`permission-model.md` §4). Deliberately no backdoor. Confirm you accept that support cannot read customer data.
5. 🟡 **Project still named** `keith@venuewise.net's Project`.
6. 🟡 **Dependabot has 3 open PRs** — `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`. My "current" pins were already one major behind. Unrelated to Phase 2; they are on `main` and should be triaged separately.
