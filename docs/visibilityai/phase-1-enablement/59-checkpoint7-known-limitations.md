# Phase 1 · Deliverable 16 (CP7) — Known Limitations Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · What the handoff engine does not yet do, stated before anyone asks.

## 1. Hard gates (nothing live)

| Limitation                              | Consequence                                                               |
| --------------------------------------- | ------------------------------------------------------------------------- |
| No live billing provider                | `billing.start_subscription` is never called; provider refs are `mock_…`. |
| No payment data                         | No card/bank details are stored anywhere; tax is an empty placeholder.    |
| No entitlement activation               | The entitlement plan is a map; `activate_module` is never called.         |
| No tenant provisioning                  | `platform.provision_tenant` is never called; the executor is inert.       |
| Provisioning stops at `ready`           | No tenant/module/domain/storage/integration/secret is created.            |
| No customer communication / e-signature | Comms + acceptance are interfaces only; nothing is sent or signed.        |
| Commerce worker inert                   | `proposal.requested` deliveries are not processed automatically.          |
| No created prices                       | All prices are placeholders until CEO-approved.                           |

## 2. Legal + commercial content is provisional

- **Agreement templates are placeholders**, explicitly flagged for attorney review; no legal sufficiency is claimed and no legal language is generated beyond labels.
- **Service names, pricing, availability, discounts, trials, minimums, payment terms, refund policy, proposal-validity period, required agreement types, billing provider, and tax handling are CEO decisions** ([CEO Decision Report](60-checkpoint7-ceo-decision-report.md)). The engine runs on clearly-marked placeholders.

## 3. Model maturity (first versions)

- **Readiness `readiness-0.1.0`** — 19 rules; the DB authority and the TS mirror are kept in lockstep by convention (documented), not by a shared implementation. A future refactor could generate one from the other.
- **Work-order mapping** — service/module → workstream mapping is a first heuristic; it covers the seeded catalog and falls back to `launch`.
- **Impact / commercial terms** — usage-based pricing is referenced (`usage_pricing_ref`) but not computed.

## 4. Test-environment divergence

The Deno suite ran under the Node/`tsx` shim (Deno egress proxy-blocked here); CI runs real `deno test`. The DB session runs as superuser locally, unlike production's `authenticator`; the suite compensates by exercising RLS + permission denials directly (unauthorized proposal, manage-only acceptance/approval, tenant isolation, AI-can't-approve).

## 5. What is NOT a limitation

The full commercial + operational contract is complete and tested: versioned proposals + structured line items, a versioned price model with an approval gate, customer selection snapshots, agreement acceptance, a billing-setup request, a provisioning request + entitlement plan + work order, and a deterministic Software Factory readiness engine with audited, bounded exceptions. Human approval gates hold throughout; AI can neither price, approve, accept, nor mark readiness. The gap is purely the **live activation + execution** layer, intentionally gated.
