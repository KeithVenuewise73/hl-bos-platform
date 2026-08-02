# HLVS V2 · V2-1 — Internal Tenant Provisioning Record

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **CEO-authorized production provisioning; canonical path only.**

The CEO approved creating a dedicated first-party internal tenant so Herman Legacy corporate records (Venture Studio, CEO intelligence, opportunity catalog, internal portfolio, Factory governance) are never mixed with the HSCS Government customer tenant. This records exactly what was done and how it was verified.

## Canonical method used

`platform.provision_tenant(p_slug, p_name, p_owner, p_tenant_class, p_parent_tenant_id)` — the **only** supported way a tenant comes into existence in HL-BOS (from migration `0008`, reconciled from Core). No ad-hoc row insert was used.

- Invoked as the **platform owner** (`keith@venuewise.net`, `c9827bd9…`) so `auth.uid()` resolved to him, exactly as the RPC runs from his authenticated session. The function enforced its own gates against that identity:
  - authenticated (non-null `auth.uid()`),
  - `identity.has_platform_permission('platform.tenant.create')`,
  - `identity.is_platform_admin()` (required because `first_party`).
- The tenant UUID is generated **internally** by the function — never supplied by the caller.
- Atomic: tenant + owner membership + `tenant_owner` role in one transaction (a failure would roll back all three).
- **No service-role key, no database password** was used; authorization flowed through the platform-owner identity only.

## Objects created

| Object                            | Value                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `platform.tenants` row            | name **Herman Legacy Group Internal**, slug `herman-legacy-internal`             |
| Classification                    | `tenant_class = first_party`, `parent_tenant_id = null`                          |
| Status                            | `trial` (canonical initial state — identical to HSCS Government; fully operable) |
| `created_by` / `updated_by`       | the CEO (`c9827bd9…`)                                                            |
| `identity.memberships` row        | CEO, `status = active`                                                           |
| `identity.membership_roles`       | `tenant_owner`                                                                   |
| Tenant UUID (`VSTUDIO_TENANT_ID`) | recorded privately in `V2_1_DEPLOYMENT_READINESS.md` — not printed here          |

## Default memberships & roles

The canonical function grants the owner an **active** membership and the **`tenant_owner`** tenant role. No other member was added. No additional `platform_owner` grant was made — the CEO-only Venture Studio decision gate (`vstudio.decision.create → platform_owner`) is unchanged.

## Effective Venture Studio permissions (CEO)

All five resolve `true` for the CEO via `has_platform_permission` (platform-level, not tenant-scoped):
`vstudio.opportunity.read`, `vstudio.opportunity.manage`, `vstudio.evaluation.manage`, `vstudio.recommendation.create`, `vstudio.decision.create`.

> Note: Venture Studio authorization is **platform-level** (who may act). The internal tenant is the **data-ownership** boundary (whose records these are, via `VSTUDIO_TENANT_ID`). The two are deliberately separate.

## Audit behavior

The `0004` audit triggers wrote three `audit.events` rows at provisioning time, all with **actor = the CEO**:
`platform.tenants.insert`, `identity.memberships.insert`, `identity.membership_roles.insert`. The action is fully attributable and immutable.

## Isolation verification

- HSCS Government (`0fa1e91a…`) is **unchanged** (still `first_party`, `trial`, 1 member).
- Two first-party tenants now exist, **1 member each**; no membership was removed anywhere.
- No anonymous privileges on `vstudio` (anon grants = 0); no grants changed this phase.
- Customer tenants cannot reach internal Venture Studio records: `vstudio` access is gated by platform permissions + forced RLS, and record ownership is scoped by `VSTUDIO_TENANT_ID`.

## Rollback behavior

The platform is **soft-deactivation only** — there is no tenant DELETE path for any role. To retire this tenant, a platform admin sets its `status` to `deactivated` (which sets `deactivated_at`); its data remains for audit. The tenant is inert until Venture Studio is deployed and `VSTUDIO_TENANT_ID` points at it, so no rollback is needed to keep production safe in the meantime.

## Boundary (unchanged this phase)

`vstudio` is **not** exposed to the API · Venture Studio app is **not** deployed · Coolify is **not** configured · DNS is **unchanged**. Those remain a separate, CEO-authorized deployment step.
