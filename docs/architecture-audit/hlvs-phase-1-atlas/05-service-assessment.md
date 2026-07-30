# 05 · Service Assessment

The service layer is the set of **edge functions** (background workers and request handlers) plus the shared libraries they run on. Verified against `supabase/functions/` and the live project's deployed-function list.

---

## 1. The single most important fact

**None of the eight edge functions is deployed.** The live project reports zero deployed edge functions. This is **by design, not neglect** — every function is written and its logic is proven by tests, but it is kept **inert** (no live keys, no scheduler) until a CEO-authorized "switch it on" checkpoint. The database-side logic each worker calls is already live and tested; the edge files are the deploy-time surface.

So the honest status of the whole service layer is: **Built and tested, not switched on.**

## 2. The functions

| Function                     | Role            | Class            | What it does                                                                                                                                     | Integrations                        |
| ---------------------------- | --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `_shared`                    | Libraries       | Infrastructure   | Provider abstractions + the outbox dispatcher pattern; no HTTP entry point                                                                       | —                                   |
| `events-dispatcher`          | Backbone        | Infra / Core     | Drains the outbox (`events.dispatch_batch`) into one delivery per active subscription; at-least-once, idempotent                                 | —                                   |
| `ai-gateway`                 | Request handler | AI / Shared      | The one authenticated door to every model: begin run → provider → cost from pricing → finish run; real tokens only, never fabricated             | Anthropic API, Supabase Vault       |
| `billing-webhook`            | Request handler | Shared           | The only path a payment is recorded (tenants can't write payments); verify + normalize provider event → `billing.record_payment`                 | Stripe (stubbed; returns 501 today) |
| `commerce-worker`            | Worker          | Shared / Product | Drafts a proposal via the sales narrative through the AI gateway; runs provisioning readiness. Activates/provisions/charges nothing autonomously | AI gateway                          |
| `discovery-website-worker`   | Worker          | BI / AI          | Runs the SSRF-safe website scan → records evidence → scores dimensions → completes scan; AI narrative optional/non-blocking                      | Anthropic (optional), egress fetch  |
| `discovery-blueprint-worker` | Worker          | BI               | Assembles a transformation blueprint deterministically, then optional AI narrative that must cite evidence (else `partially_generated`)          | AI gateway (optional)               |
| `hlvs-factory-worker`        | Worker          | Infra / Factory  | Exercises the factory lifecycle **without contacting Claude**; refuses secret-bearing prompts; always `external_execution:false`                 | None (inert by design)              |

## 3. The shared pattern — one dispatcher, many handlers

There is no bespoke plumbing per worker. Every worker is "just one more handler" on a single transactional-outbox pattern:

1. A domain function calls `events.emit(topic, tenant, payload)` — this writes to the outbox **in the same transaction** as the business change, so an event can never be lost or fabricated relative to the data.
2. `events-dispatcher` fans each outbox row out to one `events.deliveries` row per active subscription.
3. Each worker calls `events.claim_deliveries(...)` (claims work with `FOR UPDATE SKIP LOCKED`), does its job, then `events.complete_delivery(...)`. Retry, backoff, and dead-lettering are handled centrally by the handler registry (`events.handlers`).

**This is a genuine architectural asset:** it means adding a new background capability is registering a handler, not building a new queue. There is exactly one event bus in the system — a second one is explicitly prohibited.

## 4. Provider abstraction and secret handling

Every external dependency is reached through a **provider interface** with a **mock implementation** and credentials referenced **by name from the Vault**, never inlined:

- `ai/` → provider / mock / **anthropic** / redact / retry / structured-output validation
- `billing/` → provider / **stripe**
- `comms/` → provider / mock / **twilio** / email
- `discovery/` → url (SSRF guard) / extract / rubric / scan / **injection** (prompt fence)
- `blueprint/`, `bti/`, `hlvs/`, `provisioning/`, `sales/`, `storage/` → deterministic engine mirrors of the DB authority

This means the system can run end-to-end today on **mock providers** (proving the wiring) and switch to real providers by granting a key and flipping the provider row to active — no code change.

## 5. What it takes to switch the service layer on

This is the "ignition" list — all wiring, no building:

1. **Deploy** `ai-gateway` and `events-dispatcher` first (the door and the backbone).
2. **Install** `pg_cron` + `pg_net` and schedule the dispatcher (the scheduler is not yet installed).
3. **Grant** the Anthropic key into the Vault and flip the `ai.providers` row to active.
4. **Deploy the workers** (`discovery-*`, `commerce-worker`, `hlvs-factory-worker`).
5. **Implement the Stripe adapter** and deploy `billing-webhook` (currently a 501 stub) — only needed before real payments.
6. **Add a governed deploy path** so this is repeatable and auditable rather than done by hand (see report 12).

## 6. Maturity verdict

| Aspect                | Verdict                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Logic correctness     | **Strong** — mirrored deterministic engines, DB-authoritative, covered by Deno + pgTAP tests   |
| Safety posture        | **Strong** — inert by default, mock-first, secrets by reference, AI advisory-only, human gates |
| Deployment            | **Absent** — nothing deployed; no scheduler; no governed deploy job                            |
| External integrations | **Wired but dormant** — Anthropic adapter real but keyless; Stripe stubbed                     |

The service layer's problem is not quality; it is that it has never been allowed to run against reality. Turning it on is the single highest-leverage move available, and it is a set of decisions plus wiring — not new engineering.
