# CP8 · Deliverable 13 — Catalog Update Proposal Model

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.catalog_update_proposals`

A completed build must **not silently alter** the authoritative catalog. Any catalog change proposed by a build goes through a Catalog Update Proposal that requires architecture approval and preserves before/after.

## Contains (in `content` jsonb)

New capability candidates; new module candidates; module version changes; dependency changes; lifecycle changes; documentation additions; test additions; source locations; licensing recommendations; production-eligibility recommendation. The `content` carries both the **before** and **after** view so the change is auditable.

## Lifecycle + gate

`hlvs.create_catalog_update_proposal(run, content)` creates a `draft` (`hlvs.run.manage`). `hlvs.approve_catalog_update_proposal(id)` requires `hlvs.conformance.manage`, advances `draft → approved`, and emits `hlvs.catalog_update.approved`. Only after approval (or publication) may the proposed changes be applied to the authoritative catalog. Proven by `27_hlvs_factory.sql :: t_catalog_update_draft`, `t_catalog_update_approved`.

## Readiness link

A Factory Build Package is **not ready** while a catalog update proposal for its run is still unreviewed (`catalog_update_not_reviewed`) — see [Deliverable 18](62-readiness-and-exception-policy.md). This forces the catalog implications of a build to be reviewed before the package can ship.
