# Phase 1 · Deliverable 4 — Shared AI Enablement Report

**Date:** 2026-07-26 · **Checkpoint:** 2 · **Environment:** local dev stack only
**Production restrictions honored:** no remote migration, no Edge Function deployment, no production secret, no production scheduler, no customer data, no paid provider activation.

---

## 1. Existing AI architecture (inspected, reused — not replaced)

The Phase 0 audit found a complete AI gateway; Checkpoint 2 verified it against the live schema and the local harness. **Nothing was rebuilt.**

| Layer                | Component                                                                                                                         | State                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DB catalog           | `ai.providers` (mock active, anthropic inactive), `ai.models`, `ai.prompts`, `ai.prompt_versions`                                 | Present, seeded                               |
| DB ledger            | `ai.runs` (per-call, real tenant/tokens/cost), `ai.budgets`, `ai.guardrails`                                                      | Present                                       |
| DB lifecycle         | `ai.begin_run` (perm + budget gate), `ai.finish_run` (records cost, accrues budget, emits `ai.run.completed`), `ai.within_budget` | Present, `SECURITY DEFINER`, `search_path=''` |
| Provider abstraction | `_shared/ai/provider.ts`, `mock.ts` (honest), `anthropic.ts` (real, inert)                                                        | Present                                       |
| Gateway edge fn      | `functions/ai-gateway` — auth → begin_run → provider → finish_run                                                                 | Present, **not deployed**                     |
| Event backbone       | `events.outbox`/`subscriptions`/`deliveries`, `events.emit`, `events.dispatch_batch`                                              | Present                                       |
| Dispatcher edge fn   | `functions/events-dispatcher` → `events.dispatch_batch()`                                                                         | Present, **not deployed**                     |
| Human gate           | `workflows.request_approval`/`decide`/`is_approved`                                                                               | Present                                       |

**Source-vs-deployed differences:** the DB layer is live on HL-BOS Core and fully validated by pgTAP; the two edge functions exist only as source (0 deployed — verified via `list_edge_functions`). No behavioral drift found between migration source and deployed catalog.

## 2. Changes made this checkpoint (extensions, not new systems)

To make the gateway operational and honestly testable, three small **reusable helpers** were added to the existing provider layer and wired into the existing gateway. No second gateway, bus, queue, or approval system was created.

| File                       | Purpose                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared/ai/structured.ts` | `validateStructuredOutput()` — when a caller requests JSON, the provider text must parse (and carry required keys) or the run is **failed**, never a fabricated success.                             |
| `_shared/ai/redact.ts`     | `redact()` — scrubs known secret shapes (Anthropic/Supabase/Stripe/JWT/Bearer) and explicit values from any error/log string before it leaves the process.                                           |
| `_shared/ai/retry.ts`      | `withRetry()` — bounded retry of **only** the provider call, inside the single pending run; DB idempotency (`finish_run` updates only a `pending` row) is the backstop against duplicate completion. |
| `ai-gateway/index.ts`      | Wired the three in: retry around `generate()`, optional `expectJson`/`requiredKeys` gate, `redact()` on all error responses.                                                                         |

## 3. Provider setup & Anthropic key configuration (prepared, NOT activated)

The gateway selects an adapter by `ai.providers.kind`. Today only `mock` is active. To enable Anthropic **at deploy time** (CEO-authorized), with **no key value ever in the repo**:

1. **Vault secret (the API key):** store the Anthropic key in Supabase Vault under the exact name **`anthropic_api_key`**. This matches `ai.providers.credential_ref = 'vault:anthropic_api_key'` (seeded in migration 0012). The gateway's Vault resolver reads it by name; the value never touches a table or a log.
2. **Activate the provider:** set `ai.providers.is_active = true` where `key='anthropic'` and `ai.models.is_active = true` where `key='claude-latest'` — via the protected migration path, not ad-hoc SQL.
3. **Edge function env (set at deploy via `supabase secrets set`, not `.env`):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. These are function secrets, server-side only.

| Concern                   | Answer                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact secret name         | `anthropic_api_key` (Supabase Vault)                                                                                                                       |
| Where configured          | Supabase Vault (secret) + `ai.providers`/`ai.models` activation (migration) + function env (deploy)                                                        |
| Which services consume it | `ai-gateway` edge function only, via the Vault resolver in `AnthropicProvider`                                                                             |
| How success is tested     | An authorized `ai-gateway` call returns real text with recorded tokens/cost in `ai.runs`; a bad key surfaces `anthropic_error:401` → run recorded `failed` |
| Key rotation              | Replace the Vault secret value; no code/deploy change (resolver reads by name each call)                                                                   |
| How to disable            | `update ai.providers set is_active=false where key='anthropic'` → gateway refuses that provider (`provider_inactive`); mock remains                        |
| Provider failure handling | Adapter throws `anthropic_error:<status>`; gateway records the run `failed` (never a fabricated success) and returns a redacted 502                        |

**No key is invented or embedded. Real Anthropic execution requires CEO authorization (Decision D-5).** Until then the mock provider is used and its output is explicitly labelled "NOT a real model result."

## 4. Test results (all run locally, this checkpoint)

### 4.1 Database — pgTAP (embedded PostgreSQL 17.6 + pgTAP 1.3.5)

New file `supabase/tests/19_ai_runtime_smoke.sql` — **24 assertions, all passing.** Full suite re-run: **190 passed, 0 failed** (166 pre-existing + 24 new).

Covered: authorized run · unauthorized (viewer) denial · non-member tenant-isolation denial · prompt/version/model tracking · token+cost accounting · budget accrual · provider-failure recorded as `failed` with no cost · exhausted-budget block · finish-run idempotency · `ai.run.completed` emission · dispatch fan-out to a subscription delivery · human-approval routing (request → decide → is_approved) · tenant cannot read another tenant's runs · credentials are Vault refs at rest.

### 4.2 Edge layer — Deno unit tests

New file `supabase/functions/tests/ai_runtime.test.ts` — **8 tests, all passing.**

Covered: mock determinism + honest label + zero cost · Anthropic provider-failure typed error that never leaks the key · key sent only as `x-api-key` header, never in the result · `redact()` masks known secret shapes + explicit values · structured-output validation (valid / not-JSON / missing-key) · retry succeeds-after-transient without duplicating success · retry exhaustion rethrows · non-retryable errors not retried.

> **How they were run here (honest note on the sandbox):** CI runs these via `deno test` on GitHub runners (a `functions-tests` job was added). In _this_ dev sandbox, Deno and Docker Hub egress are blocked by the environment's proxy policy (403), so the identical test files were executed under Node 22 via `tsx` with a 6-line `Deno.test` shim (Node provides native `fetch`/`Response`/`Headers`, so the adapter logic is unchanged). Result: 8 passed, 0 failed. The test files themselves are standard Deno tests and require no shim on a normal Deno install.

### 4.3 Confirmed limitation (testing our own guard)

`ai.begin_run` calls `audit.log_security_event('ai.run.budget_exceeded', …)` and then `RAISE`s. Because PostgreSQL has no autonomous transactions, the `RAISE` rolls the security-event row back — so **budget-denial events are not persisted in-database** today. This is the same documented limitation as Phase 2 denial logging (Decision D-6: log denials at the API layer). The smoke test asserts the denial _raises_ (which it does); it deliberately does **not** assert the security event persists, because it does not. Successful actions audit correctly (they commit).

## 5. Event dispatcher & background processing — operational locally

`events.dispatch_batch()` was exercised end-to-end locally: a subscriber row was registered for `ai.run.completed`, dispatch claimed the unpublished outbox rows (`FOR UPDATE SKIP LOCKED`), wrote one delivery per subscription, and marked the outbox published — at-least-once and idempotent on re-dispatch (test 19 + existing test 10). The dispatcher edge function is a thin wrapper over this and needs only deploy-time wiring (`pg_cron` → `pg_net` → the function) to run on a schedule.

## 6. Is the event architecture sufficient for website-scan jobs?

**Mostly yes — it is the right backbone, with one reusable extension needed. Do not build a second queue.**

Sufficient as-is:

- Durable, transactional job emission (`events.emit` in the producer's tx) — a scan request and its outbox event commit atomically.
- At-least-once fan-out with idempotent re-dispatch (`dispatch_batch`), and a delivery state enum (`queued/delivered/failed/dead`) that already models retry and dead-letter.
- Tenant scoping, platform-only observability RLS, and audit already in place.

Needs a small, reusable extension (Checkpoint 4, not now):

1. **A worker-invocation step.** `dispatch_batch` writes deliveries but does not yet _call_ a consumer. The dispatcher edge function must read `queued`/`failed` deliveries and invoke the handler, then mark `delivered`/`failed`/`dead` with attempt counts. This is a generic `events`-module addition (benefits every vertical), not scanner-specific.
2. **Scheduled invocation.** Install `pg_cron`/`pg_net` (available, not installed) so dispatch runs on a schedule. Deploy-time, CEO-gated (Decision D-8).
3. **A generic job-run record for long tasks.** Scans have their own lifecycle (fetching/analyzing/awaiting-external). The existing `integrations.sync_runs` pattern (begin/finish, status, stats, error) is the reuse model; the scanner will add a `visibility` scan-result/lifecycle table that references an outbox event — extending `visibility`, reusing `events`.

**Conclusion:** the outbox/dispatcher/workflow/audit stack is the correct, reusable foundation for scan jobs. The only additions are (a) the delivery→handler invocation loop in the shared `events` dispatcher and (b) scheduling — both reusable, neither a new engine. The scanner itself is Checkpoint 4.

## 7. Operational instructions (local dev)

**Run the DB tests locally (embedded PG + pgTAP, no Docker):**

```
# one-time: install embedded PG + pg client + pgTAP extension SQL
npm i @embedded-postgres/linux-x64@17.6.0-beta.15 pg @electric-sql/pglite-pgtap
#   then extract pgtap's share/extension/* into the embedded PG extension dir,
#   initdb + start on port 5433 with socket dir /tmp as a non-root user,
#   and stage migrations/shim/tests into /tmp/pgtest (see scripts/local-test/README.md)
node scripts/local-test/apply.cjs      # applies shim + 0001..0019 from scratch
node scripts/local-test/runtests.cjs   # runs supabase/tests/*.sql  -> 190 passed
```

CI runs the same SQL via `supabase test db` against the real local Supabase stack.

**Run the edge function unit tests:**

```
deno test --no-check supabase/functions/tests/     # 8 passed
```

CI runs this in the `functions-tests` job.

**Exercise the AI gateway locally (mock provider):** `supabase functions serve ai-gateway`, then POST `{ tenantId, promptKey, promptVersion, modelKey: "mock-model", prompt }` with an authenticated JWT. The mock provider returns a labelled draft and records a real `ai.runs` row with token estimates; no key required.

**Disable AI / dispatch quickly:** `update ai.providers set is_active=false;` (all providers) or stop scheduling `events.dispatch_batch`.

## 8. Requires CEO credentials or authorization

| #   | Item                                                                                       | Needed for                                                       |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | **Anthropic API key** → Vault `anthropic_api_key` + provider activation                    | Real (non-mock) AI output (D-5)                                  |
| 2   | Arm the `production` GitHub Environment + `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` | Deploying `ai-gateway`/`events-dispatcher` (Checkpoint 1 output) |
| 3   | Authorize installing `pg_cron`/`pg_net` on HL-BOS Core                                     | Scheduled dispatch/scans (D-8)                                   |

None of these were done this checkpoint. All AI execution locally used the mock provider.

## 9. Blockers remaining

- Real AI output blocked on the Anthropic key (D-5) — mock only until then.
- Scheduled/deployed runtime blocked on arming production + `pg_cron`/`pg_net` (D-8, D-9) — out of scope for local Checkpoint 2.
- Neither blocks Checkpoint 3 (storage + communications), which is next after CEO review.
