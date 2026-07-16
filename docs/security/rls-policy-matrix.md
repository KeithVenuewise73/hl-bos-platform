# RLS Policy Matrix — Phase 2

**Status:** REVISED per owner review 2026-07-15. Awaiting approval. Nothing implemented.
**Scope:** the 11 Phase 2 tables in `platform`, `identity`, `audit`.

Revisions: **Correction 1** — audit INSERT removed from `authenticated`. **Correction 2** — `platform.tenants` INSERT policy removed entirely. **Correction 3** — invitation UPDATE now guarded by `identity.invitation.revoke`.

---

## 1. Posture

Every table: `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`.

| Principle                 | Applied as                                                  |
| ------------------------- | ----------------------------------------------------------- |
| Deny by default           | No policy ⇒ no access. Policies are the entire allowlist.   |
| `anon` has zero reach     | No `USAGE` on any of the 3 schemas. No policy names `anon`. |
| No unconditional access   | `USING (true)` / `WITH CHECK (true)` appear **nowhere**.    |
| Permission, not role name | Every policy calls `has_permission()`.                      |
| Explicit role             | Every policy is `TO authenticated`. None left to `PUBLIC`.  |

### What `FORCE` does and does not do — verified on the target

```
postgres      rolbypassrls = TRUE     <- migrations run as this
service_role  rolbypassrls = TRUE     <- every server-side write path
authenticated rolbypassrls = FALSE
```

`FORCE` makes RLS apply to the **table owner**. It does **not** apply to roles with `BYPASSRLS`. So:

- `FORCE` is what stops an owner-context bug from reading across tenants. Necessary.
- `FORCE` does **nothing** against `postgres` or `service_role`.

Both consequences are load-bearing below: it is why audit needs a trigger (§5), and why the `SECURITY DEFINER` write path works at all (§3).

## 2. Matrix

`✗` = **no policy exists** = denied for `authenticated` and `anon`.
`fn` = performed only by a `SECURITY DEFINER` function, which bypasses RLS as `postgres`.

| Table                       | SELECT                                                   | INSERT                                | UPDATE                                              | DELETE                       |
| --------------------------- | -------------------------------------------------------- | ------------------------------------- | --------------------------------------------------- | ---------------------------- |
| `platform.tenants`          | member OR `platform.tenant.read`                         | **✗ `fn`** ⬅                          | `tenancy.tenant.update` OR `platform.tenant.manage` | ✗                            |
| `identity.profiles`         | self OR co-member w/ `identity.profile.read`             | self only                             | self only                                           | ✗                            |
| `identity.memberships`      | own row OR `identity.membership.read`                    | `identity.membership.create` (+ `fn`) | `identity.membership.update` (+ `fn`)               | `identity.membership.delete` |
| `identity.invitations`      | `identity.invitation.read`                               | `identity.invitation.create`          | `identity.invitation.revoke` (+ `fn`) ⬅             | ✗                            |
| `identity.roles`            | `authenticated` (catalog)                                | ✗                                     | ✗                                                   | ✗                            |
| `identity.permissions`      | `authenticated` (catalog)                                | ✗                                     | ✗                                                   | ✗                            |
| `identity.role_permissions` | `authenticated` (catalog)                                | ✗                                     | ✗                                                   | ✗                            |
| `identity.membership_roles` | `identity.membership.read`                               | `identity.role.assign` (+ `fn`)       | ✗                                                   | `identity.role.assign`       |
| `identity.platform_admins`  | `is_platform_admin()`                                    | ✗                                     | ✗                                                   | ✗                            |
| `audit.events`              | `audit.event.read` (own tenant) OR `platform.audit.read` | **✗ `fn`** ⬅                          | **✗**                                               | **✗**                        |
| `audit.security_events`     | `platform.audit.read` only                               | **✗ `fn`** ⬅                          | **✗**                                               | **✗**                        |

**Policy count: ~24** (down from ~28 — three INSERT policies removed).

## 3. Correction 1 — audit is not writable by users

**Previously:** `audit.events` INSERT was granted to `authenticated` with a `WITH CHECK` restricting `tenant_id`.

**That was a hole, and it undercut the entire point of the table.** A user could craft rows in their own tenant with an arbitrary `actor_id` (blaming another user), an arbitrary `action`, and fabricated `before`/`after`. Immutability was enforced while forgery was permitted — a log you cannot edit but can lie into is not evidence.

**Now:**

```
REVOKE ALL   ON audit.events, audit.security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON audit.events                        TO authenticated;
-- audit.security_events: no grant to authenticated at all.
-- NO INSERT policy on either table. NO UPDATE policy. NO DELETE policy.
```

Rows are written **only** by `audit.emit()`, an `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW` trigger function that is `SECURITY DEFINER` and owned by `postgres`. Because `postgres` has `BYPASSRLS` (verified above), it inserts successfully despite there being no INSERT policy. `authenticated` has neither grant nor policy, so a direct `INSERT` fails twice over.

Every field is **derived, never accepted**:

| Field              | Source                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| `actor_id`         | `auth.uid()` — from the JWT. Not a parameter.                                           |
| `actor_type`       | `'user'` when `auth.uid()` is non-null, else `'system'`                                 |
| `occurred_at`      | `now()` — database clock                                                                |
| `tenant_id`        | `NEW.tenant_id` / `OLD.tenant_id` of the affected row (`NEW.id` for `platform.tenants`) |
| `action`           | `TG_TABLE_SCHEMA \|\| '.' \|\| TG_TABLE_NAME \|\| '.' \|\| lower(TG_OP)`                |
| `resource_id`      | `NEW.id` / `OLD.id`                                                                     |
| `before` / `after` | `to_jsonb(OLD)` / `to_jsonb(NEW)`, **minus redacted columns**                           |

The trigger has no parameters a caller can influence. Fabricating a privileged actor, a system event, or another tenant's event is not a permission failure — **there is no code path that accepts those values.**

🔴 **`audit.emit()` is `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.** This is the exact defect found in the legacy project (SEC-3), where `hscs_glp.enforce_los_legal_review()` and `sync_bid_los_flags()` — both trigger functions — are callable by `anon` via `/rest/v1/rpc/`. A trigger function exposed as RPC is a trigger anyone can fire out of band. Not repeating it.

🔴 **Redaction:** `before`/`after` strip `invitations.token_hash` via `- 'token_hash'`. Even the hash is a credential verifier and must not land in a log that `tenant_admin` can read.

**`audit.security_events`** is written only by internal `SECURITY DEFINER` paths (permission denials, auth failures, platform-admin actions). No trigger on a user-writable table targets it, and `authenticated` has no grant. Readable only with `platform.audit.read`.

## 4. Correction 2 — `platform.tenants` INSERT policy removed

**Previously:** `INSERT ... WITH CHECK (has_platform_permission('platform.tenant.create'))`.

**That was incoherent.** A platform admin inserts a tenant row — and then has no membership in it, so the SELECT policy denies reading back the row they just created. Worse, nothing creates the owner membership, so a tenant could exist with no owner: unreachable and unrecoverable through the normal API.

**Now: no INSERT policy exists.** Not weakened — _removed_. Nobody inserts a tenant directly, at any privilege level, through the table.

The only path is `platform.provision_tenant()`, which checks `platform.tenant.create` itself and creates tenant + owner membership + owner role in one atomic call. Details in `phase-2-migration-set.md` §6.

## 5. Audit immutability — the trigger is the only real control

`UPDATE`/`DELETE` are `✗` on both audit tables. **RLS is not sufficient**, and the verified role attributes prove why:

| Layer                                                     | Stops `authenticated` | Stops `service_role` / `postgres` |
| --------------------------------------------------------- | :-------------------: | :-------------------------------: |
| No UPDATE/DELETE policy                                   |          ✅           |     ❌ `rolbypassrls = true`      |
| `REVOKE UPDATE, DELETE`                                   |          ✅           |                ❌                 |
| **`BEFORE UPDATE OR DELETE` trigger → `RAISE EXCEPTION`** |          ✅           |                ✅                 |

Triggers fire regardless of RLS and regardless of `BYPASSRLS`. The trigger is the control; the first two layers are defence in depth. Since every server-side write path in HL-BOS uses `service_role`, a design where only layers 1–2 existed would leave the audit log rewritable by the most privileged and most leak-prone credential in the system.

## 6. Reference policies

**`platform.tenants` SELECT:**

```sql
CREATE POLICY tenants_select ON platform.tenants
  FOR SELECT TO authenticated
  USING (
    identity.is_member(id)
    OR identity.has_platform_permission('platform.tenant.read')
  );
```

**UPDATE — `WITH CHECK` mirrors `USING`, always:**

```sql
CREATE POLICY tenants_update ON platform.tenants
  FOR UPDATE TO authenticated
  USING       (identity.has_permission(id, 'tenancy.tenant.update')
               OR identity.has_platform_permission('platform.tenant.manage'))
  WITH CHECK  (identity.has_permission(id, 'tenancy.tenant.update')
               OR identity.has_platform_permission('platform.tenant.manage'));
```

Without `WITH CHECK`, a user could edit a row into a state they can no longer read. `USING` gates the old row, `WITH CHECK` the new one. **Both are mandatory on every UPDATE and INSERT policy in this matrix.**

**`identity.memberships` SELECT — two arms, deliberately:**

```sql
CREATE POLICY memberships_select ON identity.memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()            -- always see my own, incl. while 'invited'
    OR identity.has_permission(tenant_id, 'identity.membership.read')
  );
```

The first arm lets a user discover which tenants they belong to before any permission resolves. Without it, tenant switching cannot bootstrap.

## 7. The catalog is readable to all `authenticated`

`identity.roles`, `permissions`, `role_permissions`: readable by any signed-in user, no tenant filter.

Deliberate. This is a **static vocabulary** — the string `identity.invitation.create` and the fact that `tenant_admin` holds it. It contains nothing about any customer. The UI needs it for role pickers.

Reading it grants nothing: `has_permission()` re-derives authority from `memberships` on every call and never trusts the catalog. Knowing a permission exists is not holding it. Writes are `✗` for everyone; the vocabulary changes only by migration.

## 8. Coverage assertion

```sql
-- audit.verify_rls_coverage() -- pgTAP test 14 calls this
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('platform','identity','audit')
  AND (NOT c.relrowsecurity
       OR NOT c.relforcerowsecurity
       OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
-- expect: 0 rows
```

⚠️ Note the interaction with Corrections 1–2: `audit.events` and `platform.tenants` now have **only SELECT policies**. They still satisfy "≥1 policy". The assertion checks coverage, not completeness — a table with a SELECT policy and no write policy is _intentional_ here, and the tests in §12 of the migration set are what prove writes are actually blocked.

## 9. Deliberately absent

| Not built                                      | Why                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `USING (true)` / `WITH CHECK (true)` anywhere  | The exact SEC-1/SEC-2 defect in the legacy project — 2,481 rows anon-writable. |
| Audit INSERT for `authenticated`               | Correction 1. Forgeable audit is not evidence.                                 |
| `platform.tenants` INSERT policy               | Correction 2. Provisioning is atomic or it is broken.                          |
| Blanket `is_platform_admin()` on tenant tables | Owner-approved. One compromised HLSV account must not read every tenant.       |
| Any policy naming `anon`                       | `anon` has no `USAGE` on these schemas.                                        |
| `DELETE` on `platform.tenants` / invitations   | Soft-deactivate; revoke. The trail survives.                                   |
| Session-variable current-tenant                | Caller-supplied state that policies trust = escalation.                        |
