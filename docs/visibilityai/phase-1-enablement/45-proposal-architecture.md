# Phase 1 · Deliverable 2 (CP7) — Proposal Architecture Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Local development stack only.

A proposal turns an **approved** Business Transformation Blueprint into a versioned, structured commercial document with priced, customer-selectable line items — traceable end-to-end.

## 1. Model

`sales.proposals` (header) + `sales.proposal_line_items` (structured items). The header carries tenant, source blueprint + blueprint version, proposal version, status, currency (`USD` default), valid-through, prepared/reviewed by, customer/prospect + contacts (jsonb), executive summary, a `content` jsonb for the softer sections (objectives, assumptions, customer/HL responsibilities, dependencies, risks, timeline, payment terms), the internal-approval / customer-selection / agreement statuses, the workflow instance, and a `superseded_by` pointer.

Line items are **structured, not narrative**: each carries the source `recommendation_id`, `service_key`/`module_key`, description, quantity/unit, `price_id` + one-time/recurring/setup/discount/credit amounts, estimated effort/duration, dependencies, optional/selected/customer-visible flags, price source + version + `pricing_approval_status`, availability status, and human-review flag.

## 2. Traceability

Every line item links to its Blueprint recommendation → which links to evidence + rule (CP6), and to the selected service/module in the CP6 catalogs. A proposal thus traces: proposal → line item → recommendation → evidence → rule, and → service/module → price. Proven by `26_commerce_provisioning.sql :: t_line_traces_recommendation`, `t_line_traces_service`, `t_line_traces_module`, `t_proposal_traces_blueprint`.

## 3. Requires an approved blueprint

`sales.request_proposal(blueprint)` refuses a blueprint that is not `approved`/`ready_for_proposal` (proven by `t_proposal_requires_approved_blueprint`). Creation is permission-gated (`sales.proposal.create`; `t_proposal_denied_viewer`).

## 4. Versioning — a reviewed/viewed version is preserved

`request_proposal` and `new_proposal_version` compute the next version per blueprint. `new_proposal_version` creates a fresh `draft` at version+1 and marks the prior one `superseded` (with `superseded_by`); the prior proposal, its line items, selections, and acceptances remain intact. A superseded proposal cannot be selected against (`t_superseded_cannot_be_selected`). The `proposals_version_unique (blueprint_id, version)` constraint prevents collisions.

## 5. Inactive catalog entries excluded

`add_line_item` refuses a service/module whose catalog `availability` is `unavailable`/`deprecated` (`t_inactive_service_excluded`, `t_inactive_module_excluded`).

## 6. Lifecycle (summary)

`draft → pricing_review → internal_review → (changes_requested) → approved_for_customer → ready_for_customer → customer_reviewing → (customer_changes_requested) → customer_accepted → billing_setup_pending → provisioning_pending → converted`; plus `customer_declined`, `expired`, `superseded`, `cancelled`, `archived`. Full detail + the human-approval gates are in the [Events, Workflows & Approval report](56-events-workflows-approval.md). **AI never approves; customer acceptance never auto-provisions** (`t_accept_does_not_provision`).
