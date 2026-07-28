# Phase 1 · Deliverable 10 (CP6) — Blueprint Engine Operations Runbook

**Date:** 2026-07-27 · **Checkpoint:** 6 · How to run and verify the engine. No step asks the CEO to touch a terminal.

## 1. Current operating state

| Capability                                                    | State in CP6                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Blueprint DB lifecycle + versioning                           | ✅ Built, migrated locally, tested (380 pgTAP passing)  |
| Deterministic engine (rules/priority/impact/roadmap/assemble) | ✅ Built, tested offline (21 Deno assertions)           |
| Catalogs + rules seeded                                       | ✅ 25 services, 23 modules, 8 phases, 7 rules           |
| Blueprint worker edge function                                | ⏳ Inert scaffolding — not deployed, no loader/AI wired |
| Live AI narrative (Anthropic)                                 | ⛔ Mock only (CEO-gated)                                |
| Scheduler (`pg_cron`/`pg_net`)                                | ⛔ Off (CEO-gated)                                      |
| Proposal / provisioning / comms send                          | ⛔ Not built (interfaces only)                          |

## 2. Run the local proof (engineer, this environment)

```bash
# Database suite (embedded PostgreSQL 17.6 + pgTAP 1.3.5, no Docker)
node scripts/local-test/apply.cjs        # fresh db, shim + migrations 0001..0023
node scripts/local-test/runtests.cjs     # → TOTAL: 380 passed, 0 failed

# Edge suite (Deno unit tests; offline)
deno test --no-check supabase/functions/tests/   # → 65 passed
```

Where Deno is unavailable, the identical `.test.ts` files run under Node 22 via the `tsx` `Deno.test` shim (`scripts/local-test/README.md`). CI runs the real `deno test` and `supabase test db`.

## 3. Generating a blueprint (the intended flow, once wired)

1. Complete a Discovery assessment (CP4 flow: score → human review → complete).
2. `discovery.request_blueprint(assessment)` → a `draft` blueprint (event `blueprint.requested`).
3. The blueprint worker (future) claims the delivery, runs `assembleBlueprint`, and records sections/findings/recommendations/roadmap/impacts via the RPCs, then `mark_blueprint_generated`.
4. A human `submit_blueprint_for_review` → `workflows` task → `workflows.decide('approved')` → `approve_blueprint`.
5. `mark_ready_for_proposal` when the CEO/admin is satisfied.

Every step is a Control-Center button with plain-English status in the deployed product — never a SQL prompt for the CEO.

## 4. Failure handling

| Symptom                                          | Meaning                                                    | Action                                               |
| ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------- |
| Blueprint `partially_generated`, `aiError` set   | Deterministic plan succeeded; AI narrative failed/rejected | Plan is valid. Retry AI later; do not regenerate.    |
| `recommend` raises on `service_key`/`module_key` | Catalog entry is unavailable/deprecated                    | Expected exclusion — pick an available alternative.  |
| Delivery `dead` + `events.delivery.dead` audit   | Worker failed `max_attempts` times                         | Investigate worker; the message is parked, not lost. |
| `approve_blueprint` raises `42501`               | No approved workflow, or caller lacks `blueprint.manage`   | Expected — human review is required first.           |

## 5. Communications interface (future, not sent this checkpoint)

Reusing shared `comms`, future notifications are defined for: blueprint ready for internal review, changes requested, blueprint approved, blueprint ready for customer delivery, proposal ready. In Checkpoint 6 these are **event topics/interfaces only** — no email or SMS is sent, no customer is contacted.

## 6. Rollback

Migration `0023` carries an explicit `rollback:` header (drop the new tables + columns + enums, remove the worker subscription/handler). Rollback is an engineer action against a local or approved environment — never a CEO chore.
