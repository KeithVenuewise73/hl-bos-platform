# CP8 · Deliverable 2 — HLVS ↔ HL-BOS Responsibility Boundary

**Date:** 2026-07-27 · **Checkpoint:** 8

The CEO has formally split the roles. This document is the authoritative boundary.

## HLVS — the technical blueprint + engineering intelligence + software catalog

HLVS decides **what** software to create and **why**, governs its creation by Claude, validates the result, and hands an approved package to HL-BOS. It determines: what to create, why, which customer/market problem it solves, which capabilities Herman Legacy owns, which must be reused, which may be extended, which genuinely new capabilities are authorized, which modules compose a product, which versions/dependencies are required, how Claude is instructed, whether Claude's work conforms to the approved blueprint, and whether the software is eligible to hand to HL-BOS. **HLVS does not operate customer production workloads.**

Owned in this checkpoint: `hlvs.*` (capabilities, modules registry, products, editions, templates, extraction candidates, duplicate determinations, product technical blueprints, software creation orders, prompt packages, development runs, checkpoint reports, build completion reports, conformance results, catalog update proposals, factory build packages, HL-BOS intake, feedback).

## HL-BOS — the production facility

HL-BOS receives approved technical packages, builds/validates shared platform components, integrates with the core, applies production gates, provisions tenants + entitlements, deploys, operates customer systems, monitors health/usage, and reports status back to HLVS. In this checkpoint only the **intake** side (records + inert acknowledgements + feedback contracts) exists; no deployment, provisioning, or operation is performed.

## Claude — a governed development agent

Claude does not independently authorize architecture, pricing, production deployment, customer entitlements, or new duplicate modules. It executes an **approved** Software Creation Order through defined checkpoints and returns structured evidence. In this checkpoint Claude is agent-neutral in the schema and **never called automatically** (`external_execution: false`).

## Three execution planes (never conflated)

| Plane                 | Who               | This checkpoint                                                                 |
| --------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Catalog definition    | HLVS              | Built + governed (approvals, versioning, audit)                                 |
| Development execution | Claude (governed) | Modeled + human-controlled; **no automatic calls**                              |
| Production execution  | HL-BOS            | Out of scope; intake is inert (max `accepted_for_controlled_deployment_review`) |

## The one artifact each side issues

- HLVS issues the **Factory Build Package** — _what technically exists and how it is composed_.
- HL-BOS (CP7) holds the **Software Factory Authorization Package** — _what the business/customer is commercially authorized to receive_.

The HL-BOS intake compares the technical package against the commercial authorization (`hlvs.hlbos_intake.commercial_authorization_id` → `provisioning.factory_authorizations`); a mismatch is refused.
