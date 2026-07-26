# HL-BOS Billing — the reusable subscription platform (0015–0016)

Billing is a **Factory module**, not product code: one engine, many products.
It is built on the reconciled spine and the V0 modules, reusing them rather than
duplicating anything.

## Why it belongs in HL-BOS (Rule of Three)

Every Herman Legacy SaaS product charges money the same way — a tenant subscribes
to a plan, the subscription grants product features, and payments drive the
subscription's state. That shape is identical for SalonAI, HomeHuddle, and every
Huddle/AI product that follows. Billing is the definition of a shared capability:
building it per-product would be three-plus copies of the most sensitive code in
the company. It lives here so no product implements its own subscription engine,
its own entitlement logic, or its own "is this customer paid up?" check.

## What it is not

Not an accounting system, not an ERP, not a general ledger. It records
subscriptions, invoices, and payments enough to gate product access and to
reconcile against the payment provider — nothing more.

## Schema

`0015_billing_core` — the catalog (what can be sold):

- `billing.providers` — payment providers (`stripe`/`manual`/`mock`). Credentials
  are **Vault references only** (`vault:…`); `stripe` is seeded **inactive**.
- `billing.products` — a sellable product, tagged with the consuming module.
- `billing.plans` — a recurring offering. **`plan.key` is the
  `entitlements.plan_features` plan_key** — the seam designed in 0010. A purchase
  grants those features with zero product-specific entitlement code.
- `billing.plan_prices` — money as minor units (cents; no floats), per
  provider/currency, plus the provider's external price id (an id, never a secret).

`0016_billing_subscriptions` — the lifecycle:

- `billing.subscriptions` — a tenant's commitment to a plan
  (`trialing`/`active`/`past_due`/`canceled`/`incomplete`).
- `billing.invoices` / `billing.payments` — what is owed and what was attempted.
- `billing.payment_methods` — provider **token references only** (`last4`, no PAN;
  PCI-safe).

## Two guarantees enforced structurally

1. **Anti-fabrication (Principle 10).** Invoices and payments have **no tenant
   write path**. Only the billing service (platform-admin / the webhook running as
   service role) records them. A salon owner cannot invent a paid invoice.
2. **Automatic entitlement sync.** `billing.reconcile_entitlements(tenant)`
   recomputes plan-sourced entitlements from the tenant's active/trialing
   subscriptions on every change. Idempotent and overlap-safe (a feature stays
   granted while any active subscription grants it). Subscribing grants features
   and activates the module; canceling revokes them. Products read entitlements;
   they never touch billing.

## Events

Every material action publishes via `events.emit` (0009): `billing.subscription.created`,
`billing.subscription.renewed`, `billing.subscription.canceled`, `billing.trial.started`,
`billing.payment.succeeded`, `billing.payment.failed`, `billing.payment.dunning`,
`billing.invoice.created`, `billing.invoice.paid`, `billing.feature.granted`,
`billing.feature.revoked`, `billing.payment.refunded`, `billing.refund.requested`.
Products subscribe to these instead of duplicating billing logic.

## Refunds pass the human gate

`billing.request_refund` opens a `workflows` approval instance (0013);
`billing.apply_refund` refuses to act without an **approved** instance. No
automated money-out without a person.

## Payment provider recommendation — Stripe

Recommended default: **Stripe**. Reasons: first-class recurring subscriptions and
proration, hosted checkout and a hosted customer portal (less PCI surface for us —
we store only token references and `last4`), strong webhook model that maps
cleanly onto our `record_payment`/`renew_subscription` RPCs, broad payment-method
and tax (Stripe Tax) support, and the best test-mode/sandbox story for building
without real charges. The `PaymentProvider` interface keeps this a swappable
adapter: `manual` (offline invoicing) ships active for the first customer, and a
second provider is a new adapter, not a product change.

## Provider adapters (structural, inert)

`supabase/functions/_shared/billing/{provider.ts,stripe.ts}` and
`supabase/functions/billing-webhook/index.ts` — the abstraction and the webhook
entry point. Not deployed and not runtime-tested in this change; Stripe stays
inert until its keys are provisioned in Vault. The database, not the edge
function, is the security boundary — every RPC re-checks authorization.

## Validation

Applied from empty in the isolated embedded-PG harness; the full suite is
**155/155 pgTAP assertions, 0 failures** (132 spine+V0 + 23 billing). All 8
billing tables are RLS-enabled and FORCEd; all 9 billing functions are
SECURITY DEFINER with `search_path=""`. Nothing is applied to a Supabase project
by this change.

## Deferred to V1 (named, not hidden)

Proration math, tax calculation (Stripe Tax integration), coupons/promotions,
automated dunning schedules (pg_cron ret/escalation), and live provider calls.
Each is added when a real product needs it — not speculatively.

## What HomeHuddle / SalonAI consume

Neither product has code yet (portfolio registry: both `not-started`). There is
therefore **no existing HomeHuddle billing implementation to migrate** — this is
the first billing code in the ecosystem, built shared from the start so those
products, when built, consume it rather than re-implement it. The consumption
contract is: call `billing.start_subscription` / `billing.cancel_subscription`,
read `entitlements.has_feature` / `entitlements.module_is_active`, and subscribe
to `billing.*` events. No product carries a subscription engine.
