# Phase 1 · Deliverable 13 (CP7) — Events, Workflows, and Approval Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Reuses the existing bus, dispatcher, and approval engine. No new queue.

## 1. Events (on the existing `events` bus)

`proposal.requested`, `proposal.created`, `proposal.pricing_review_requested`, `proposal.internally_approved`, `proposal.ready_for_customer`, `proposal.customer_viewed`, `proposal.customer_changes_requested`, `proposal.customer_accepted`, `proposal.customer_declined`, `agreement.accepted`, `billing_setup.requested`, `billing_setup.approved`, `provisioning.requested`, `provisioning.validation_failed`, `provisioning.approved`, `provisioning.ready`, `work_order.created`, `factory_authorization.ready`, `factory_authorization.blocked`.

All emitted via `events.emit`; delivery to the inert `commerce-worker` uses the **CP5 shared dispatcher** (`events.handlers` + `claim_deliveries`/`complete_delivery` with retry/backoff/dead-letter). No second event bus or worker framework was created (`t_worker_subscription`, `t_worker_handler`).

## 2. Human approvals (reused `workflows`)

Required human approvals, each a `workflows` instance decided via `workflows.decide`:

| Gate                      | RPC                                                  | Requires                                          |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Final pricing             | `sales.approve_price`                                | `sales.pricing.manage`                            |
| Customer-ready proposal   | `sales.approve_proposal_internal`                    | `sales.proposal.manage` + approved workflow       |
| Discount / price override | `sales.approve_price` (on the discount/override row) | `sales.pricing.manage`                            |
| Legal agreement version   | attorney review (`attorney_review_status`)           | platform + attorney (out of band)                 |
| Billing setup             | `sales.approve_billing_setup`                        | `sales.proposal.manage`                           |
| Provisioning request      | `provisioning.approve_provisioning`                  | `provisioning.request.manage` + approved workflow |
| Factory authorization     | `provisioning.build_factory_authorization`           | `provisioning.request.manage`                     |
| Readiness exception       | `provisioning.grant_readiness_exception`             | `provisioning.request.manage` + reason + audit    |

**AI can satisfy none of these** — it holds no manage/pricing permission and cannot decide a workflow task. Proven by `t_internal_approve_needs_workflow`, `t_provisioning_needs_workflow`, `t_agreement_requires_manage`.

## 3. Controlled exceptions only

Exceptions to a blocking readiness rule are the only sanctioned bypass, and they are bounded: reason + approver + scope + expiration + audit event, and **never** for missing customer acceptance or missing legal authorization. No control is silently bypassed.

## 4. Communications (interfaces only)

Future notifications reuse shared `comms`: proposal ready, proposal reminder, changes requested, proposal accepted, agreement ready, onboarding information required, provisioning blocked, implementation scheduled, launch ready. In Checkpoint 7 these are **event topics/interfaces only** — nothing is sent, and consent/suppression rules from CP3 still apply when they eventually are.
