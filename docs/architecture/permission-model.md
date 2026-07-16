# Permission Model

**Status:** PROPOSED — Phase 2. Awaiting owner approval. **Nothing implemented.**
**Target:** greenfield project `ywrzgursvdowzyhipsmt` only.

---

## 1. The rule that shapes everything

> "Do not rely only on role names. Build a permission model that allows future extension." — Core v1 brief, §A

**RLS policies never test a role name.** They test a permission:

```sql
-- NO. This is the pattern we are deliberately not building.
USING (identity.has_role(tenant_id, 'tenant_admin'))

-- YES.
USING (identity.has_permission(tenant_id, 'identity.membership.invite'))
```

Roles are a _bundle_ of permissions, resolved through `identity.role_permissions`. Adding a role, or changing what a role can do, is a **row change** — not a function edit, not a migration, not a deploy.

This is the one substantive upgrade over the legacy `hscs_glp` model, which is otherwise correct. That model hard-codes eight role names into a function body:

```sql
-- hscs_glp.can_write(p_org) -- legacy, for reference
select hscs_glp.is_internal(p_org)
   and hscs_glp.has_role(p_org, 'owner_ceo','contract_admin','opportunity_analyst',
                                'proposal_manager','operations_manager',
                                'compliance_manager','finance_manager','carrier_manager');
```

Every new role there means editing and redeploying a function. Every vertical that needs a different role set means a new function. That does not scale to eleven products.

## 2. Permission naming

```
<domain>.<resource>.<action>
```

Lowercase, dot-separated, singular resource. Stored as `citext` so casing can never fork a permission into two.

Actions are a closed vocabulary — a `CHECK` constraint enforces the suffix:

| Action   | Meaning                                                                        |
| -------- | ------------------------------------------------------------------------------ |
| `read`   | See the record                                                                 |
| `create` | Bring a new one into existence                                                 |
| `update` | Modify an existing one                                                         |
| `delete` | Remove (soft-delete unless stated)                                             |
| `manage` | Administer the resource's lifecycle/config. Never implies `read` — grant both. |

**No implicit hierarchy.** `manage` does not grant `read`; `update` does not grant `read`. Implication chains are where privilege escalation hides. If a role needs both, `role_permissions` gets both rows. Verbose on purpose.

## 3. Permission vocabulary — Phase 2 only

Phase 2 declares **17 permissions**. Only what Phase 2's tables need. Declaring `billing.invoice.read` before billing exists would be vocabulary theatre and would let a role be granted something meaningless.

### Tenant-scoped (`scope = 'tenant'`) — 13

| Permission                   | Guards                                     |
| ---------------------------- | ------------------------------------------ |
| `tenancy.tenant.read`        | Read own tenant row                        |
| `tenancy.tenant.update`      | Rename, change branding/settings           |
| `tenancy.tenant.manage`      | Lifecycle: suspend, deactivate             |
| `identity.profile.read`      | Read profiles of co-members                |
| `identity.membership.read`   | See who is in the tenant                   |
| `identity.membership.create` | Direct-add a member (distinct from invite) |
| `identity.membership.update` | Change a member's status                   |
| `identity.membership.delete` | Remove a member                            |
| `identity.invitation.read`   | See pending invitations                    |
| `identity.invitation.create` | Invite someone                             |
| `identity.invitation.delete` | Revoke an invitation                       |
| `identity.role.assign`       | Grant/revoke a role on a membership        |
| `audit.event.read`           | Read the tenant's own audit log            |

### Platform-scoped (`scope = 'platform'`) — 4

| Permission               | Guards                             |
| ------------------------ | ---------------------------------- |
| `platform.tenant.create` | Create a tenant                    |
| `platform.tenant.read`   | List/read **all** tenants          |
| `platform.tenant.manage` | Suspend/deactivate any tenant      |
| `platform.audit.read`    | Read **all** tenants' audit events |

## 4. Roles

The eight roles the brief mandates. `scope` is enforced by a `CHECK`: a platform role cannot be attached to a tenant membership, and a tenant role cannot be attached to a platform grant.

| Role              | Scope    | Purpose                                              |
| ----------------- | -------- | ---------------------------------------------------- |
| `platform_owner`  | platform | HLSV ownership. Full platform authority.             |
| `platform_admin`  | platform | HLSV operations. Explicitly enumerated, not blanket. |
| `tenant_owner`    | tenant   | Customer's owner. Full authority in their tenant.    |
| `tenant_admin`    | tenant   | Customer's administrator.                            |
| `manager`         | tenant   | Manages people, not the tenant itself.               |
| `staff`           | tenant   | Day-to-day operator.                                 |
| `viewer`          | tenant   | Read-only.                                           |
| `service_account` | tenant   | Non-human integration.                               |

### Role → permission grants

`•` = granted.

| Permission                   | owner | admin | manager | staff | viewer | svc_acct |
| ---------------------------- | :---: | :---: | :-----: | :---: | :----: | :------: |
| `tenancy.tenant.read`        |   •   |   •   |    •    |   •   |   •    |    •     |
| `tenancy.tenant.update`      |   •   |   •   |         |       |        |          |
| `tenancy.tenant.manage`      |   •   |       |         |       |        |          |
| `identity.profile.read`      |   •   |   •   |    •    |   •   |   •    |          |
| `identity.membership.read`   |   •   |   •   |    •    |   •   |   •    |          |
| `identity.membership.create` |   •   |   •   |         |       |        |          |
| `identity.membership.update` |   •   |   •   |    •    |       |        |          |
| `identity.membership.delete` |   •   |   •   |         |       |        |          |
| `identity.invitation.read`   |   •   |   •   |    •    |       |        |          |
| `identity.invitation.create` |   •   |   •   |    •    |       |        |          |
| `identity.invitation.delete` |   •   |   •   |    •    |       |        |          |
| `identity.role.assign`       |   •   |   •   |         |       |        |          |
| `audit.event.read`           |   •   |   •   |         |       |        |          |

| Platform permission      | platform_owner | platform_admin |
| ------------------------ | :------------: | :------------: |
| `platform.tenant.create` |       •        |       •        |
| `platform.tenant.read`   |       •        |       •        |
| `platform.tenant.manage` |       •        |                |
| `platform.audit.read`    |       •        |       •        |

### Deliberate choices, and why

**`viewer` has zero write permissions.** Tested directly (`t_viewer_cannot_write`).

**`service_account` cannot read profiles or memberships.** An integration credential is the most likely thing to leak — it lives in someone else's config. It gets the least. It reads its tenant row and nothing else about people.

**`manager` can invite and update memberships but cannot `delete` them or `assign` roles.** Managers manage staff; they do not decide who has authority. Without this split, `manager` is `tenant_admin` with a different name.

**`tenancy.tenant.manage` is `tenant_owner` only.** Deactivating a tenant is close to irreversible. Admins should not be able to.

**`platform.tenant.manage` is `platform_owner` only.** `platform_admin` can _see_ every tenant, but cannot suspend one. Ops needs visibility, not a kill switch.

### 🔴 The platform-admin decision, stated plainly

> "Platform administrators receive only explicitly authorized access." — brief, RLS section

**`platform_admin` and `platform_owner` get NO automatic read access to tenant business data.** They can enumerate tenants and read audit metadata. They cannot read a tenant's customers, appointments, messages or AI content.

This means **support staff cannot see customer data to debug an issue.** That is a real operational cost and you should decide it deliberately rather than discover it later. The alternative — a blanket `USING (is_platform_admin())` on every table — is exactly the "overly broad policy" the brief forbids, and it means one compromised HLSV admin account reads every tenant of every product.

If support access is needed, the right shape is a **time-boxed, audited, per-tenant grant** (a `platform_support_grants` row with an expiry, every read logged). That is a Phase 6 admin-app concern. **Phase 2 deliberately does not build a backdoor now that we would have to remove later.**

## 5. How a permission check resolves

```
auth.uid()
  └─> identity.memberships       (user_id = auth.uid(), tenant_id = p_tenant, status = 'active')
        └─> identity.membership_roles
              └─> identity.role_permissions
                    └─> permission_key = p_permission   ->  TRUE
```

Additionally required at every step:

- membership `status = 'active'` — an `invited`, `suspended` or `removed` member has no permissions
- tenant `status IN ('trial','active')` — **a suspended or deactivated tenant denies everything, to every role, including `tenant_owner`**

That second condition is why `has_permission` joins `platform.tenants`. Suspension has to be real, not advisory.

## 6. The invariant that must not break

**`p_tenant` is an argument. It is never proof of access.**

Every helper filters on `auth.uid()`, taken from the JWT, which a caller cannot forge. `p_tenant` narrows a set the caller already belongs to; it never widens it. Passing another tenant's UUID returns `false`, not that tenant's data.

This is the property `t_arbitrary_tenant_id_is_not_proof` exists to prove, and it is the single most important test in Phase 2. The legacy `hscs_glp` model gets this right and we verified it line by line during the audit; Core v1 must not regress it.
