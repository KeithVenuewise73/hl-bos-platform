# Phase 1 · Deliverable 1 (CP7) — Proposal, Selection & Provisioning Reuse Analysis

**Date:** 2026-07-27 · **Checkpoint:** 7 · Completed **before** authoring any migration or application code.

Checkpoint 7 connects an **approved Business Transformation Blueprint** to a versioned proposal, customer selection, agreements, a billing-setup request, a provisioning request, an implementation work order, and a Software Factory authorization package — **without executing any live deployment**. It is a commercial + operational **handoff** layer over everything already built.

## 1. Existing structures — what is reused

| Need                        | Reused component (already built)                                                                                                          | How CP7 uses it                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Source of the plan          | `discovery.blueprints`, `discovery.recommendations` (CP6)                                                                                 | A proposal is generated from an **approved** blueprint; every line item traces to a recommendation                                   |
| Service catalog             | `discovery.service_catalog` (CP6)                                                                                                         | Line items + prices reference service keys; inactive services excluded                                                               |
| Module catalog              | `discovery.module_catalog` (CP6)                                                                                                          | Line items + entitlement plan reference module keys + `entitlement_key`; inactive excluded                                           |
| Roadmap / impact            | `discovery.roadmap_phases`, `roadmap_items`, `impact_estimates` (CP6)                                                                     | Work-order phases + proposal timeline/assumptions draw from these                                                                    |
| Billing                     | `billing.*` (0015/0016): providers, products, plans, plan_prices, subscriptions, invoices, `start_subscription`, `reconcile_entitlements` | The billing-setup **request** records instructions; it never calls `start_subscription`. Mock/manual provider only                   |
| Entitlements                | `entitlements.*` (0010): features, tenant_entitlements, module_activations, `activate_module`                                             | The entitlement **plan** maps line items → `entitlement_key`; it never calls `activate_module`                                       |
| Tenant provisioning         | `platform.provision_tenant(slug,name,owner)` (0006)                                                                                       | The provisioning adapter contract **references** it; the inert mock executor never calls it                                          |
| Identity + invitations      | `identity.accept_invitation`, memberships, roles                                                                                          | Owner/user invitation is part of the adapter contract (inert)                                                                        |
| Approvals                   | `workflows.request_approval` / `decide` / `is_approved`                                                                                   | Pricing, customer-ready, billing setup, provisioning, factory auth, and exceptions are workflow-gated                                |
| Events + handler invocation | `events.emit` + CP5 shared dispatcher (`handlers`/`claim_deliveries`/`complete_delivery`)                                                 | New `proposal.*`/`agreement.*`/`billing_setup.*`/`provisioning.*`/`work_order.*`/`factory_authorization.*` topics; one inert handler |
| AI                          | `ai` gateway (mock) + `_shared/ai` + discovery injection fence                                                                            | Proposal summary / narrative drafting only; never prices, approves, or accepts                                                       |
| Storage                     | `storage_meta.files`                                                                                                                      | Proposal PDF / snapshots / agreements / packages referenced (no public buckets, no PDF generated)                                    |
| Communications              | `comms.*` + `_shared/comms`                                                                                                               | Future notifications — event/interface only; nothing sent; consent still applies                                                     |
| Integrations                | `integrations.*`                                                                                                                          | Provisioning integration requirements reference connectors                                                                           |
| Audit / Identity / Tenancy  | spine (`audit.emit`, RLS+FORCE, `identity.has_permission`)                                                                                | Every new object tenant-scoped, permission-gated, audited                                                                            |
| Permissions                 | `identity.permissions` (vocab read/create/update/delete/manage)                                                                           | New `sales.*` + `provisioning.*` permission keys                                                                                     |

## 2. Existing proposal / order structures?

A repository-wide search for `proposal`, `order`, `quote`, `agreement`, `line_item`, `work_order`, and `provisioning` structures found **none** — there is no prior commercial-handoff schema anywhere. CP7 is greenfield **for these objects**, but it is built entirely on the reusable spine above.

## 3. New schemas — why, and why not an extension

The commercial + operational handoff is a distinct domain (a proposal is not a blueprint, a work order is not a recommendation). Two new schemas keep it cohesive without touching `discovery`:

- **`sales`** — proposals, line items, a versioned price model, customer selections, agreements + acceptances, billing-setup requests.
- **`provisioning`** — provisioning requests, entitlement plans, a configurable workstream catalog, work orders + tasks, and Software Factory authorization packages with a deterministic readiness engine.

Nothing here duplicates a forbidden system: billing stays in `billing`, entitlement activation stays in `entitlements`, tenant creation stays in `platform.provision_tenant`, identity stays in `identity`, the event bus stays in `events`, comms in `comms`, files in `storage_meta`, the service/module catalogs in `discovery`. `sales` and `provisioning` **reference** these; they do not re-implement them.

## 4. Hard boundaries (what stays inert)

No remote migration, no deploy, no billing-provider activation (`start_subscription` never called), no payment/card data, no `entitlements.activate_module`, no `platform.provision_tenant` call, no domains/integrations/secrets, no real agreement signatures, no customer communication. The provisioning lifecycle stops at **`ready`**; the mock executor produces a plan + validation result and changes nothing. Prices are placeholders until CEO-approved; a line item cannot be customer-approved while its price is provisional/missing/pending.
