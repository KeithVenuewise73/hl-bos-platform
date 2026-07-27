# Phase 1 · Deliverable 3 (CP7) — Pricing and Commercial Terms Architecture

**Date:** 2026-07-27 · **Checkpoint:** 7 · Versioned pricing linked to the catalogs. **No invented final prices.**

## 1. Model

`sales.prices` is the versioned price model, each row linked to a `service_key` and/or `module_key` (CP6 catalogs). It supports the full pricing vocabulary via `price_kind`: `setup_fee`, `monthly`, `annual`, `per_location`, `per_user`, `per_message`, `per_appointment`, `per_vehicle`, `per_assessment`, `usage_tier`, `base_platform`, `module_addon`, `managed_service`, `hosting`, `support_tier`, `custom_implementation`, `discount`, `promo`, `trial`, `minimum_commitment`, `override`, `customer_specific`.

Each price retains: `currency` (`USD` default, `^[A-Z]{3}$`), `amount_cents` (**NULL = provisional/not yet priced**), `recurring_interval`, `visibility` (`public`/`internal`/`provisional`/`customer_specific`), `approval_status` (`pending`/`approved`/`rejected`), `approved_by` + `approved_at`, `price_version`, `effective_from`/`effective_to`, `source`, `tenant_id` (for customer-specific), and `notes`.

## 2. Sellability gate

`sales.price_is_sellable(price)` is the single source of truth: a price is sellable only when it is `approved`, has a concrete `amount_cents`, is not `provisional`, and is not expired. A line item cannot make a proposal customer-ready, cannot be accepted, and cannot generate a billing-setup request unless every relevant price is sellable. Proven by `t_unapproved_price_not_sellable`, `t_approved_price_sellable`, `t_provisional_price_blocks_ready`.

## 3. Approval is a human decision (never AI)

`sales.set_price` creates a price (default `pending`/`provisional`); `sales.approve_price` requires `sales.pricing.manage` (or platform admin) and refuses to approve a price with no amount (`t_provisional_price_not_approvable`). Discounts and customer-specific overrides are ordinary price rows that must be approved before use (`t_discount_requires_approval`). No AI path can set or change a price.

## 4. No invented prices

Nothing in the migration seeds a final price. The CP6 service catalog carries `pending-ceo:<key>` reference placeholders. Any amount used in a local test is a clearly-marked placeholder created by the test itself, never shipped. Setup fees, monthly/annual rates, hosting/managed-service fees, discounts, trials, minimums, and payment terms are all **CEO decisions** ([CEO Decision Report](60-checkpoint7-ceo-decision-report.md)).

## 5. Future commercial-terms fields

`amount_cents`/`recurring_interval`/`discount`/`credit`/tax placeholders exist on line items and billing-setup requests as integer cents + jsonb placeholders. Tax is a **future integration field** (`tax_placeholder` jsonb, empty) — no tax is computed or collected this checkpoint.
