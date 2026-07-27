# Phase 1 · Deliverable 6 (CP5) — Website Scanner Operations Runbook

**Date:** 2026-07-27 · **Checkpoint:** 5 · How to run, verify, and (later) operate the collector. No step asks the CEO to touch a terminal.

## 1. Current operating state

| Capability                        | State in CP5                                           |
| --------------------------------- | ------------------------------------------------------ |
| DB lifecycle + evidence + scoring | ✅ Built, migrated locally, tested (315 pgTAP passing) |
| Deterministic scan core (TS)      | ✅ Built, tested offline (30 Deno assertions passing)  |
| Shared handler invocation         | ✅ Built, tested (13 assertions)                       |
| Worker edge function              | ⏳ Inert scaffolding — not deployed, no egress wired   |
| Real DNS/HTTP egress              | ⛔ Not wired (CEO-gated)                               |
| Scheduler (`pg_cron`/`pg_net`)    | ⛔ Off (CEO-gated)                                     |
| Live AI (Anthropic)               | ⛔ Off (mock only; CEO-gated)                          |
| PageSpeed performance             | ⛔ Mock interface only (CEO-gated)                     |

## 2. Run the local proof (engineer, this environment)

These are the exact commands used to produce the results in the [Test Coverage Report](26-website-test-coverage.md). The CEO does not run these — they are recorded for reproducibility and for CI, which runs the equivalent against the real Supabase stack and real Deno.

```bash
# Database suite (embedded PostgreSQL 17.6 + pgTAP 1.3.5, no Docker)
node scripts/local-test/apply.cjs        # fresh db, shim + migrations 0001..0022
node scripts/local-test/runtests.cjs     # → TOTAL: 315 passed, 0 failed

# Edge suite (Deno unit tests; offline)
deno test --no-check supabase/functions/tests/   # → 44 passed
```

Where Deno is unavailable, the identical `.test.ts` files run under Node 22 via the `tsx` `Deno.test` shim (`scripts/local-test/README.md`).

## 3. Verifying a scan (once egress is authorized — future)

A scan is healthy when, for a given `discovery.website_scans` row:

1. `status` reaches a terminal state (`completed`, `partially_completed`, or `failed`) and `completed_at` is set.
2. `findings_count` matches the number of `discovery.evidence` rows for the scan's collection with `source = 'website'`.
3. The linked collection is `collected` (or `failed`).
4. A `discovery.website_scan.completed` (or `.failed`) event is present in the outbox.
5. Every scan write appears in `audit.audit_log`; a dead-lettered delivery appears in `audit.security_events`.

## 4. Failure handling

| Symptom                                           | Meaning                                                    | Action                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Scan `failed`, error `ssrf_blocked:*`             | Target or a redirect hop pointed at a disallowed address   | Expected safety behavior — not a bug. Surface the reason to the operator. |
| Scan `partially_completed`, `aiError` set         | Deterministic findings succeeded; AI interpretation failed | Findings and scores are valid. Retry AI later; do not re-crawl.           |
| Delivery `dead` + `events.delivery.dead` audit    | Handler failed `max_attempts` times                        | Investigate the worker; the message is parked, not lost.                  |
| `unsupported_content_type` / `response_too_large` | Target served non-HTML or an oversized body                | Expected guard. Record and move on.                                       |

## 5. Console integration (CEO-facing, future)

When the collector is activated, the Development Control Center surfaces scan outcomes in plain English — "3 of 3 findings recorded, security score 4/5, awaiting your review" — never raw SQL or logs. Requesting a scan and approving an assessment are buttons with approval gates, consistent with the operating contract. No runbook step will ever require the CEO to open a terminal.

## 6. Rollback

Both migrations carry explicit `rollback:` headers (drop the handler/subscription, deactivate the collector, drop `website_scans` and the enum; drop the handler functions and delivery columns). Rollback is an engineer action against a local or approved environment — never a CEO chore.
