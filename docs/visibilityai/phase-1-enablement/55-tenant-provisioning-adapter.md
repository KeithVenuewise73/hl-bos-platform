# Phase 1 · Deliverable 12 (CP7) — Tenant Provisioning Adapter Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · An adapter contract + an inert mock executor. **No tenant system duplicated, nothing executed.**

## 1. Reuse — the one true tenant path

`platform.provision_tenant(slug, name, owner)` is documented as "the ONLY way a tenant comes into existence" (migration 0006). The adapter **references** it and the other existing primitives (`identity.accept_invitation` for invitations, `entitlements.activate_module` for module enablement, comms sender config, storage-path init, integration setup). CP7 creates **no** second tenant, identity, entitlement, or provisioning engine.

## 2. The adapter contract

`_shared/provisioning/executor.ts` defines `ProvisioningExecutor` with `plan(req)` and `execute(req)`. The plan is an ordered list of `ProvisioningStep`s the future real executor will perform against the existing primitives:

`create_tenant` → `create_customer_org` → `invite_owner` → `invite_users` → `assign_roles` → `enable_module` → `activate_entitlement` → `assign_usage_limit` → `configure_branding` → `configure_domain` → `configure_comms_sender` → `init_storage_paths` → `setup_integration`.

## 3. The inert mock executor

`MockProvisioningExecutor.execute()`:

- **Always returns `executed: false`** — it performs no side effects whatsoever (`executor: produces an ordered plan and makes no changes`).
- Produces the ordered plan and a validation result.
- **Refuses a `production` target** and a non-`ready` request (`executor: refuses a production target and a non-ready request`).
- Emits a note stating it changed nothing.

## 4. Why this is safe to build on

A real executor implements the same contract against `platform.provision_tenant` et al., invoked only when the Software Factory authorization is `ready`, and only in a separate, explicitly CEO-authorized deployment checkpoint. Until then, pointing anything at a real environment is impossible by construction: the request lifecycle stops at `ready`, the executor is a mock, and `environment_target = production` is forbidden at the database (CHECK) and executor layers.
