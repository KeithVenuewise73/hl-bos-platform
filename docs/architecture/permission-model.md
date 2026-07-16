# Permission Model

**Status:** REVISED per owner review 2026-07-15. Awaiting approval. **Nothing implemented.**
**Target:** greenfield project `ywrzgursvdowzyhipsmt` only.

Revision: Correction 3 applied — `identity.invitation.delete` removed, `identity.invitation.revoke` added. See §7 for a flagged issue with `identity.invitation.accept`.

---

## 1. The rule that shapes everything

> "Do not rely only on role names. Build a permission model that allows future extension." — brief, §A

RLS policies never test a role name. They test a permission:

```sql
-- NO.
USING (identity.has_role(tenant_id, 'tenant_admin'))
-- YES.
USING (identity.has_permission(tenant_id, 'identity.invitation.create'))
```

Roles bundle permissions via `identity.role_permissions`. Adding a role is a **row**, not a function edit.

The legacy `hscs_glp.can_write()` hard-codes eight role names in its body; every new role is a redeploy. That does not scale to eleven products.

## 2. Naming

```
<domain>.<resource>.<action>
```

`citext`, so casing cannot fork one permission into two. Actions are a **closed vocabulary**, enforced by CHECK:

| Action   | Meaning                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| `read`   | See the record                                                                              |
| `create` | Bring a new one into existence                                                              |
| `update` | Modify an existing one                                                                      |
| `delete` | Remove                                                                                      |
| `revoke` | Withdraw something previously issued (≠ delete: the record survives, its validity does not) |
| `assign` | Grant/withdraw authority to a principal                                                     |
| `manage` | Administer lifecycle/config                                                                 |

**No implicit hierarchy.** `manage` does not imply `read`. `update` does not imply `read`. Implication chains are where privilege escalation hides. Verbose on purpose.

### Why `revoke` and not `delete` (Correction 3)

`identity.invitation.delete` was wrong twice over. It guarded an **UPDATE** (revocation sets `status='revoked'`), and it implied invitations are destroyed. They are not — the record of who invited whom, and who withdrew it, is exactly what an audit trail is for. Hard-deleting an invitation erases evidence.

## 3. Vocabulary — Phase 2 only: 17 permissions

Only what Phase 2's tables need. `billing.invoice.read` before billing exists would be vocabulary theatre and would let a role hold something meaningless.

### Tenant-scoped — 13

| Permission                       | Guards                                             |
| -------------------------------- | -------------------------------------------------- |
| `tenancy.tenant.read`            | Read own tenant row                                |
| `tenancy.tenant.update`          | Rename, branding, settings                         |
| `tenancy.tenant.manage`          | Lifecycle: suspend, deactivate                     |
| `identity.profile.read`          | Read co-members' profiles                          |
| `identity.membership.read`       | See who is in the tenant                           |
| `identity.membership.create`     | Direct-add a member                                |
| `identity.membership.update`     | Change a member's status                           |
| `identity.membership.delete`     | Remove a member                                    |
| `identity.invitation.read`       | See pending invitations                            |
| `identity.invitation.create`     | Invite someone                                     |
| **`identity.invitation.revoke`** | Withdraw a pending invitation ⬅ replaces `.delete` |
| `identity.role.assign`           | Grant/withdraw a role on a membership              |
| `audit.event.read`               | Read the tenant's own audit log                    |

### Platform-scoped — 4

| Permission               | Guards                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `platform.tenant.create` | **Checked by `platform.provision_tenant()`, not by any policy.** See §6. |
| `platform.tenant.read`   | List/read all tenants                                                    |
| `platform.tenant.manage` | Suspend/deactivate any tenant                                            |
| `platform.audit.read`    | Read all tenants' audit + security events                                |

## 4. Roles

| Role              | Scope    | Purpose                                     |
| ----------------- | -------- | ------------------------------------------- |
| `platform_owner`  | platform | HLSV ownership                              |
| `platform_admin`  | platform | HLSV operations — enumerated, never blanket |
| `tenant_owner`    | tenant   | Customer's owner                            |
| `tenant_admin`    | tenant   | Customer's administrator                    |
| `manager`         | tenant   | Manages people, not the tenant              |
| `staff`           | tenant   | Day-to-day operator                         |
| `viewer`          | tenant   | Read-only                                   |
| `service_account` | tenant   | Non-human integration                       |

### Grant matrix

| Permission                   | owner | admin | manager | staff | viewer | svc |
| ---------------------------- | :---: | :---: | :-----: | :---: | :----: | :-: |
| `tenancy.tenant.read`        |   •   |   •   |    •    |   •   |   •    |  •  |
| `tenancy.tenant.update`      |   •   |   •   |         |       |        |     |
| `tenancy.tenant.manage`      |   •   |       |         |       |        |     |
| `identity.profile.read`      |   •   |   •   |    •    |   •   |   •    |     |
| `identity.membership.read`   |   •   |   •   |    •    |   •   |   •    |     |
| `identity.membership.create` |   •   |   •   |         |       |        |     |
| `identity.membership.update` |   •   |   •   |    •    |       |        |     |
| `identity.membership.delete` |   •   |   •   |         |       |        |     |
| `identity.invitation.read`   |   •   |   •   |    •    |       |        |     |
| `identity.invitation.create` |   •   |   •   |    •    |       |        |     |
| `identity.invitation.revoke` |   •   |   •   |    •    |       |        |     |
| `identity.role.assign`       |   •   |   •   |         |       |        |     |
| `audit.event.read`           |   •   |   •   |         |       |        |     |

| Platform permission      | platform_owner | platform_admin |
| ------------------------ | :------------: | :------------: |
| `platform.tenant.create` |       •        |       •        |
| `platform.tenant.read`   |       •        |       •        |
| `platform.tenant.manage` |       •        |                |
| `platform.audit.read`    |       •        |       •        |

**45 `role_permissions` rows.**

### Deliberate choices

- **`viewer` has zero writes.** Tested.
- **`service_account` reads only its tenant row.** An integration credential lives in someone else's config; it is the most likely thing to leak, so it gets the least. No profiles, no memberships.
- **`manager` can invite and revoke, but cannot `delete` memberships or `assign` roles.** Managers manage staff; they do not decide who holds authority. Without that split, `manager` is `tenant_admin` renamed.
- **`tenancy.tenant.manage` is owner-only.** Deactivation is near-irreversible.
- **`platform.tenant.manage` is `platform_owner` only.** `platform_admin` sees every tenant but cannot suspend one. Ops needs visibility, not a kill switch.

## 5. Platform admin — approved, restated

Approved by owner: **no blanket access, no bypass on tenant tables.** No policy in Phase 2 names `is_platform_admin()` against tenant business data.

Accepted cost: **support staff cannot read customer data to debug.** Future support access will be time-limited, tenant-specific and audited — outside Phase 2, and explicitly not stubbed now.

## 6. Permissions checked by functions, not policies

Two permissions are **not** enforced by any RLS policy:

| Permission               | Enforced in                                                |
| ------------------------ | ---------------------------------------------------------- |
| `platform.tenant.create` | `platform.provision_tenant()`                              |
| —                        | `identity.accept_invitation()` is token-authorized, see §7 |

`platform.tenants` has **no INSERT policy at all** (Correction 2: the policy is not weakened to solve bootstrap — it is removed). Nobody inserts a tenant directly. The only path is `provision_tenant()`, which checks `platform.tenant.create` itself and creates tenant + owner membership + owner role atomically.

## 7. 🔴 Flagged: `identity.invitation.accept` cannot be a permission

The review requires four invitation permissions: `read`, `create`, `revoke`, `accept`. **I have implemented three and am flagging the fourth rather than shipping it broken.**

`has_permission(p_tenant, 'identity.invitation.accept')` resolves through `identity.memberships` filtered on `status='active'`. **The invitee has no active membership — that is the entire point of an invitation.** So the check is `false` by construction, for every invitee, always.

That leaves two options, both bad:

1. **Grant it to roles anyway.** It never evaluates true for anyone who needs it. Dead vocabulary that looks like a control and enforces nothing — worse than absent, because a reviewer sees `accept` in the matrix and assumes acceptance is gated.
2. **Make `has_permission` accept non-active memberships.** This weakens the single check every policy on every table in the platform depends on, to serve one function. A suspended or removed member would begin resolving permissions. **Categorically unacceptable.**

**Acceptance is authorized by the token, not by a permission.** The invitee proves identity by (a) being authenticated, and (b) presenting a secret only the invitation email received. `identity.accept_invitation(p_token)` verifies token hash, email match, expiry, pending status and tenant status — a stronger check than a permission bit, because it proves possession of a secret rather than membership in a set.

**Requesting a ruling.** My recommendation: 13 tenant permissions as listed; acceptance stays token-authorized. If you want `accept` in the vocabulary for completeness, I will add it as a documented no-op with a comment saying it is never checked — but I would rather not, because dead controls are how real controls get ignored.

## 8. Resolution path

```
auth.uid()
  └─> identity.memberships        (user_id = auth.uid(), tenant_id = p_tenant, status='active')
        └─> platform.tenants      (status IN ('trial','active'))
              └─> identity.membership_roles
                    └─> identity.role_permissions  ->  TRUE
```

A suspended or deactivated tenant denies everything, to every role, **including `tenant_owner`.** Suspension has to be real, not advisory.

## 9. The invariant

**`p_tenant` is an argument. It is never proof of access.**

Every helper filters on `auth.uid()` from the JWT, which the caller cannot forge. `p_tenant` narrows a set the caller already belongs to; it never widens it. `provision_tenant()` takes **no tenant id at all** — it generates one internally, so there is nothing to supply.

Proven by `t_arbitrary_tenant_id_is_not_proof`, the most important test in Phase 2.
