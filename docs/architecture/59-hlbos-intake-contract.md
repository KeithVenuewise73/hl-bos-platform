# CP8 · Deliverable 15 — HL-BOS Intake Contract

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.hlbos_intake` + `hlvs.hlbos_feedback` · **Inert; no production deployment.**

The HL-BOS intake side receives a Factory Build Package reference and reviews it. The furthest permitted status is **`accepted_for_controlled_deployment_review`** — no production deployment execution exists.

## Intake capabilities

Receive a package reference (`hlvs.submit_factory_package` creates the intake `received`); validate schema + version; confirm referenced modules exist + production eligibility + conformance evidence; detect missing dependencies; **compare the technical package against the CP7 commercial authorization** (`commercial_authorization_id` → `provisioning.factory_authorizations`); accept for production review; reject with structured reasons; request revision.

## Review RPC

`hlvs.hlbos_intake_review(intake, accept, commercial_auth?, reasons?)` (`hlvs.intake.manage`):

- **Accept:** refuses an unready package; if a commercial authorization is referenced it must exist **and** be `ready`, else `commercial authorization mismatch` (`t_commercial_authorization_mismatch`). On success → intake `accepted_for_controlled_deployment_review`, package `accepted_by_hlbos`, emits `hlbos.factory_build_package.accepted` + `hlbos.production_review.ready`.
- **Reject:** records structured `rejection_reasons`, sets package `rejected_by_hlbos`, emits `hlbos.factory_build_package.rejected` + `hlbos.production_review.blocked`.

Proven by `t_intake_accepted`, `t_package_accepted`, `t_intake_rejected`, `t_package_rejected`.

## Feedback

`hlvs.record_hlbos_feedback(package, type, detail)` records the return-communication contract ([Deliverable 16](60-factory-interface-event-catalog.md) §feedback) as **inert** records (`external_execution = false`, `t_feedback_inert`). Runtime metrics (production version active, health, usage, incidents, deprecation) are **for future use** and are **not fabricated** — only the record + event contracts exist.

## Boundary

No production deployment execution is created. Intake never provisions, deploys, bills, messages, or creates a tenant.
