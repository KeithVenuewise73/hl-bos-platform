<!-- Written 2026-11-04 on branch recovery/hlbos-production-2026-11. Status: PLAN — nothing built, nothing applied. -->

# Shared services plan — HLG Communications and HLG Billing

Today three products run three incompatible copies of the same two capabilities:

| Capability   | Venuewise (`urwnbskrtoplgnkkxuvl`)                                                                                                                 | Legacy (`bkfsjhhclbqrhaolvhmz`)                        | HL-BOS Core (`mvvtngiopdrgiedjmhfb`)                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outbound SMS | `sms_outbox` + `send-sms-outbox` (Twilio REST), `super-processor` (invites), double opt-in, STOP/START via `sms-inbound` — **failing since 08-23** | `generate-alerts`, `daily-brief` (channels unverified) | `comms` schema: `providers`, `sender_identities`, `templates`, `template_versions`, `messages` (23 cols), `consent`, `suppression` — applied as `hlbos_0019_communications` (2026-07-26), **no sender function deployed, 0 rows** |
| Email        | `smart-task` via Resend (PIN reset only); client calls a `send-welcome` function that does not exist                                               | —                                                      | `comms` (same tables)                                                                                                                                                                                                             |
| Push         | `hyper-action`, `send-notifications` (VAPID)                                                                                                       | —                                                      | —                                                                                                                                                                                                                                 |
| Billing      | `subscriptions`, `family_product_entitlements`, `stripe-checkout` v9, `stripe-webhook` v7, `stripe-portal`, founder slots (shared with Apple)      | —                                                      | `billing` schema: `providers`, `products`, `plans`, `plan_prices`, `subscriptions`, `invoices`, `payments`, `payment_methods` (`hlbos_0015/0016`), `billing-webhook` function **in repo, not deployed**, 0 rows                   |

HL-BOS Core already holds the designed shared schemas; nothing uses them. Venuewise holds the only working (until August) implementation; nothing shares it.

## Principle

Build on what exists: the `comms` and `billing` schemas in HL-BOS Core are the target. Venuewise's functions are the reference implementation to port (Stripe webhook signature handling, double opt-in, STOP/START, founder-slot logic are all proven code). Nothing in Venuewise is removed until the shared service has carried real traffic for 30 days.

## HLG Communications — phases

1. **Freeze and document (this PR).** Twilio containment package; Venuewise SMS functions archived; `comms` schema documented as owner `HL-BOS platform core` in `schema-owners.md`.
2. **Sender service (Level A build, Level B deploy).** One edge function in HL-BOS Core, `comms-send`, reading `comms.messages` where `status='queued'`, honouring `comms.consent` and `comms.suppression`, with the v7 safety features (secret, breaker, stale guard, daily cap) and provider adapters: Twilio Messages, Resend email, VAPID push. Tests: adapters mocked; consent rules as pgTAP. Provider credentials live in HL-BOS Core's secrets, one set for the group.
3. **First consumer: BarberOS** (appointment confirmations/reminders) — has no messaging today, so no migration risk. Entry point: `comms.enqueue(tenant, channel, template, to, vars)` RPC callable only by `service_role`/product RPCs.
4. **Second consumer: HomeHuddle.** Replace `sms_outbox` writes with cross-project enqueue through an edge function (Venuewise → HL-BOS Core with a shared secret); keep `sms-inbound` in Venuewise but have it write consent changes to `comms.consent` too. Cut over only after step 2 has run a month for BarberOS.
5. **Retire** Venuewise `send-sms-outbox`, `super-processor`, `smart-task`'s Resend call, and the cron jobs — Level B each, with the archived copies as rollback.

Decisions needed from the CEO before step 2: provider (reactivate Twilio or replace), sender identities (one group number vs per-product), and whether email goes through Resend for the group.

## HLG Billing — phases

1. **Freeze and document.** HomeHuddle's Stripe functions archived (v9/v7 verified); `billing` schema owner recorded. Stripe connector in this workspace is `connect_incomplete` — the live Stripe account could not be inspected; **the state of real subscriptions is NOT VERIFIED** beyond the one trialing row in Venuewise.
2. **Port the webhook.** `billing-webhook` in `supabase/functions/` (HL-BOS repo, not deployed) is reconciled with Venuewise `stripe-webhook` v7 (timing-safe signature, the six event types, `charge.refunded`). Result: one webhook function writing `billing.subscriptions`/`invoices`/`payments`, keyed by `billing.providers`. Tests: replay Stripe's fixture events.
3. **Checkout and portal** as HL-BOS functions reading `billing.plan_prices` (lookup keys per product, e.g. `founding_member_monthly`, `standard_monthly` from HomeHuddle) so a new product adds rows, not code.
4. **Entitlements**: `entitlements` schema (0010) becomes the single source; HomeHuddle's `recompute_entitlement` logic is ported as the reference. This closes SEC-13 structurally (policies reference `entitlements.*`).
5. **First consumer: BarberOS** (new product, no migration). **Second: HomeHuddle** — requires a Stripe webhook endpoint change (Level B) and a one-time import of the existing subscription rows (Level C: touches customer billing — CEO decides timing).

Nothing in this plan changes a Stripe object, creates a charge or alters a subscription; those remain Level C.
