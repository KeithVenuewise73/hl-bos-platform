# Phase 1 · Deliverable 19 (CP7) — Checkpoint 7 Completion Summary

**Date:** 2026-07-27 · **Checkpoint:** 7 — Proposal, Customer Selection & Provisioning Request · Local development stack only.

## What was created

A reusable commercial + operational **handoff engine** from an approved Business Transformation Blueprint: a versioned proposal with structured, priced, customer-selectable line items; a versioned price model; customer-selection snapshots; agreement acceptance records; a billing-setup request; a provisioning request; a versioned entitlement plan; an implementation work order; and a Software Factory authorization package with a deterministic readiness engine and audited, bounded exceptions.

## What existing architecture was reused

CP6 blueprint/recommendations/service_catalog/module_catalog/roadmap_phases; `billing.*` (never activated); `entitlements.*` (never activated); `platform.provision_tenant` + `identity` invitations (never called); `workflows` approvals; the `events` bus + the CP5 shared dispatcher; `ai` gateway (mock) + `_shared/ai` + the discovery injection fence; `storage_meta`/`comms`/`integrations` by reference; the audit/identity/tenancy/permissions spine. **No second billing, entitlement, approval, identity, tenant, event, comms, file, provisioning, service-catalog, or module-catalog system was created.**

## What migrations were authored

- `20260727090100_hlbos_0024_commerce_provisioning.sql` — new `sales` + `provisioning` schemas; `sales.prices/proposals/proposal_line_items/customer_selections/agreements/agreement_acceptances/billing_setup_requests`; `provisioning.workstream_catalog/requests/entitlement_plan/work_orders/work_order_tasks/factory_authorizations/readiness_exceptions`; the full lifecycle + pricing + selection + agreement + billing-setup + provisioning + work-order + readiness RPCs; RLS+FORCE, audit + updated_at triggers, permissions; the inert `commerce_worker` on the shared dispatcher.

## What catalogs / rules were extended or seeded

19-workstream configurable catalog; 5 placeholder agreement templates (flagged for attorney review). No prices seeded (placeholders only). Reuses the CP6 service/module/phase catalogs unchanged.

## Exact test totals (real runs)

| Suite                                         | Result                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| pgTAP database suite                          | **470 passed, 0 failed** (CP7 added 90 in `26_commerce_provisioning.sql`) |
| Deno edge suite                               | **79 passed, 0 failed** (CP7 added 14 in `commerce_provisioning.test.ts`) |
| vitest                                        | **45 passed**                                                             |
| eslint / tsc / prettier `--check .`           | clean                                                                     |
| check-migrations / no-public-secrets / ts-pin | OK (24 migrations, no public secrets, TS 6.0.3)                           |

## What is deterministic

Proposal/line-item/pricing lifecycle, sellability gate, customer-selection snapshots, agreement acceptance, billing-setup computation, provisioning request + entitlement plan + work-order generation, and the **readiness engine** (DB authority `provisioning.evaluate_readiness` + the TS mirror `_shared/provisioning/readiness.ts`).

## What uses AI

Only the optional proposal **narrative** (`_shared/sales/narrative.ts`) via the mock gateway — fenced, structured-validated, non-blocking; it rejects any price or guaranteed-outcome text and drops non-selected service keys. AI never prices, approves, accepts, activates, provisions, or passes readiness.

## What remains mocked / inert / requires decisions

- **Mocked:** AI (mock gateway), billing provider references (`mock_…`), provisioning executor.
- **Inert:** commerce worker (not deployed), provisioning lifecycle (stops at `ready`), entitlement plan (not activated).
- **CEO pricing decisions:** service names/availability, setup/monthly/annual/hosting/managed fees, discounts, trials, minimums, payment terms, refund policy, proposal validity.
- **Legal review:** all agreement templates are placeholders flagged for attorney review; required acceptance method is a CEO decision.
- **Billing-provider setup:** provider choice + tax handling are CEO decisions; no provider is activated.
- **Production approval:** applying migration 0024 (with 0021–0023) to the canonical project; any future live billing, provisioning execution, or customer communication.

## Known limitations

First-version readiness/work-order mapping; placeholder legal + pricing; live activation + execution gated. See the [Known Limitations report](59-checkpoint7-known-limitations.md).

## Readiness for a controlled deployment checkpoint

The platform now produces a `ready` Software Factory authorization package — everything a provisioning executor needs — while executing nothing. It is ready for a **controlled deployment checkpoint** once two CEO inputs land: **approved pricing** and **attorney-approved legal templates** (without them the readiness engine correctly blocks). Live billing, provisioning execution, and customer communication remain for that separate, explicitly authorized checkpoint. **Stopping here for CEO review before any controlled deployment or live customer onboarding.**
