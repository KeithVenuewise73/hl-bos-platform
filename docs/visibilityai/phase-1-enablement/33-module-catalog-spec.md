# Phase 1 · Deliverable 4 (CP6) — HL-BOS Module Catalog Specification

**Date:** 2026-07-27 · **Checkpoint:** 6 · Provisionable capabilities represented as data. **No provisioning performed.**

`discovery.module_catalog` is the single, reusable catalog of HL-BOS modules the Blueprint Engine can recommend and that a **future** provisioning workflow could enable. This checkpoint neither activates entitlements nor provisions anything.

## 1. Schema

| Column                   | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `key`                    | Module identifier                                             |
| `display_name`           | Display name                                                  |
| `description`            | What the module does                                          |
| `capability_category`    | Category (identity, communications, marketing, …)             |
| `required_dependencies`  | Other module keys required                                    |
| `eligible_verticals`     | Verticals this suits                                          |
| `provisioning_readiness` | `ready` \| `in_development` \| `planned` \| `unavailable`     |
| `availability`           | `available` \| `coming_soon` \| `unavailable` \| `deprecated` |
| `entitlement_key`        | Links to `entitlements` (NOT activated here)                  |
| `implementation_effort`  | `xs`…`xl`                                                     |
| `requires_human_review`  | Whether a human must review before enablement                 |
| `version`                | Catalog version                                               |

## 2. Availability gates recommendations

`discovery.recommend` refuses to attach a module whose `availability` is `unavailable`/`deprecated` (proven by `t_inactive_module_excluded`). `provisioning_readiness` is informational for the roadmap — it does not itself trigger provisioning (there is none this checkpoint).

## 3. Seeded modules (23 rows)

identity, crm, communications, storage, scheduling, billing, payments, reviews, reputation_recovery, ai_receptionist, lead_capture, lead_recovery, analytics, dashboards, workflow_automation, website, seo, local_visibility, content_management, customer_portal, staff_portal, document_management, vertical_os.

`identity` and `storage` are `ready`/`available` (they exist in the platform today); the rest are `planned`/`in_development` with `coming_soon` availability, reflecting honest current state.

## 4. Boundary

Each module names an `entitlement_key`, but **no entitlement is granted and no module is provisioned** in Checkpoint 6. The transition from an approved blueprint to actual module enablement is defined as an interface only — see the [Proposal and Provisioning Interface Report](38-proposal-and-provisioning-interface.md). Module availability and the default set offered are **CEO decisions** ([CEO Decision Report](42-checkpoint6-ceo-decision-report.md)).
