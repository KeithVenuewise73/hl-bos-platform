# CP8 · Deliverable 6 — Product Technical Blueprint Specification

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.product_blueprints` · Immutable once approved.

A Product Technical Blueprint is the versioned technical definition of a product. It is distinct from the CP6 **customer** transformation blueprint (`discovery.blueprints`).

## Fields (in `content` jsonb + typed columns)

Product identity, purpose, target users/industry, business problem, approved commercial model, product edition, required + optional capabilities, required + optional modules, module versions, dependencies, reused/extended modules, new-module authorizations, adapters, repository strategy, target HL-BOS services, database schemas, tenancy model, permission model, event usage, communications usage, billing + entitlement dependencies, AI provider requirements, integration requirements, storage requirements, frontend + accessibility + security + testing requirements, acceptance criteria, non-goals, prohibited duplication, deployment restrictions, success metrics, known risks, CEO decisions, architecture approvals.

Typed columns: `product_key`, `version`, `status` (`draft → architecture_review → approved → superseded`), `immutable`, `architecture_approved_by`, `ceo_approved_by`, `workflow_instance_id`.

## Lifecycle + immutability

`hlvs.create_product_blueprint(product, content)` creates a `draft` at the next version (`hlvs.blueprint.manage`). `hlvs.approve_product_blueprint(id)` sets `approved` + `immutable = true` and records the architecture + CEO approvers, emitting `hlvs.product_blueprint.approved`.

**An approved blueprint is immutable.** A trigger (`hlvs.freeze_approved_blueprint`) raises if the `content` of an immutable blueprint is changed — changes require a new version (`hlvs.create_product_blueprint` computes `max(version)+1`). Proven by `27_hlvs_factory.sql :: t_blueprint_immutable_enforced`.

## Gate on downstream work

A Software Creation Order cannot be created from a non-approved blueprint (`t_order_requires_approved_blueprint`). This guarantees Claude is only ever directed by an approved technical definition.
