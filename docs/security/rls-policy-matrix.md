# RLS Policy Matrix — Phase 2

**Status:** PROPOSED. Nothing implemented.
**Scope:** the 11 tables introduced by Phase 2 in `platform`, `identity`, `audit`.

---

## 1. Posture

Every table: `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`.

`FORCE` matters. Without it, the **table owner bypasses RLS**. Migrations run as the owner, so an owner-context bug — or anything that later runs in that context — would silently read across tenants. `FORCE` closes that.

| Principle                 | Applied as                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Deny by default           | No policy ⇒ no access. Policies are the entire allowlist.                                               |
| `anon` has zero reach     | No `USAGE` on any of the 3 schemas; no policy names `anon`.                                             |
| No unconditional access   | `USING (true)` appears **nowhere**. This is the exact defect (SEC-1/SEC-2) found in the legacy project. |
| Permission, not role name | Every policy calls `has_permission()`. No policy string-matches a role.                                 |
| `TO authenticated`        | Every policy names the role explicitly; none is left to `PUBLIC`.                                       |

## 2. Matrix

`✗` = **no policy exists** = denied for everyone (except `service_role`, which bypasses RLS).

| Table                       | SELECT                                                   | INSERT                       | UPDATE                                              | DELETE                       |
| --------------------------- | -------------------------------------------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------- |
| `platform.tenants`          | member OR `platform.tenant.read`                         | `platform.tenant.create`     | `tenancy.tenant.update` OR `platform.tenant.manage` | ✗                            |
| `identity.profiles`         | self OR co-member w/ `identity.profile.read`             | self only                    | self only                                           | ✗                            |
| `identity.memberships`      | own row OR `identity.membership.read`                    | `identity.membership.create` | `identity.membership.update`                        | `identity.membership.delete` |
| `identity.invitations`      | `identity.invitation.read`                               | `identity.invitation.create` | `identity.invitation.delete`¹                       | ✗                            |
| `identity.roles`            | `authenticated` (catalog)                                | ✗                            | ✗                                                   | ✗                            |
| `identity.permissions`      | `authenticated` (catalog)                                | ✗                            | ✗                                                   | ✗                            |
| `identity.role_permissions` | `authenticated` (catalog)                                | ✗                            | ✗                                                   | ✗                            |
| `identity.membership_roles` | `identity.membership.read`                               | `identity.role.assign`       | ✗                                                   | `identity.role.assign`       |
| `identity.platform_admins`  | `is_platform_admin()`                                    | ✗                            | ✗                                                   | ✗                            |
| `audit.events`              | `audit.event.read` (own tenant) OR `platform.audit.read` | `authenticated`²             | **✗**                                               | **✗**                        |
| `audit.security_events`     | `platform.audit.read` only                               | `authenticated`²             | **✗**                                               | **✗**                        |

¹ Revocation is `status → 'revoked'`, an UPDATE. Invitations are never hard-deleted — the audit trail of who invited whom survives.
² Append via trigger in the row's own tenant. See §5.

## 3. Reference policies

**`platform.tenants` SELECT** — the shape every tenant-scoped policy follows:

```sql
CREATE POLICY tenants_select ON platform.tenants
  FOR SELECT TO authenticated
  USING (
    identity.is_member(id)                          -- my own tenant
    OR identity.has_platform_permission('platform.tenant.read')
  );
```

**`platform.tenants` UPDATE** — note `WITH CHECK` mirrors `USING`:

```sql
CREATE POLICY tenants_update ON platform.tenants
  FOR UPDATE TO authenticated
  USING (
    identity.has_permission(id, 'tenancy.tenant.update')
    OR identity.has_platform_permission('platform.tenant.manage')
  )
  WITH CHECK (
    identity.has_permission(id, 'tenancy.tenant.update')
    OR identity.has_platform_permission('platform.tenant.manage')
  );
```

Without `WITH CHECK`, a user with `tenancy.tenant.update` could edit a row into a state they could no longer read. `USING` gates the old row; `WITH CHECK` gates the new one. **Both are required on every UPDATE and INSERT policy in this matrix.**

**`identity.memberships` SELECT** — deliberately two-armed:

```sql
CREATE POLICY memberships_select ON identity.memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()                                    -- always see my own
    OR identity.has_permission(tenant_id, 'identity.membership.read')
  );
```

The first arm exists so a user can always discover which tenants they belong to — including while `invited`, before any permission resolves. Without it, tenant-switching cannot bootstrap.

## 4. The role/permission catalog is world-readable to `authenticated`

`identity.roles`, `permissions` and `role_permissions` are readable by any signed-in user, with **no tenant filter**.

Deliberate. This is a **static vocabulary**, not tenant data: the string `identity.membership.invite` and the fact that `tenant_admin` holds it. It contains nothing about any customer. The UI needs it to render role pickers.

Reading the catalog grants nothing — `has_permission()` re-derives authority from `memberships` on every call, never from the catalog. Knowing a permission exists is not holding it.

Writes are `✗` for everyone: the vocabulary changes only by migration.

## 5. Audit: the append-only argument

`UPDATE` and `DELETE` are `✗` on both audit tables — but **RLS policies alone are not sufficient**, and this is the important part.

`service_role` **bypasses RLS entirely.** Every server-side write path in the platform uses it. So the RLS `✗` protects audit from `authenticated`, and does nothing against the most privileged and most likely-to-be-compromised credential in the system.

Three layers, only the third of which stops `service_role`:

| Layer                                                     | Stops `authenticated` |        Stops `service_role`        |
| --------------------------------------------------------- | :-------------------: | :--------------------------------: |
| No UPDATE/DELETE policy                                   |          ✅           |         ❌ (bypasses RLS)          |
| `REVOKE UPDATE, DELETE`                                   |          ✅           | ❌ (typically owner/superuser-ish) |
| **`BEFORE UPDATE OR DELETE` trigger → `RAISE EXCEPTION`** |          ✅           |                 ✅                 |

The trigger is the actual control. The threat model lists _audit tampering_; a tamper-proof log that the service key can rewrite is not tamper-proof.

INSERT is permitted to `authenticated` so audit triggers on tenant tables can emit events in the caller's context, with a `WITH CHECK` restricting `tenant_id` to a tenant the caller belongs to. A caller cannot forge events into another tenant's log.

## 6. Coverage assertion

`0004` ships `audit.verify_rls_coverage()`, and pgTAP test 14 calls it:

```sql
-- fails if any table in platform/identity/audit lacks RLS or has zero policies
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('platform','identity','audit')
  AND (NOT c.relrowsecurity
       OR NOT c.relforcerowsecurity
       OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
-- expect: 0 rows
```

A new table without a policy fails the build. That is the guarantee that Core v1 cannot drift into the legacy project's state.

## 7. What is deliberately absent

| Not built                                      | Why                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `USING (true)` anywhere                        | The exact SEC-1/SEC-2 defect in the legacy project. 2,481 rows anon-writable.                                            |
| Blanket `is_platform_admin()` on tenant tables | Brief: platform admins get _only explicitly authorized_ access. One compromised HLSV account must not read every tenant. |
| Any policy naming `anon`                       | `anon` has no `USAGE` on these schemas at all.                                                                           |
| `DELETE` on `platform.tenants`                 | Soft-deactivation only.                                                                                                  |
| `UPDATE`/`DELETE` on audit                     | Append-only.                                                                                                             |
| Session-variable current-tenant                | Caller-supplied state that policies trust = privilege escalation. See `phase-2-migration-set.md` §9.                     |
