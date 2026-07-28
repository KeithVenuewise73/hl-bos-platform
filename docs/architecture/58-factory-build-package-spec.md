# CP8 · Deliverable 14 — Factory Build Package Specification

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.factory_build_packages` · **Inert.**

The Factory Build Package is the formal artifact HLVS issues to HL-BOS. It is **distinct** from the CP7 Software Factory Authorization Package: the HLVS package defines _what technically exists and how it is composed_; the CP7 package defines _what the business/customer is commercially authorized to receive_.

## Contains (in `content` jsonb + columns)

Approved product blueprint (+ version); approved module manifest; dependency lock; source references; migration manifest; API manifest; worker manifest; UI manifest; entitlement mapping; licensing classification; configuration schema; integration requirements; environment requirements; test evidence; security evidence; deployment instructions; rollback instructions; production restrictions; conformance result (`conformance_id`); architecture approval (`architecture_approved_by`); release-candidate identifier (`release_candidate`).

## Lifecycle

`draft → validation → architecture_approved → submitted_to_hlbos → accepted_by_hlbos → rejected_by_hlbos → superseded → withdrawn` (`hlvs.package_status`).

## RPCs + readiness

- `hlvs.build_factory_package(run, conformance, content)` runs the deterministic readiness engine ([Deliverable 18](62-readiness-and-exception-policy.md)) and stores `readiness` (`ready`/`blocked`/`needs_review`) + `blocking_reasons` + a `release_candidate`. `hlvs.package.manage`.
- `hlvs.approve_factory_package(id)` refuses unless `readiness = ready` (`t_cannot_approve_blocked_package`), then sets `architecture_approved`.
- `hlvs.submit_factory_package(id)` requires `architecture_approved`, sets `submitted_to_hlbos`, creates the inert HL-BOS intake record, and emits `hlvs.factory_build_package.submitted` + `hlbos.factory_build_package.received`.

## Inert

The package **provisions, deploys, bills, messages, creates a tenant, enables a module, and activates an entitlement — none of these**. It is a description handed across the boundary. Proven throughout `27_hlvs_factory.sql` (package reaches at most `accepted_by_hlbos`; the intake reaches at most `accepted_for_controlled_deployment_review`).
