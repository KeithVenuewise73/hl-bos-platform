# Phase 1 · Deliverable 10 (CP7) — Software Factory Authorization Package

**Date:** 2026-07-27 · **Checkpoint:** 7 · Everything a future provisioning executor needs — and a gate that fails when anything is missing.

## 1. Model

`provisioning.factory_authorizations` (one per provisioning request) assembles the authorization `package` (jsonb) plus a deterministic `readiness` verdict, structured `blocking_reasons`, `risk_flags`, `rollback_requirements`, and `launch_criteria`. The package references: the approved proposal version, the accepted agreement versions, billing-setup status, selected services + modules, the entitlement plan, the work order, dependencies, required credentials/domains/integrations, customer-supplied content status, internal approvals, and risk flags.

## 2. Readiness evaluation

`provisioning.build_factory_authorization(request)` (requires `provisioning.request.manage`; `t_build_requires_manage`) computes readiness via the deterministic `provisioning.evaluate_readiness` and stores `ready` (no reasons) or `blocked` (with reasons). It emits `factory_authorization.ready` or `factory_authorization.blocked`. Readiness **fails when any required item is incomplete** — see the [Readiness and Blocking Rules report](54-readiness-and-blocking-rules.md).

## 3. Proven behavior

- A fully-satisfied package → `ready` with zero blocking reasons (`t_readiness_ready`, `t_no_blocking_reasons`).
- Unreviewed legal templates → `blocked` with `agreement_unreviewed_legal` (`t_readiness_blocked_unreviewed_legal`, `t_blocking_reasons_structured`).
- Revoking billing approval → `blocked` with `billing_setup_not_approved` (`t_missing_billing_blocks`).
- An approved, non-prohibited exception clears its reason (`t_exception_clears_reason`) and is audited (`t_exception_audited`); prohibited exceptions are rejected (`t_prohibited_exception_rejected`).

## 4. Boundary

The authorization package is the **handoff artifact**. It authorizes nothing to run this checkpoint: the provisioning request stops at `ready` and the executor is inert. A future execution checkpoint consumes a `ready` package (and only a `ready` one) to drive real provisioning.
