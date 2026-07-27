# Phase 1 · Deliverable 17 (CP7) — CEO Decision & Authorization Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Decisions in plain language. No engineering required to read or act on this.

## What was built (and proven)

The **commercial + operational handoff** now exists as tested software. From an approved Business Transformation Blueprint it produces: a versioned **proposal** with priced, customer-selectable line items; a **customer-selection** snapshot; **agreement** acceptance records; a **billing-setup request**; a **provisioning request**; an **entitlement plan**; an **implementation work order**; and a **Software Factory authorization package** with a deterministic go/no-go readiness check.

- Every proposal item traces back to the blueprint recommendation, the evidence, the chosen service/module, and the approved price source.
- **A price cannot be shown or accepted until it is approved** — provisional/missing prices block the proposal from going to a customer.
- **A human must approve** pricing, the customer-ready proposal, billing setup, and provisioning; **AI can price, approve, accept, and pass readiness for exactly nothing.**
- **Customer acceptance does not start provisioning.** The provisioning lifecycle stops at "ready" and the executor changes nothing.

**Proof:** 470 database tests and 79 edge tests pass, plus all repository quality gates. Real output, not "should work."

## What is deliberately switched OFF

Live billing provider and payments; entitlement activation; tenant provisioning and module enablement; customer communication and e-signatures; automatic processing. Every price is a `pending-ceo:` placeholder; every legal template is a placeholder flagged for attorney review.

## Decisions for you

These turn the placeholders into the real offering. **None blocks the engine today.**

| #   | Decision                                                                                    |
| --- | ------------------------------------------------------------------------------------------- |
| 1   | Final public **service names** and **availability**                                         |
| 2   | **Setup fees**, **monthly** + **annual** rates                                              |
| 3   | **Hosting** + **managed-service** fees                                                      |
| 4   | **Discounts**, **trial periods**, **contract minimums**                                     |
| 5   | **Payment terms** and **refund policy**                                                     |
| 6   | **Proposal-validity period**                                                                |
| 7   | **Required agreement types** + **attorney-approved templates**                              |
| 8   | **Required customer acceptance method** (click / e-sign / manual)                           |
| 9   | **Billing provider** and **tax handling**                                                   |
| 10  | **Provisioning approval authority** (who signs off)                                         |
| 11  | **Default implementation workstreams** (confirm the 19)                                     |
| 12  | Customer-facing use of **"Create Your Digital Business"**                                   |
| 13  | Approve applying migration **0024** (with 0021–0023) to the canonical project (still inert) |

**Engineering recommendation:** the two decisions that unblock real customer work are **pricing (#1–#5)** and **attorney-approved legal templates (#7)** — until both exist, no proposal can truthfully go to a customer, and the readiness engine will (correctly) block on `price_not_approved` and `agreement_unreviewed_legal`. #13 is safe now (inert, tested). Hold the live billing provider, provisioning execution, and customer communication for a controlled deployment checkpoint.

## The one thing to remember

Nothing in this engine invents a price, accepts on a customer's behalf, or provisions anything. Where a decision is yours — a price, a legal term, an approval — the software stops and waits for you. That is enforced in code and in tests.
