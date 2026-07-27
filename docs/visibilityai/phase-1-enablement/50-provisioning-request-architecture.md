# Phase 1 · Deliverable 7 (CP7) — Provisioning Request Architecture

**Date:** 2026-07-27 · **Checkpoint:** 7 · An authorization package. **It never executes production changes.**

## 1. Model

`provisioning.requests` represents _what HL-BOS is authorized to create_ — not the creation itself. It carries: source proposal + blueprint, target tenant (nullable), customer org, `requested_modules`/`requested_services` (mapped from selected line items), subscription tier, usage limits, locations, users, roles, domains, branding, comms config, storage/integration/data-migration requirements, vertical OS, `environment_target` (**CHECK forbids `production`**), dependencies, required secrets/credentials/human-actions, implementation notes, requested launch date, `status`, `approval_status`, `execution_status` (`inert`), failure/rollback fields, and the workflow instance.

## 2. Lifecycle — stops at `ready`

`draft → validating → awaiting_approval → approved → ready` (then, in a **future** checkpoint only, `queued → in_progress → partially_completed → completed`; plus `blocked`, `failed`, `cancelled`, `rolled_back`). In Checkpoint 7 the lifecycle stops at **`ready`** and `execution_status` stays `inert` (`t_provisioning_ready_stops_here`, `t_provisioning_inert`). No tenant creation, module activation, domain/storage/provider setup, or production secret occurs.

## 3. RPC flow

1. `request_provisioning(proposal)` — requires an accepted proposal + `provisioning.request.create`; maps selected services/modules (`t_services_mapped`, `t_modules_mapped`).
2. `generate_entitlement_plan(request)` — see the [Entitlement Plan spec](51-entitlement-plan-spec.md).
3. `validate_request(request)` — deterministic; a request with no services/modules → `blocked` + `provisioning.validation_failed`; otherwise `awaiting_approval` (`t_request_validated`).
4. `submit_provisioning_for_approval` + `approve_provisioning` — **human** workflow approval required (`t_provisioning_needs_workflow`, `t_provisioning_approved`).
5. `mark_ready` — sets `ready` and emits `provisioning.ready`; the lifecycle halts here.

## 4. Tenant isolation + audit

RLS+FORCE on every table; reads gated by `provisioning.request.read`; tenant_b sees nothing (`t_tenant_isolation_request`). Every write is audited.

## 5. Execution boundary

Actual execution is delegated to the inert mock executor (see the [Tenant Provisioning Adapter report](55-tenant-provisioning-adapter.md)), which produces a plan + validation and changes nothing. Live execution is a separate, explicitly CEO-authorized deployment checkpoint.
