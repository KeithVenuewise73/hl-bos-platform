# Phase 1 · Deliverable 8 (CP7) — Entitlement Plan Specification

**Date:** 2026-07-27 · **Checkpoint:** 7 · A versioned plan. **No entitlement is activated.**

## 1. Mapping

```
Accepted proposal line item → service / HL-BOS module → entitlement_key
  → subscription plan → usage limit → provisioning requirement
```

`provisioning.generate_entitlement_plan(request)` walks the selected line items, joins each module line to `discovery.module_catalog` for its `entitlement_key`, and writes one `provisioning.entitlement_plan` row per module entitlement (`t_entitlement_plan_generated`, `t_entitlement_key_mapped`).

## 2. Each entry retains

`line_item_id` (source), `module_key`, `entitlement_key`, `enabled` (**default false**), `usage_limit`, `effective_from`/`expires_at`, `trial`, `dependency_status` (`resolved` when the module has no required dependencies, else `pending`), `approval_status`, `provisioning_status` (`planned`), and `plan_version` (`entplan-0.1.0`).

## 3. Nothing is activated

The plan is a **map**, not an action. `enabled` stays `false` and `entitlements.activate_module` / `entitlements.tenant_entitlements` grants are **never called** in Checkpoint 7 (`t_entitlement_not_activated`). Actual activation happens only in the future provisioning-execution checkpoint, and only when readiness is `ready`.

## 4. Feeds readiness

The readiness engine checks that an entitlement plan exists and has no unresolved module dependency (`dependency_unresolved`), so an incomplete plan blocks factory authorization. The plan's `entitlement_key` values reference the existing `entitlements` schema — no second entitlement engine is introduced.
