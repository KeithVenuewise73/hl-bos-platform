# Phase 2 — Proposed Migration Set (REVISED)

**Status:** 🔴 PROPOSED. **No SQL authored. Nothing applied. Supabase not modified.**
**Revised:** 2026-07-15, per owner review. Corrections 1–3 applied.
**Target:** `ywrzgursvdowzyhipsmt` (HL-BOS Core, Herman Legacy Software Ventures — Pro)
**Excluded:** `bkfsjhhclbqrhaolvhmz` (legacy). Unreachable from this connection; not accessed.
**Branch:** `feat/phase-2-identity-tenancy` off `main` @ `345cc71`

Target re-verified before revising: **0 user tables, 0 migrations, 0 auth users.** PG 17.6.

---

## 1. What changed

| #   | Correction           | Change                                                                       |
| --- | -------------------- | ---------------------------------------------------------------------------- |
| 1   | Audit writes         | INSERT revoked from `authenticated`. Trigger-only, all fields derived. §7    |
| 2   | Tenant bootstrap     | `platform.tenants` INSERT policy **removed**. `provision_tenant()` added. §6 |
| 3   | Invitation lifecycle | `.delete` → `.revoke`. `accept_invitation()` added. §8                       |
| —   | Migration count      | 5 → **6** (`0006_provisioning_and_invitation_flow`)                          |
| —   | CI                   | New `database-tests` job. §12                                                |

## 2. Revised migration list

```
20260716HHMMSS_hlbos_0001_extensions_and_schemas.sql
20260716HHMMSS_hlbos_0002_identity_and_tenancy.sql
20260716HHMMSS_hlbos_0003_roles_and_permissions.sql
20260716HHMMSS_hlbos_0004_audit_foundation.sql
20260716HHMMSS_hlbos_0005_seed_platform_reference_data.sql
20260716HHMMSS_hlbos_0006_provisioning_and_invitation_flow.sql
```

`0006` is new. Provisioning and acceptance depend on **every** other object — tenants, memberships, roles, permissions, audit triggers, and the seeded `tenant_owner` role. Folding them into `0002` would force a table into existence before its guard rails. They ship last, on a complete foundation.

**RLS ordering** (owner-approved): `0002` enables RLS + `FORCE` with **zero policies**. Postgres denies all access to a table with RLS on and no policy, so the state between `0002` and `0003` fails closed. `0003` adds every policy at once against a complete permission model. This satisfies "RLS policies must ship with the protected tables" — via deny-by-default, which is stronger than policy-per-file: there is no window in which a table is reachable unprotected.

All six satisfy `scripts/check-migrations.sh`: `hlbos_` prefix, unique ordinals, `-- rollback:` block, no secrets, no destructive DDL.

---

## 3. `0001_extensions_and_schemas`

| Extension  | Version | Why                                                          |
| ---------- | ------- | ------------------------------------------------------------ |
| `pgcrypto` | 1.3     | `gen_random_uuid()`, `digest()` for invitation token hashing |
| `citext`   | 1.6     | Case-insensitive email, slug, permission keys                |
| `pgtap`    | 1.3.3   | In-database tests. **Verified available on target.**         |

`pg_cron` / `pg_net` available but **not installed** — nothing in Phase 2 uses them.

Schemas: `platform`, `identity`, `audit`. (3 of 11; the rest arrive with their phase.)

```
REVOKE ALL ON SCHEMA platform, identity, audit FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA platform, identity, audit TO authenticated;
-- anon gets USAGE on nothing.
ALTER DEFAULT PRIVILEGES IN SCHEMA ... REVOKE ALL ON TABLES FROM PUBLIC, anon;
```

`config.toml` already sets `api.schemas = ["public"]`, so PostgREST never publishes these schemas and no helper is reachable as RPC.

---

## 4. `0002_identity_and_tenancy` — 4 tables, 3 enums

**Enums:** `platform.tenant_status` (`trial`,`active`,`suspended`,`deactivated`) · `identity.membership_status` (`invited`,`active`,`suspended`,`removed`) · `identity.invitation_status` (`pending`,`accepted`,`revoked`,`expired`)

### `platform.tenants`

`id uuid PK` (`gen_random_uuid()`) · `slug citext UNIQUE` (CHECK `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`) · `name text NOT NULL` · `status` (default `trial`) · `branding jsonb` · `settings jsonb` · `created_at`/`updated_at`/`created_by`/`updated_by` · `deactivated_at`
`CHECK ((status='deactivated') = (deactivated_at IS NOT NULL))`
Soft-deactivation only; no DELETE policy.

### `identity.profiles`

`id uuid PK → auth.users(id) ON DELETE CASCADE` · `display_name` · `avatar_url` · `default_tenant_id uuid → platform.tenants ON DELETE SET NULL` · timestamps.
PK **is** `auth.users.id`. No second password system.
⚠️ `default_tenant_id` is a **UI hint, not an authorization input.** No policy reads it.

### `identity.memberships`

`id uuid PK` · `tenant_id → platform.tenants ON DELETE CASCADE` · `user_id → auth.users ON DELETE CASCADE` · `status` (default `invited`) · timestamps.
**`UNIQUE (tenant_id, user_id)`** · index `(user_id) WHERE status='active'` — **every RLS check in the platform traverses this index** · index `(tenant_id)`.

### `identity.invitations`

`id uuid PK` · `tenant_id → platform.tenants ON DELETE CASCADE` · `email citext NOT NULL` (CHECK format) · `role_key citext → identity.roles(key)` · **`token_hash text NOT NULL UNIQUE`** · `status` (default `pending`) · `expires_at timestamptz NOT NULL` (CHECK `> created_at`) · `invited_by` · `accepted_by` · `accepted_at`
`UNIQUE (tenant_id, email) WHERE status='pending'` · `CHECK ((status='accepted') = (accepted_at IS NOT NULL))`

🔴 **`token_hash`, never the token.** Raw token generated in the application, emailed once, never stored. Only `encode(digest(token,'sha256'),'hex')` persists. If this table leaks, no invitation can be accepted. Storing raw tokens makes the table a set of bearer credentials granting tenant access — precisely the kind of thing that ends up in a support export.

---

## 5. `0003_roles_and_permissions` — 5 tables, 6 functions, all policies

**`identity.roles`** `key citext PK` · `name` · `description` · `scope` (`platform`|`tenant`) · `is_system`
**`identity.permissions`** `key citext PK` · `description` · `scope` · CHECK `^[a-z_]+\.[a-z_]+\.(read|create|update|delete|revoke|assign|manage)$`
**`identity.role_permissions`** PK `(role_key, permission_key)`. Trigger: `role.scope = permission.scope`. **The anti-escalation constraint** — a tenant role can never hold a platform permission.
**`identity.membership_roles`** PK `(membership_id, role_key)` · `granted_at`/`granted_by`. Trigger: `role.scope='tenant'`.
**`identity.platform_admins`** `user_id uuid PK → auth.users` · `role_key` · `granted_at`/`granted_by`. Trigger: `role.scope='platform'`.
Separate table, **not** a membership with a sentinel tenant — a NULL/magic tenant would need a special case in every tenant-scoped policy, and one missed case is a cross-tenant leak.

### Functions — `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`, fully qualified

`identity.is_member(uuid)` · `identity.my_tenant_ids()` · `identity.has_permission(uuid, citext)` · `identity.is_platform_admin()` · `identity.has_platform_permission(citext)` · `platform.tenant_is_operable(uuid)`

`search_path = ''` (empty, not `'identity, public'`) with every identifier schema-qualified — stricter than the legacy project, which pins to `'hscs_glp','public'` and so still resolves unqualified names against `public`.

`GRANT EXECUTE TO authenticated` only. **Never `anon`, never `PUBLIC`.**

```
-- has_permission, reference shape
SELECT EXISTS (
  SELECT 1
  FROM identity.memberships m
  JOIN platform.tenants          t  ON t.id = m.tenant_id
  JOIN identity.membership_roles mr ON mr.membership_id = m.id
  JOIN identity.role_permissions rp ON rp.role_key = mr.role_key
  WHERE m.user_id       = auth.uid()     -- from the JWT. Not forgeable.
    AND m.tenant_id     = p_tenant       -- a FILTER. Never proof.
    AND m.status        = 'active'
    AND t.status IN ('trial','active')   -- suspension is real, for every role
    AND rp.permission_key = p_permission
)
```

---

## 6. Correction 2 — tenant bootstrap

### `platform.provision_tenant(p_slug citext, p_name text, p_owner uuid DEFAULT NULL) RETURNS uuid`

`SECURITY DEFINER` · owner `postgres` · `VOLATILE` · `SET search_path = ''` · `GRANT EXECUTE TO authenticated`

**Takes no tenant id.** There is no parameter through which a caller could supply one, so "a supplied tenant UUID is never accepted as authorization" holds _structurally_, not by validation.

```
1. v_actor := auth.uid();
     IF NULL -> RAISE insufficient_privilege 'authentication required'
2. IF NOT identity.has_platform_permission('platform.tenant.create')
     -> RAISE insufficient_privilege
     -> audit.log_security_event('denied', 'platform.tenant.create')
3. v_owner := coalesce(p_owner, v_actor);
     verify EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) ELSE RAISE
4. v_tenant := gen_random_uuid()            -- generated INTERNALLY
5. INSERT INTO platform.tenants (id, slug, name, status, created_by)
     VALUES (v_tenant, p_slug, p_name, 'trial', v_actor)
     ON CONFLICT (slug) DO NOTHING;
   IF NOT FOUND -> RAISE unique_violation 'tenant slug already exists'   -- safe rejection
6. INSERT INTO identity.memberships (tenant_id, user_id, status, created_by)
     VALUES (v_tenant, v_owner, 'active', v_actor) RETURNING id INTO v_membership
7. INSERT INTO identity.membership_roles (membership_id, role_key, granted_by)
     VALUES (v_membership, 'tenant_owner', v_actor)
8. -- audit rows emitted automatically by the 0004 triggers on all three tables
9. RETURN v_tenant
```

**Atomicity.** A PL/pgSQL function runs in the caller's transaction; an exception at any step rolls back every effect of the call. Step 7 failing cannot leave an ownerless tenant from step 5. There is no partial state to clean up.

**Authorization.** `platform.tenant.create` is a _platform_ permission, so only `platform_owner`/`platform_admin` provision tenants. Self-serve signup is a Phase 6 decision, not smuggled in here.

**No escalation risk.** A platform admin can make themselves owner of a **new, empty** tenant. They cannot join an existing one — that needs `identity.membership.create` _in that tenant_, which no platform role holds. The no-blanket-access decision is intact.

**Idempotency:** duplicate slug → deterministic rejection, no partial write. Chosen over silent return-existing, which would mask a bug where two callers race for one slug.

### 🔴 Genuine chicken-and-egg: the first `platform_owner`

`provision_tenant()` requires `platform.tenant.create`, held only via `identity.platform_admins`. `0005` seeds roles and permissions but **no admins** — seeding one would put a known-identity superuser into production.

So on a fresh database **nobody can provision anything** until an operator inserts the first row:

```
-- RUNBOOK, not a migration. Run once, via SQL editor / service_role, against a
-- real human's auth.users row. Must be recorded in audit.security_events.
INSERT INTO identity.platform_admins (user_id, role_key)
VALUES ('<uuid of the real owner from auth.users>', 'platform_owner');
```

Not automated on purpose: it is the one irreducibly manual step, it requires a human who has already signed up, and it is the single most privileged grant in the system. It belongs in a deployment checklist with a name attached — not in a migration that runs unattended.

---

## 7. Correction 1 — audit writes

### `0004_audit_foundation` — 2 tables

**`audit.events`** — `id bigint GENERATED ALWAYS AS IDENTITY PK` · `tenant_id uuid → platform.tenants` (NULL = platform-level) · `actor_type` (`user`,`service_account`,`system`,`anonymous`) · `actor_id uuid` · `action text NOT NULL` · `resource_type`/`resource_id` · `before`/`after jsonb` · `correlation_id`/`request_id` · `ip inet` · `user_agent` · `occurred_at timestamptz NOT NULL DEFAULT now()`

📌 `bigint` PK deviates from "UUIDs unless documented" — **this is the documentation.** Append-only, read in time order; a monotonic identity gives total ordering and a half-width index `gen_random_uuid()` cannot. `occurred_at` alone collides. PG18's `uuidv7()` would resolve it; target is 17.6. Owner-approved.

Indexes: `(tenant_id, occurred_at DESC)` · `(correlation_id)` · `(actor_id, occurred_at DESC)`

**`audit.security_events`** — same shape plus `severity` (`info`|`warning`|`critical`) and `outcome` (`allowed`|`denied`).

### The write path — nothing user-callable

```
REVOKE ALL   ON audit.events, audit.security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON audit.events TO authenticated;   -- security_events: no grant at all
-- No INSERT policy. No UPDATE policy. No DELETE policy. On either table.
```

`audit.emit()` — `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW`, `SECURITY DEFINER`, owner `postgres` (`rolbypassrls = true`, **verified on target**), so it inserts despite no policy. `authenticated` has neither grant nor policy: a direct INSERT fails twice.

Attached to: `platform.tenants`, `identity.memberships`, `identity.membership_roles`, `identity.invitations`.

Every field derived, none accepted:

| Field            | Derivation                                                |
| ---------------- | --------------------------------------------------------- |
| `actor_id`       | `auth.uid()`                                              |
| `actor_type`     | `'user'` if `auth.uid()` non-null else `'system'`         |
| `occurred_at`    | `now()`                                                   |
| `tenant_id`      | `NEW/OLD.tenant_id` (`NEW/OLD.id` for `platform.tenants`) |
| `action`         | `TG_TABLE_SCHEMA.TG_TABLE_NAME.lower(TG_OP)`              |
| `resource_id`    | `NEW/OLD.id`                                              |
| `before`/`after` | `to_jsonb(OLD/NEW) - 'token_hash'`                        |

The trigger takes no caller input. Forging an actor, a system event, or another tenant's event is not blocked by a check — **there is no parameter to forge.**

🔴 `REVOKE EXECUTE ON FUNCTION audit.emit() FROM PUBLIC, anon, authenticated;`
This is the legacy SEC-3 defect exactly: `hscs_glp.enforce_los_legal_review()` and `sync_bid_los_flags()` are trigger functions callable by `anon` via `/rest/v1/rpc/`. A trigger function exposed as RPC is a trigger anyone can fire out of band. Not repeating it.

🔴 **Redaction:** `- 'token_hash'` on `before`/`after`. Even a hash is a credential verifier and must not sit in a log `tenant_admin` can read.

**`audit.log_security_event(...)`** — `SECURITY DEFINER`, **no `EXECUTE` grant to `authenticated`**. Called only from within other definer functions (`provision_tenant`, `accept_invitation`) to record denials. Not reachable from the API.

### Immutability

`BEFORE UPDATE OR DELETE ... FOR EACH ROW → RAISE EXCEPTION`, on both tables.

Triggers fire regardless of RLS **and regardless of `BYPASSRLS`**. Verified: `service_role` and `postgres` both have `rolbypassrls = true`, so policies and grants do nothing against them. Every server-side write path uses `service_role`. **The trigger is the only layer that actually makes the log immutable.**

---

## 8. Correction 3 — invitation lifecycle

### Permissions

`identity.invitation.read` · `.create` · **`.revoke`** (was `.delete`)

`.delete` was wrong twice: it guarded an **UPDATE**, and it implied destruction. Revocation sets `status='revoked'`; the row survives. Who invited whom, and who withdrew it, is exactly what the audit trail is for. There is no DELETE policy on invitations at all.

### 🔴 `identity.invitation.accept` — flagged, not implemented

The review requires four permissions. **I implemented three.** `has_permission()` requires an **active membership**; the invitee has none — that is what an invitation _is_. So `has_permission(t,'identity.invitation.accept')` is `false` by construction, forever, for every invitee.

The options are dead vocabulary (a control that looks real and enforces nothing) or weakening `has_permission()` to accept non-active memberships — which would let suspended and removed members start resolving permissions across **every table in the platform**. Categorically not doing the second.

Acceptance is authorized by **possession of a secret sent to the invited address** — a stronger proof than a permission bit. Full reasoning: `permission-model.md` §7. **Requesting a ruling.**

### `identity.accept_invitation(p_token text) RETURNS uuid`

`SECURITY DEFINER` · owner `postgres` · `VOLATILE` · `SET search_path = ''` · `GRANT EXECUTE TO authenticated`

```
1.  v_actor := auth.uid(); IF NULL -> RAISE 'authentication required'
2.  v_email := (SELECT email FROM auth.users WHERE id = v_actor)
3.  v_hash  := encode(digest(p_token, 'sha256'), 'hex')
4.  SELECT * INTO v_inv FROM identity.invitations
      WHERE token_hash = v_hash FOR UPDATE;         -- row lock: no double-accept race
    IF NOT FOUND -> log_security_event('denied'); RAISE 'invalid or expired invitation'
5.  IF v_inv.status <> 'pending'          -> RAISE 'invalid or expired invitation'
6.  IF v_inv.expires_at <= now()          -> UPDATE status='expired';
                                             RAISE 'invalid or expired invitation'
7.  IF v_inv.email <> v_email             -> log_security_event('denied');
                                             RAISE 'invalid or expired invitation'
8.  IF NOT platform.tenant_is_operable(v_inv.tenant_id) -> RAISE 'tenant unavailable'
9.  INSERT INTO identity.memberships (tenant_id, user_id, status, created_by)
      VALUES (v_inv.tenant_id, v_actor, 'active', v_actor)
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET status = 'active', updated_by = v_actor
      RETURNING id INTO v_membership;               -- duplicate membership: reactivate
10. INSERT INTO identity.membership_roles (membership_id, role_key, granted_by)
      VALUES (v_membership, v_inv.role_key, v_actor)
      ON CONFLICT DO NOTHING;
11. UPDATE identity.invitations
      SET status='accepted', accepted_by=v_actor, accepted_at=now()
      WHERE id = v_inv.id;
12. RETURN v_membership;
```

**Verified:** token hash (4) · pending status (5) · expiration (6) · intended email (7) · tenant status (8) · authenticated user (1) · duplicate membership (9).

**Uniform error message.** Steps 4–7 all raise _"invalid or expired invitation"_. Distinct messages would let an attacker with a token probe whether it exists, whether it is expired, and which address it belongs to. The denial detail goes to `audit.security_events`, which the attacker cannot read.

**`FOR UPDATE`** in step 4 locks the row: two concurrent accepts serialize, and the second sees `status='accepted'` and fails at step 5.

**Atomic.** Membership, role and invitation status move together or not at all.

**Re-invitation of a removed member** is handled by the `ON CONFLICT DO UPDATE` in step 9: the existing membership reactivates rather than the call failing on the `UNIQUE (tenant_id, user_id)` constraint.

---

## 9. Object inventory

| Kind               | Count   | Detail                                                                 |
| ------------------ | ------- | ---------------------------------------------------------------------- |
| Extensions         | 3       | `pgcrypto`, `citext`, `pgtap`                                          |
| Schemas            | 3       | `platform`, `identity`, `audit`                                        |
| Enums              | 6       |                                                                        |
| **Tables**         | **11**  | unchanged                                                              |
| Helper functions   | 6       | `identity.*`, `platform.tenant_is_operable`                            |
| **Flow functions** | **2**   | `platform.provision_tenant`, `identity.accept_invitation` ⬅ new        |
| Audit functions    | 3       | `audit.emit`, `audit.log_security_event`, `audit.verify_rls_coverage`  |
| Utility            | 1       | `set_updated_at()`                                                     |
| **RLS policies**   | **~24** | ⬇ from ~28 (3 INSERT policies removed)                                 |
| Triggers           | 16      | `updated_at` ×5, scope guards ×3, audit emit ×4, audit immutability ×4 |
| Seed rows          | 70      | 8 roles + 17 permissions + 45 grants                                   |

RLS enabled **11/11** · `FORCE` **11/11** · `USING(true)` count **0** · destructive operations **0**.

---

## 10. Rollback

| Migration | Rollback                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `0006`    | `DROP FUNCTION platform.provision_tenant, identity.accept_invitation;`                                 |
| `0005`    | `DELETE FROM identity.role_permissions; DELETE FROM identity.permissions; DELETE FROM identity.roles;` |
| `0004`    | `DROP SCHEMA audit CASCADE;`                                                                           |
| `0003`    | Drop 6 functions, 5 tables, all policies, `role_scope`                                                 |
| `0002`    | `DROP TABLE identity.invitations, memberships, profiles, platform.tenants CASCADE;` + 3 enums          |
| `0001`    | `DROP SCHEMA platform, identity, audit CASCADE;` + extensions                                          |

Full rollback = `DROP SCHEMA platform, identity, audit CASCADE`. Nothing outside those three schemas is touched; `auth` and `storage` are never modified.

⚠️ **Cheap only while empty.** Once a real tenant exists, `0002`'s rollback destroys customer data and becomes an `-- approved-destructive:` operation requiring an impact report. **The free-rollback window closes at the first `provision_tenant()` call.**

---

## 11. pgTAP test inventory — 22 tests

`supabase/tests/`. Fixtures: 2 tenants, 6 users spanning every role.

### Tenant isolation

| #   | Test                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 1   | `t_tenant_a_cannot_read_tenant_b`                                                                               |
| 2   | `t_tenant_a_cannot_modify_tenant_b`                                                                             |
| 3   | `t_tenant_a_cannot_read_b_memberships`                                                                          |
| 4   | 🔴 `t_arbitrary_tenant_id_is_not_proof` — `has_permission(B,…)` as A's owner **with a valid session** → `false` |

### Roles

| #   | Test                                                                  |
| --- | --------------------------------------------------------------------- |
| 5   | `t_staff_cannot_perform_owner_actions`                                |
| 6   | `t_viewer_cannot_modify` — all 11 tables                              |
| 7   | `t_anon_cannot_access_anything` — `SET ROLE anon` → permission denied |
| 8   | `t_platform_admin_has_no_blanket_tenant_access`                       |
| 9   | `t_suspended_tenant_denies_all` — incl. `tenant_owner`                |
| 10  | `t_removed_member_has_no_permissions`                                 |
| 11  | `t_role_scope_is_enforced`                                            |
| 12  | `t_permission_scope_is_enforced`                                      |

### Correction 1 — audit

| #   | Test                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 13  | 🔴 `t_user_cannot_insert_audit_directly` — `INSERT INTO audit.events` as `authenticated` → **denied**               |
| 14  | 🔴 `t_user_cannot_fabricate_actor` — trigger-written row always has `actor_id = auth.uid()`, never a supplied value |
| 15  | 🔴 `t_user_cannot_call_audit_emit_as_rpc` — `EXECUTE audit.emit()` as `authenticated`/`anon` → denied               |
| 16  | `t_user_cannot_write_security_events`                                                                               |
| 17  | `t_audit_is_append_only` — UPDATE/DELETE → exception, **including as `service_role`**                               |
| 18  | `t_audit_redacts_token_hash` — `before`/`after` never contain `token_hash`                                          |

### Correction 2 — bootstrap

| #   | Test                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 19  | 🔴 `t_unauthorized_user_cannot_provision_tenant` — no `platform.tenant.create` → exception, **0 tenants created** |
| 20  | `t_provisioning_creates_exactly_one_owner` — 1 membership, 1 `tenant_owner` role, `count(*) = 1`                  |
| 21  | 🔴 `t_partial_provisioning_rolls_back` — force step 7 to fail → **0 tenants, 0 memberships** remain               |
| 22  | `t_duplicate_provisioning_is_rejected` — same slug twice → exception, exactly 1 tenant                            |
| 23  | `t_no_one_can_insert_tenant_directly` — `INSERT INTO platform.tenants` as `authenticated` → denied                |

### Correction 3 — invitations

| #   | Test                                                                       |
| --- | -------------------------------------------------------------------------- |
| 24  | `t_accept_requires_valid_token`                                            |
| 25  | `t_accept_rejects_wrong_email` — valid token, wrong account → denied       |
| 26  | `t_accept_rejects_expired`                                                 |
| 27  | `t_accept_rejects_non_pending` — revoked / already accepted                |
| 28  | `t_accept_rejects_suspended_tenant`                                        |
| 29  | `t_accept_is_atomic` — membership + role + status together                 |
| 30  | `t_duplicate_accept_is_safe` — second call fails, membership count stays 1 |
| 31  | `t_invitation_token_is_never_plaintext`                                    |

### Coverage

| #   | Test                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- |
| 32  | `t_rls_coverage_is_complete` — every table: `relrowsecurity` AND `relforcerowsecurity` AND ≥1 policy |
| 33  | `t_helpers_are_not_anon_executable`                                                                  |

**No test is reported as passing unless it was executed and the real output shown.**

---

## 12. CI database-test design

pgTAP needs `auth.uid()`, and the `anon`/`authenticated`/`service_role` roles. **A bare `postgres:17` service container has none of them** — RLS tests against it would pass while proving nothing. So CI runs the real local Supabase stack.

```yaml
database-tests:
  name: Database tests (pgTAP)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  permissions:
    contents: read # no PR API access needed
  steps:
    - uses: actions/checkout@v6
    - uses: supabase/setup-cli@v1 # composite action -- no Node 20 exposure
      with:
        version: latest
    - name: Start local Supabase
      run: supabase start
    - name: Verify migrations apply cleanly from scratch
      run: supabase db reset
    - name: Run pgTAP tests
      run: supabase test db
    - name: Lint database
      run: supabase db lint --level warning
```

`supabase db reset` re-applies every migration into an empty database, which is what catches ordering breakage and non-idempotent DDL. `supabase test db` runs `supabase/tests/*.sql`.

Runs on **local containers** — no Supabase project touched, no cost, no credentials. `supabase/setup-cli` is a composite action, verified from its `action.yml`, so it carries no Node 20 runtime exposure.

**This closes a Phase 1 gap I under-built.** Phase 1 shipped no database testing at all. pgTAP tests that never run are worse than none — they manufacture confidence.

---

## 13. Preview branching — availability

**Status: unconfirmed by API; almost certainly not yet enabled.**

```
list_branches(ywrzgursvdowzyhipsmt)
  -> InternalServerErrorException: "Project reference is missing when validating permissions"
```

Consistent across retries. Not a clean "branching disabled" signal, so I will not claim it as one.

What **is** established, from Supabase's docs and the cost API:

| Fact                                                                                   | Source             |
| -------------------------------------------------------------------------------------- | ------------------ |
| Branching is available on Pro                                                          | docs               |
| Requires the **Supabase GitHub integration** installed and the repo connected          | docs               |
| Preview branches are ephemeral, **data-less**, auto-deleted on PR merge/close          | docs               |
| Cost: **$0.01344/hour**, Micro compute, usage-only                                     | `get_cost(branch)` |
| Branching Compute is **not covered by Spend Cap** and **Compute Credits do not apply** | docs               |

The `get_cost(type: "branch")` call returning a price implies the org can create branches. The likely reason `list_branches` fails is that **branching has never been enabled** on this project — it needs the GitHub integration connected first.

### Recommendation: enable branching. Do not create a staging project.

**Setup:** Dashboard → Project Settings → Integrations → Authorize GitHub → connect `KeithVenuewise73/hl-bos-platform` → **Working directory: `.`** (our `supabase/` is at the repo root).

🔴 **Do NOT enable "Deploy to production."** That option auto-applies migrations on merge to the production branch — which directly contradicts your standing requirement, the brief, and `migration-plan.md` §5. Production apply stays a manually-approved workflow.

✅ **Do** enable the Supabase check as a **required status check** on `main`, so a failing migration blocks the merge.

**Cost:** a PR open 48 hours ≈ **$0.65**. A month of continuous PR activity is a few dollars.

### If branching cannot be enabled: staging project

| Option                     | Cost                                          | Verdict                                                         |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| **Preview branching**      | ~$0.01/hr, only while a PR is open            | ✅ **Recommended** — ephemeral, data-less, per-PR, auto-cleaned |
| Persistent staging project | **$10/month** + compute (`get_cost(project)`) | Fallback only                                                   |

A separate staging project is a **worse** fit: it is long-lived (so it drifts from `main`, which is how the legacy project got 52 out-of-band migrations), it is shared (so two PRs collide), and it costs more. Branching gives an isolated, disposable database per PR.

**Layered safety, in order:**

1. **CI local stack** (§12) — every PR, free, catches migration and RLS errors
2. **Preview branch** — every PR, real Supabase, catches environment-specific issues
3. **Production** — manual approval only, after 1 and 2 pass and the PR is reviewed

Production stays untouched until all three gates are satisfied.

---

## 14. Blockers

1. 🔴 **This revision is not approved.** No SQL authored.
2. 🔴 **Ruling needed on `identity.invitation.accept`** (§8, `permission-model.md` §7). I implemented 3 of the 4 required invitation permissions and am flagging the 4th rather than shipping a dead control.
3. 🟠 **Branching not enabled.** Needs the GitHub integration connected in the dashboard — an owner action I cannot perform.
4. 🟡 **First `platform_owner` runbook** (§6) needs a named human and a recorded execution.
5. 🟡 **Project still named** `keith@venuewise.net's Project`.
6. 🟡 **3 Dependabot PRs open** on `main` — `checkout@v7`, `setup-node@v7`, `action-setup@v6`. Unrelated to Phase 2.
