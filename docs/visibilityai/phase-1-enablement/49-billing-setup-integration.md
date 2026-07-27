# Phase 1 · Deliverable 6 (CP7) — Billing Setup Integration Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Reuses `billing.*`. **No provider activation, no payment data.**

## 1. Model

`sales.billing_setup_requests` is a structured **instruction record**, not a billing action: proposal, currency, computed `one_time_cents` + `recurring_cents` (summed from the selected line items' sellable prices), billing interval, trial + discount terms, start-date instructions, payment preference (`invoice`/`auto`), billing contact, a `tax_placeholder` jsonb (empty — future integration), **mock** `provider_customer_ref` + `subscription_ref`, `approval_status` (`draft`→`pending_approval`→`approved`→`rejected`→`activated`), and `activation_status` (stays `inactive`).

## 2. Reuse — no second billing system

The existing `billing.*` schema (providers, products, plans, plan_prices, subscriptions, invoices, `start_subscription`, `reconcile_entitlements`) is the billing platform. The setup request records what a future activation would tell it to do. **`billing.start_subscription` is never called this checkpoint**, no Stripe/other provider is activated, and no card or bank information is stored — the provider references are literal `mock_cus_…` / `mock_sub_…` strings (`t_mock_provider_ref_only`, `t_no_payment_credentials_stored`, `t_billing_not_activated`).

## 3. Executable-only-when guards

`sales.request_billing_setup` refuses unless:

- the proposal is `customer_accepted` (`t_billing_requires_accepted`),
- all required agreements are accepted and selections finalized,
- every selected customer-visible line has a sellable (approved, non-provisional) price.

The request starts `draft` and requires a **human** internal approval via `sales.approve_billing_setup` (`sales.proposal.manage`) before it is `approved` (`t_billing_needs_approval`, `t_billing_approved`). Approval emits `billing_setup.approved`; it does **not** activate anything.

## 4. Readiness link

The factory readiness engine treats billing setup as a hard gate: `billing_setup_not_approved` blocks authorization until the request is approved (`t_missing_billing_blocks`). Provider selection, tax handling, and payment terms are **CEO decisions** ([CEO Decision Report](60-checkpoint7-ceo-decision-report.md)).
