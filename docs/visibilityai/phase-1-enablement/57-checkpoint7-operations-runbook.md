# Phase 1 · Deliverable 14 (CP7) — Operations Runbook

**Date:** 2026-07-27 · **Checkpoint:** 7 · How to run and verify the handoff. No step asks the CEO to touch a terminal.

## 1. Current operating state

| Capability                                                          | State in CP7                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Proposal / pricing / selection / agreement DB                       | ✅ Built, migrated locally, tested (470 pgTAP passing)     |
| Provisioning request / entitlement plan / work order / factory auth | ✅ Built, tested                                           |
| Deterministic readiness + mock executor (TS)                        | ✅ Built, tested offline (14 Deno assertions)              |
| Catalogs seeded                                                     | ✅ 19 workstreams; 5 placeholder agreement templates       |
| Commerce worker edge function                                       | ⏳ Inert scaffolding — not deployed, no AI/narrative wired |
| Live billing provider / payments                                    | ⛔ Not activated; mock references only                     |
| Provisioning execution / tenant creation                            | ⛔ Inert; lifecycle stops at `ready`                       |
| Customer communication / e-signature                                | ⛔ Interfaces only; nothing sent/collected                 |

## 2. Run the local proof (engineer, this environment)

```bash
# Database suite (embedded PostgreSQL 17.6 + pgTAP 1.3.5, no Docker)
node scripts/local-test/apply.cjs        # fresh db, shim + migrations 0001..0024
node scripts/local-test/runtests.cjs     # → TOTAL: 470 passed, 0 failed

# Edge suite (Deno unit tests; offline)
deno test --no-check supabase/functions/tests/   # → 79 passed
```

Where Deno is unavailable, the identical `.test.ts` files run under Node 22 via the `tsx` `Deno.test` shim. CI runs the real `deno test` + `supabase test db`.

## 3. The intended flow (once wired; every step a Control-Center button)

1. Approved blueprint → `sales.request_proposal`.
2. Add line items → set + approve prices → `request_pricing_review`.
3. `submit_proposal_internal_review` → human decides → `approve_proposal_internal` → `mark_ready_for_customer`.
4. `record_customer_view` → `submit_customer_selection` (finalize) → `accept_agreement` (each required) → `customer_accept`.
5. `request_billing_setup` → `approve_billing_setup`.
6. `request_provisioning` → `generate_entitlement_plan` → `validate_request` → `submit_provisioning_for_approval` → human decides → `approve_provisioning` → `mark_ready`.
7. `generate_work_order` → `build_factory_authorization` → **ready** (or blocked with reasons).

The CEO sees plain-English status and one decision at a time — never SQL.

## 4. Failure handling

| Symptom                                              | Meaning                                         | Action                                                                      |
| ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `mark_ready_for_customer` raises (provisional price) | A customer-visible line has an unapproved price | Approve the price or hide the line                                          |
| `customer_accept` raises                             | Agreements not complete or selection not final  | Complete agreements / finalize selection                                    |
| `factory_authorization` = `blocked`                  | One or more readiness rules fail                | Read `blocking_reasons`; fix or (rarely) grant a bounded, audited exception |
| `provisioning.validation_failed` event               | Request has no services/modules                 | Add selected items and re-validate                                          |
| Delivery `dead` + `events.delivery.dead` audit       | Worker exceeded `max_attempts`                  | Investigate; the message is parked                                          |

## 5. Rollback

Migration `0024` carries a `rollback:` header (drop the `provisioning` + `sales` schemas, remove the worker subscription/handler). Rollback is an engineer action against a local or approved environment — never a CEO chore.
