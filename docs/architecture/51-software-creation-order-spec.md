# CP8 · Deliverable 7 — Software Creation Order Specification

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.software_creation_orders` · The authoritative development authorization.

A Software Creation Order references an **approved** Product Technical Blueprint and authorizes development. **Claude must never receive an order that is not approved.**

## Contents (jsonb sections + typed columns)

- **Business Definition** (`business_definition`): product, customer/internal sponsor, target market, problem statement, expected outcome, revenue model, strategic rationale.
- **Build Scope** (`build_scope`): `modules_reuse`, `modules_configure`, `modules_extend`, `adapters`, `new_modules_authorized`, `excluded`, `prohibited`, `required_modules`.
- **Technical Context** (`technical_context`): repository, approved branch, target Supabase project classification, schemas, packages, shared HL-BOS services, migration constraints, secret-handling rules, production restrictions.
- **Execution Plan** (`execution_plan`): checkpoint sequence + objectives, required deliverables, acceptance criteria, tests, documentation, review gates, stop conditions.
- **Governance** (`governance` + columns): CEO approval, architecture approval, `security_review_required`, data-review requirement, production-authorization status, human-approval requirements.

## Lifecycle

`draft → architecture_review → ceo_review → approved → prompt_generated → development_active → blocked → development_complete → validation_active → accepted → rejected → superseded → cancelled` (`hlvs.order_status`).

## RPCs + gates

- `hlvs.create_software_creation_order(blueprint, attrs)` — requires an **approved** blueprint (else `22023`); `hlvs.order.manage`.
- `hlvs.approve_software_creation_order(id)` — advances to `approved`, records architecture + CEO approvers, emits `hlvs.software_creation_order.approved`; `hlvs.order.manage`.

The `build_scope.required_modules` and `new_modules_authorized` here are the authority the deterministic conformance engine checks the delivered work against ([Deliverable 12](56-blueprint-conformance-model.md)). AI may **draft** an order but can approve nothing.
