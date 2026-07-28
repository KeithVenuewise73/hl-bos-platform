# Phase 1 · Deliverable 5 (CP5) — Shared Dispatcher Handler-Invocation Report

**Date:** 2026-07-27 · **Checkpoint:** 5 · A reusable platform capability, not a scanner-specific queue.

## 1. The gap this closes

Since Checkpoint 2 the event bus has been half-wired. `events.dispatch_batch()` atomically drains the transactional outbox and writes **one `events.deliveries` row per active subscription** — durable, at-least-once fan-out. But nothing **invoked** the consumer for a delivery. The [CP2 architecture note](05-shared-ai-enablement-report.md) recorded this as a deliberate V0 boundary. Checkpoint 5 needs a worker to actually process scan events, so it delivers the missing half — as a **shared** mechanism every module can use, not a bespoke scanner queue.

## 2. What was added (migration `0021`)

Extends the existing `events` schema — no second bus:

- **`events.deliveries`** gains `claimed_at`, `claim_token`, `next_attempt_at` (default `now()`), `correlation_id` (default a generated UUID), plus a partial index on due, unclaimed rows.
- **`events.handlers`** — one row per subscription: `handler_ref` (a logical worker name), `is_active`, and the retry policy `max_attempts` / `backoff_seconds` / `timeout_seconds`. RLS + FORCE; selectable by holders of `events.event.read`.
- **`events.register_handler(subscription, handler_ref, …)`** — deploy-time configuration. Authorization is the `EXECUTE` grant (`service_role` + `postgres` only), exactly like `dispatch_batch`; it is not a client RPC.
- **`events.claim_deliveries(handler_ref, limit)`** — returns due, unclaimed deliveries for a handler and marks them claimed under `FOR UPDATE SKIP LOCKED`, so many workers run concurrently without double-processing.
- **`events.complete_delivery(delivery, success, error)`** — success → `delivered`; failure → increment `attempts`, and either reschedule (`failed`, `next_attempt_at = now() + backoff × attempts`) or, once `attempts >= max_attempts`, **dead-letter** (`dead`) and log `events.delivery.dead` to `audit.security_events`.

## 3. Delivery semantics

- **At-least-once.** A delivery is claimed, then completed. If a worker crashes after claiming but before completing, the claim is not permanent — the retry path reschedules via `next_attempt_at`, and the consuming handler's own idempotency prevents duplicate side effects.
- **Idempotent consumers required.** The mechanism guarantees delivery, not exactly-once execution. Each handler (the scan worker included) must tolerate re-delivery. The scan worker does: `request_website_scan` is idempotent per in-flight target, and `record_evidence`/`score_dimension` are additive against a specific scan/assessment.
- **Backoff & dead-letter.** Linear backoff (`backoff_seconds × attempt`); after `max_attempts` the delivery is dead-lettered and audited, so a poison message cannot spin forever.
- **No enum change.** Adding an enum value cannot run inside a migration transaction, so "claimed" is represented by `claimed_at`/`claim_token` while `status` stays in the existing `{queued, failed, delivered, dead}` set.

## 4. Why it is reusable, not scanner-specific

Nothing in `0021` mentions websites or discovery. Any module registers a handler for its subscription and consumes the same claim/complete API. The comms worker and any future consumer use it unchanged. The scan worker is simply the **first** consumer, wired in `0022`:

```
subscription 'discovery_website_worker'  → topic 'discovery.website_scan.requested'
handler      'discovery-website-worker'  → max_attempts 3, backoff 60s, timeout 120s
```

## 5. Invocation is inert in Checkpoint 5

The claim/complete functions exist and are tested, but **nothing calls them on a schedule**. Scheduled invocation (`pg_cron` → `pg_net` → worker edge function) is CEO-gated and remains off. The `discovery-website-worker` edge function is structural scaffolding: it claims deliveries but wires no egress, so it processes nothing. Turning on the scheduler is a distinct, explicitly authorized deployment step.

## 6. Test coverage (`23_events_handlers.sql`, 13 assertions, passing)

Register handler; emit → dispatch → delivery exists; claim one; claim again returns zero (idempotent claim); correlation id present; complete-success → `delivered`; failure → `failed` with rescheduled `next_attempt_at`; exhausted attempts → `dead`; dead-letter recorded in `audit.security_events`. All green in the full suite (315 passed, 0 failed).
