# HL-BTI — Proposal Integration (Deliverable 6)

HL-BTI **does not build a proposal engine** — it integrates the existing one (`sales`, migration 0024). This satisfies the PCO's "do NOT duplicate the Proposal Engine."

## 1. The link

`bti.engagements.proposal_id` references `sales.proposals(id)`. When an engagement reaches the `proposal` stage (full-transformation only), the existing sales flow runs and the resulting proposal is linked to the engagement.

## 2. The reused flow (0024, unchanged)

`sales.request_proposal(blueprint)` → `sales.add_line_item` → `sales.request_pricing_review` / `sales.approve_price` → `sales.submit_proposal_internal_review` → `sales.approve_proposal_internal` → `sales.mark_ready_for_customer` → `sales.record_customer_view` → `sales.submit_customer_selection` → `sales.accept_agreement` → `sales.customer_accept`. Billing setup is the existing `sales.request_billing_setup` / `approve_billing_setup` (no billing activated here).

## 3. Proposal contents (PCO) — already supported by `sales`

Executive Summary · Scope of Work · Pricing · Implementation Timeline · Deliverables · Monthly Services · Software Recommendations · Recurring Subscription Options. Line items (`sales.proposal_line_items`) carry one-time and recurring types; agreements (`sales.agreements`) carry terms; customer selection and acceptance are the existing governed steps.

## 4. Blueprint → proposal traceability

The proposal is requested **from the approved blueprint** (`sales.request_proposal(p_blueprint)`), and the blueprint is built from the executive assessment. The chain **assessment → blueprint → proposal** is fully traceable through existing FKs, with HL-BTI's engagement row tying them to one business and lifecycle.

## 5. Analysis-only businesses never reach here

An `analysis_only` engagement (e.g. Venuewise) is deterministically capped at `blueprint` by `bti.advance_stage` and can never enter the `proposal` stage — so no proposal, pricing, or billing is ever generated for an analysis-only business. Enforced in code (`t_analysis_cap_blocks_proposal`), not just documented.
