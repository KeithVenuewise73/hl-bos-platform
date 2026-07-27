# Phase 1 · Deliverable 5 (CP3) — Provider & Secret Configuration Guide

**Date:** 2026-07-27 · **Checkpoint:** 3

No secret value appears in the repository. Everything below is a **name** and a location. Nothing here is activated this checkpoint — all providers ship INACTIVE and require CEO authorization.

## 1. Vault secrets (Supabase Vault; referenced by name only)

| Secret name                                  | Used by                          | Referenced from                                            | Status                                 |
| -------------------------------------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `anthropic_api_key`                          | AI gateway (`AnthropicProvider`) | `ai.providers.credential_ref='vault:anthropic_api_key'`    | INACTIVE (CP2 / D-5)                   |
| `twilio_auth_token`                          | SMS (`TwilioProvider`)           | `comms.providers.credential_ref='vault:twilio_auth_token'` | INACTIVE                               |
| `email_api_key`                              | Email (`EmailProvider`)          | `comms.providers.credential_ref='vault:email_api_key'`     | INACTIVE — **provider not chosen yet** |
| `stripe_secret_key`, `stripe_webhook_secret` | Billing (prior phase)            | `billing.providers`                                        | INACTIVE                               |

All `credential_ref` columns are CHECK-constrained to the `vault:<name>` form, so a raw secret cannot be stored in a table even by mistake.

## 2. Edge-function environment (set at deploy via `supabase secrets set`, never `.env`)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — server-side only; consumed by the `ai-gateway`, `events-dispatcher`, and any future comms worker. Additionally the Twilio adapter will need `twilio_account_sid` (a non-secret account id, storable in `comms.providers.config`) alongside the Vault auth token.

## 3. Secret non-exposure guarantees

- Adapters resolve credentials only through the Vault resolver, by reference.
- Twilio/email adapters resolve then **discard** the secret and throw a typed, secret-free error while inert (verified: the fake token never appears in the thrown error — `comms_storage.test.ts`).
- `_shared/ai/redact.ts` scrubs known secret shapes (Anthropic/Supabase/Stripe/Twilio-style/JWT/Bearer) + explicit values from any error/log/response string; reused by comms.
- Provider payload snapshots store external message ids (`provider_message_ref`) only — never credentials.

## 4. CEO decisions required to activate (none taken here)

| #   | Decision                                                                 | Unlocks                                                                |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | **Choose a transactional email provider** (e.g. Resend / Postmark / SES) | Real email; sets which adapter `EmailProvider` wraps + `email_api_key` |
| 2   | Authorize a **Twilio** account + store `twilio_auth_token` in Vault      | Real SMS                                                               |
| 3   | (from CP2) store `anthropic_api_key`                                     | Real AI output                                                         |
| 4   | Arm the `production` environment + `SUPABASE_ACCESS_TOKEN`               | Any deploy of gateway/dispatcher/comms worker                          |

## 5. Activation procedure (for later, when authorized)

1. Store the secret in Supabase Vault under the exact name above.
2. Via the protected migration path, set the provider row `is_active=true` and populate non-secret `config` (e.g. Twilio SID, from-numbers).
3. Register a per-tenant `comms.sender_identities` row (verified from-address/number).
4. Smoke-test with a single transactional message to an internal, consented contact; confirm `record_delivery` marks it delivered and no secret appears in logs.
   No paid provider is used until these steps are explicitly authorized and performed.
