# CP8 · Deliverable 5 — Catalog Governance Model

**Date:** 2026-07-27 · **Checkpoint:** 8

## Lifecycle

Every capability and module supports `draft → under_review → approved → deprecated → retired` (`hlvs.lifecycle_status`). Every catalog change is versioned (`version` increments on approval) and audited (`audit.emit` on every table).

## Human approval required before

| Action                               | RPC                                    | Gate                      |
| ------------------------------------ | -------------------------------------- | ------------------------- |
| Declaring a capability reusable      | `hlvs.approve_capability`              | `hlvs.catalog.manage`     |
| Marking a module production-eligible | `hlvs.approve_module_production`       | `hlvs.catalog.manage`     |
| Publishing a product composition     | `hlvs.publish_product`                 | `hlvs.catalog.manage`     |
| Approving a duplicate determination  | `hlvs.approve_determination`           | `hlvs.catalog.manage`     |
| Approving a catalog update proposal  | `hlvs.approve_catalog_update_proposal` | `hlvs.conformance.manage` |

Changing a dependency, deprecating a module, or authorizing a new module where an existing one may solve the problem all flow through the duplicate-risk check + a catalog update proposal, which require the same human approvals.

## Deterministic duplicate-risk check

`hlvs.duplicate_check(requirement, capability?, module?, ai_recommended?)` asks _"do we already own something that solves this?"_ and returns one of:

`reuse_existing` · `configure_existing` · `extend_existing` · `create_adapter` · `create_new` · `reject_duplicate` · `requires_architecture_review`

The determination is **deterministic** (an approved matching module → `reuse_existing`; an approved reusable matching capability → `extend_existing`; a name match on an approved object → `requires_architecture_review`; otherwise `create_new`). An AI recommendation may be supplied in `ai_recommended` and is **stored but never authoritative** — proven by `27_hlvs_factory.sql :: t_ai_recommendation_not_authoritative`. A human must `approve_determination` before it governs a decision.

## Auditability + immutability

All catalog and factory records emit audit events. Approved product technical blueprints are immutable (a trigger blocks content changes; a new version is required). Catalog updates from a completed build never silently alter the authoritative catalog — they go through a Catalog Update Proposal ([Deliverable 13](57-catalog-update-proposal-model.md)) that requires architecture approval and preserves before/after.
