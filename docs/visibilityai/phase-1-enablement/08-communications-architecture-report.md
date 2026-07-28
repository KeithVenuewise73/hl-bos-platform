# Phase 1 · Deliverable 2 (CP3) — Shared Communications Architecture Report

**Date:** 2026-07-27 · **Checkpoint:** 3 · **Migration:** `hlbos_0019_communications` (local only)

One reusable outbound-communications platform (`comms`) for every vertical: email + SMS today, more channels via provider adapters later. No real message is sent this checkpoint — mock providers only.

## 1. Schema & tables (`comms`)

| Table                             | Purpose                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `providers`                       | email/SMS providers; Vault credential refs; mock active, twilio/email INACTIVE             |
| `templates` / `template_versions` | versioned templates with declared `variables[]`                                            |
| `sender_identities`               | per-tenant from-address / from-number                                                      |
| `consent`                         | per (tenant, channel, contact) consent status + source + timestamps                        |
| `suppression`                     | opt-out / bounce / complaint / manual (STOP-style)                                         |
| `messages`                        | outbound ledger: status, class, provider ref, attempts, idempotency_key, approval instance |

## 2. RPCs (all `SECURITY DEFINER`, `search_path=''`)

- `render_template(template, version, vars)` → `{subject, body}`; **raises on any missing `{{variable}}`** (no blank sends).
- `set_consent(...)`, `suppress(...)`, `has_consent(...)` — consent/opt-out management + gate (`comms.consent.manage`).
- `request_message(...)` — the front door: gates `comms.message.create`; **suppression wins**; **marketing requires consent** (transactional does not); renders; picks an active provider; is **idempotent** on `(tenant, idempotency_key)`; emits `communication.requested`; optionally routes through the human-approval workflow.
- `approve_message(message)` — transitions a gated message to `approved` only after `workflows.is_approved`; emits `communication.approved`.
- `record_delivery(message, status, ref, failure)` — **platform/service-only** (anti-fabrication): records sent/delivered/failed, increments `attempts` on failure, emits `communication.sent|delivered|failed`.

## 3. Consent & compliance (modeled from the start)

Channel consent, consent source + timestamp, opt-out/suppression with reason, transactional vs marketing classification, per-tenant sender identity, STOP-style suppression (`suppress(..., 'opt_out')`), and audit history. **No marketing communication is sent without valid consent** (enforced in `request_message`, verified in test 21). Suppression always wins, even for transactional.

## 4. Provider abstraction

Adapters implement one `CommsProvider` interface (`_shared/comms/provider.ts`): `MockCommsProvider` (local, sends nothing, honest ref), `TwilioProvider` (SMS, inert until `vault:twilio_auth_token`), `EmailProvider` (inert until a provider is chosen + `vault:email_api_key`). Credentials resolved from Vault by reference; never read from a table, never logged (redaction reused from `_shared/ai/redact.ts`).

## 5. Human approval

A message requested with `p_require_approval => true` is created `pending` and opens a `workflows` instance (kind `comms.message.create`). A permission-holder decides via `workflows.decide`; `approve_message` then flips it to `approved`. VisibilityAI may **prepare** proposal/consultation/onboarding messages, but external sends wait for approval until a message class is explicitly approved for automation.

## 6. Events & worker consumption

Emits `communication.requested | approved | sent | delivered | failed | suppressed` to `events.outbox`. **How a provider worker consumes deliveries:** the existing `events.dispatch_batch()` writes one `events.deliveries` row per active subscription but **does not yet invoke a handler** (confirmed in Checkpoint 2). The reusable extension — a dispatcher step that reads `queued`/`failed` deliveries, invokes the consumer, and marks `delivered`/`failed`/`dead` with attempt counts — is documented in the Checkpoint 2 report and belongs in the shared `events` dispatcher, **not** a comms-specific worker. Once that lands, a comms worker selects the provider adapter by `comms.providers.kind` and calls `record_delivery`. No new queue is introduced.

## 7. Reuse across verticals

Appointment reminders (SalonAI), review requests, proposal/assessment delivery (VisibilityAI), onboarding, AI-receptionist follow-up, internal alerts, CEO notifications, HomeHuddle and fleet/transport notifications — all through the same tables + `request_message`, differing only by `source_module`, template, and tenant config.

## 8. Tests

`supabase/tests/21_communications.sql` — **31 pgTAP assertions**; `supabase/functions/tests/comms_storage.test.ts` — adapter units. All passing.
