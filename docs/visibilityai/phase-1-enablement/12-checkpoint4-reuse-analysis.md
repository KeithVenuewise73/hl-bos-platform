# Phase 1 · Deliverable 7 (CP4) — Business Discovery Engine Reuse Analysis

**Date:** 2026-07-27 · **Checkpoint:** 4 · Completed **before** authoring migration `hlbos_0020_discovery`.

The Business Discovery Engine is a **new shared HL-BOS capability** (`discovery` schema) that every vertical can consume. It reuses all shared infrastructure and does not duplicate a foundation.

## 1. Foundations reused (no duplication)

| Need                     | Reused component                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant identity          | `platform.tenants` — every discovery row carries `tenant_id`                                                                                                                 |
| User identity            | `auth.users` via `identity`                                                                                                                                                  |
| AuthZ                    | `identity.has_permission` / `is_platform_admin`; new `discovery.*` permissions in the existing catalog                                                                       |
| Audit                    | `audit.emit()` trigger + `audit.log_security_event`                                                                                                                          |
| Events                   | `events.emit()` — new `discovery.*` topics on the existing outbox; **no new bus**                                                                                            |
| Workflows / human review | `workflows.request_approval`/`decide`/`is_approved` for the assessment review gate; **no new approval engine**                                                               |
| AI                       | `ai` gateway consumes evidence for analysis (via `ai.begin_run`/`finish_run`); discovery only records the resulting AI evidence, it does not call models itself              |
| Storage                  | `storage_meta.files` holds uploaded documents/screenshots; discovery evidence references a `file_id` (Document Analysis / Website collectors)                                |
| Communications           | `comms` delivers assessments/blueprints/proposals later                                                                                                                      |
| Billing                  | `billing` consumes the subscription recommendation on conversion                                                                                                             |
| Integrations             | Module 5 connectors reuse `integrations.connectors` (QuickBooks/Stripe/Square/HubSpot/Jobber/ServiceTitan/Salesforce) — discovery does not build a second connector registry |

## 2. New objects and why each is necessary (schema `discovery`)

| Object                          | Why new / not a duplicate                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discovery.profiles`            | The **canonical Unified Business Profile** — one representation per business, fed by every collector. No such general model exists (`visibility.prospects` is a VisibilityAI lead, not a maturity/health-scored business profile). Optionally links to a `visibility.prospects` row. |
| `discovery.collectors`          | Registry of Discovery Modules (website_assessment, business_interview, social_presence, document_analysis, integrations). A **catalog table (citext key), not an enum**, so new collectors are rows, not migrations — satisfies "collector extensibility."                           |
| `discovery.collections`         | One run of a collector against a profile (status/started/finished/stats) — mirrors the `integrations.sync_runs` honest-instrumentation pattern.                                                                                                                                      |
| `discovery.evidence`            | The **single unified evidence store** every collector writes to (source, collector, key, value, confidence, references, timestamp, audit). No separate evidence model per collector — the brief's core requirement.                                                                  |
| `discovery.interview_questions` | Catalog of the Business Discovery Interview fields (Module 2). Answers are stored as **evidence**, not a separate profile model.                                                                                                                                                     |
| `discovery.score_dimensions`    | Unified, **data-driven** catalog for both frameworks (`framework` = maturity \| health). Weights are rows; new dimensions are rows — nothing hard-coded.                                                                                                                             |
| `discovery.assessments`         | Profile-level assessment summary (maturity_score, health_score, review workflow). See §3 on the relationship to the existing assessment engine.                                                                                                                                      |
| `discovery.profile_scores`      | Per-dimension scores feeding the two composite scores; honest (composites derive only from real scored dimensions).                                                                                                                                                                  |
| `discovery.blueprints`          | Reusable **output container** (jsonb sections) for the future Business Transformation Blueprint, roadmap, ROI, subscription recommendation. No report is generated this checkpoint.                                                                                                  |
| `discovery.recommendations`     | Structured recommendations (service / hl_bos_module / quick_win / roadmap_item / risk) with estimated impact — queryable, not buried in a blob.                                                                                                                                      |

## 3. Relationship to the existing Assessment Engine (honest)

The existing `visibility.assessments` (migration 0017) scores a **prospect's website** across 16 weighted categories → a Business Growth Score. The Business Discovery Engine **generalizes** assessment to any business (with or without a website) via multiple collectors and two frameworks (maturity + health). They overlap conceptually.

- This checkpoint is **additive**: `discovery` does not modify or remove `visibility.assessments`.
- `discovery.profiles.prospect_id` links a profile to an existing VisibilityAI prospect so the two coexist.
- The **Website Assessment collector** (Module 1, CP5) is the bridge: it will record the website findings as `discovery.evidence`, and the 16 VisibilityAI categories become one input to the maturity framework.
- **A future consolidation** — folding `visibility.assessments` into `discovery` as the "website + prospect" specialization — is flagged as a CEO decision (see the CEO Decision Report), not done here, to avoid touching a live vertical prematurely.

## 4. Duplication test — cleared

Not a second tenant/identity model, event bus, workflow engine, approval system, storage system, connector registry, or AI gateway. The only overlap (assessment scoring) is the **generalization the brief asked for**, is additive, and is documented with a consolidation decision rather than silently duplicated.

## 5. Cross-vertical reusability

Any vertical creates a `discovery.profile`, runs collectors that write `discovery.evidence`, and gets maturity/health scores + a blueprint — SalonAI onboarding, HomeHuddle, TransportationAI/fleet, HSCS, and VisibilityAI all through the same engine, differing only by which collectors and dimensions they enable (rows, not code).
