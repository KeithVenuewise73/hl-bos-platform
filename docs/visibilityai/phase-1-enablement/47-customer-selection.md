# Phase 1 · Deliverable 4 (CP7) — Customer Selection Architecture

**Date:** 2026-07-27 · **Checkpoint:** 7 · A versioned snapshot of exactly what the customer chose.

## 1. Model

`sales.customer_selections` records a customer's choices against a **specific proposal version**: `accepted_whole`, a `selections` jsonb array (`[{line_item_id, decision: selected|declined|deferred, phase, interval, tier, notes}]`), the confirmed contacts (`primary_contact`, `billing_contact`, `implementation_contact`, `authorized_signer`), the acknowledgements (`dependencies`, `responsibilities`, `assumptions`), `business_info_confirmed`, a `finalized` flag, and a `snapshot` of the exact proposal version reviewed.

## 2. Capabilities

- Accept the entire proposal, or select/decline/defer individual optional items.
- Choose an implementation phase, subscription interval, and service tier per item.
- Confirm business information and the four contacts, including the authorized signer.
- Acknowledge dependencies, customer responsibilities, and assumptions.
- Add free-text notes.

## 3. Guarantees

- **Tied to the version reviewed.** `proposal_version` is stamped from the live proposal at submission (`t_selection_tied_to_version`); the `snapshot` preserves what the customer actually saw.
- **A superseded proposal cannot be selected against.** `submit_customer_selection` refuses a `superseded`/`expired`/`cancelled`/`archived` proposal (`t_superseded_cannot_be_selected`), so selections never mutate an old version.
- **Required items cannot be silently removed.** Selections operate on optional items; a required (non-optional) line item stays in the proposal regardless of the selection payload — declining is only meaningful for `is_optional` lines.
- **Finalization gates acceptance.** A non-finalized selection sets `customer_selection_status = in_progress`; `customer_accept` refuses until it is `finalized` (`t_accept_requires_finalized_selection`). The final snapshot is preserved (`t_selection_finalized`).
- **Contact authorization checked.** Recording a selection requires `sales.proposal.create` for the tenant; acceptance and agreement acceptance require `sales.proposal.manage`.

## 4. Boundary

This models the customer's choices for internal review; it is **not** a customer-facing UI and sends nothing. No real customer selection is collected during local testing.
