# Phase 1 · Deliverable 9 (CP6) — Proposal and Provisioning Interface Report

**Date:** 2026-07-27 · **Checkpoint:** 6 · Clean interfaces for the future transition. **No proposal engine, no provisioning built.**

The Blueprint Engine stops at an approved, proposal-ready plan. The path beyond it is defined as an interface only, so Checkpoint 7 can build on it without rework.

## 1. The future transition

```
Approved Blueprint
  ↓ Proposal Preparation      (select recommendations, attach pricing — future)
  ↓ Customer Selection        (customer chooses what to buy — future)
  ↓ Agreement                 (terms accepted — future)
  ↓ Tenant Provisioning       (create/prepare the tenant — future)
  ↓ Module Enablement         (grant entitlements, provision modules — future)
  ↓ Create the Digital Business
```

None of these steps runs in Checkpoint 6.

## 2. What the Blueprint already exposes for the handoff

The recommendation `state` vocabulary carries the proposal-preparation flags a future proposal engine will consume:

- `included_in_proposal` / `excluded_from_proposal`
- `deferred`
- `customer_selected`
- `awaiting_pricing`
- `awaiting_technical_review`

A blueprint reaches `ready_for_proposal` only after human approval. Recommendations carry `service_key`/`module_key` (into the catalogs), `pricing_ref` (a placeholder pending CEO pricing), effort/cost bands, dependencies, and evidence — everything a proposal needs except final prices and customer selections.

## 3. Explicit boundaries honoured

- **No proposal engine.** Only the flags + the `ready_for_proposal` state exist.
- **No provisioning.** Module `entitlement_key`s are recorded but never granted; `provisioning_readiness` is informational.
- **No billing activation, no created prices.** `pricing_ref` values are `pending-ceo:` placeholders.
- **No customer communication.** Communication interfaces are defined as events/topics only (see the Operations Runbook), never sent.

## 4. Why this is safe to build on

The proposal/provisioning layer will reuse the same spine: `billing`/`entitlements` for pricing and grants, `workflows` for agreement approval, `platform.tenants` + provisioning RPCs for tenant setup, `events` for orchestration. No new parallel systems are anticipated — the interface points above are additive.
