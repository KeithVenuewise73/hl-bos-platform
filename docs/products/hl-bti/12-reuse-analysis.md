# HL-BTI — Reuse Analysis (Deliverable 12)

**Product:** Herman Legacy Business Transformation Intelligence Platform (HL-BTI) · **PCO:** #1 (first flagship factory product) · **Date:** 2026-07-27 · **Stack:** local development only.

> **This document is written BEFORE any HL-BTI code**, per the HL-BOS operating contract and the PCO mandate _"Favor reuse over new development. Do not introduce duplicate platform services."_ It states exactly what HL-BTI **reuses**, what it **extends**, and the **small, justified** set of genuinely new capabilities — and proves no platform service is duplicated.

## 1. The one-sentence architecture

HL-BTI is a **product-orchestration layer** (`bti` schema) that assembles the already-built HL-BOS pipeline — **Discovery (0020) → Blueprint Engine (0023) → Sales/Proposals (0024) → Provisioning (0024)** — into a governed consulting engagement, and adds only the capabilities that genuinely do not exist yet: an **executive intelligence framework + 7 executive scores**, an **engagement lifecycle**, **consulting delivery (projects/milestones/tasks) + ROI tracking**, a **cross-business CEO dashboard**, and **per-business configuration** (HSCS, Venuewise).

## 2. What HL-BTI REUSES unchanged (no duplication)

| PCO "do NOT duplicate" | HL-BOS capability reused                                          | How HL-BTI uses it                                                                             |
| ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Identity**           | `identity.*` (users, roles)                                       | every RPC authorizes via `identity.has_permission(tenant,'bti.*')` / `has_platform_permission` |
| **Authentication**     | Supabase Auth + `auth.uid()`                                      | actor identity; no auth code in `bti`                                                          |
| **Tenancy**            | `platform.tenants`                                                | every `bti` table is `tenant_id`-scoped, RLS+FORCE                                             |
| **Permissions**        | `identity.permissions` / `role_permissions`                       | new `bti.*` permission keys registered into the existing model — no new authz engine           |
| **Audit**              | `audit.emit()` / `audit.log_security_event()`                     | triggers on every `bti` table; security events for scoring/lifecycle                           |
| **Billing**            | `billing.*` + `sales.request_billing_setup`                       | HL-BTI references billing for monthly partnership; creates **no** billing tables               |
| **Proposal Engine**    | `sales.*` (proposals, line items, agreements, customer selection) | HL-BTI links an engagement to a `sales.proposals` row via the existing flow                    |
| **Factory Governance** | `hlvs.*`                                                          | HL-BTI is registered as a factory **product**, not a re-implementation of governance           |
| **Communications**     | `comms.*`                                                         | referenced for sending proposals/reports; no new messaging plane                               |
| **Events**             | `events.emit` + CP5 shared dispatcher (`events.handlers`)         | all HL-BTI domain events; **no second bus**                                                    |
| **Workflows**          | `workflows.request_approval` / `is_approved` / `decide`           | every human gate (assessment sign-off, blueprint approval, engagement stage advance)           |
| **AI gateway**         | `ai.*` + `_shared/ai` + injection fence                           | advisory narrative only; AI approves/authorizes nothing                                        |
| **Storage**            | `storage_meta.files`                                              | blueprint/report artifacts by reference                                                        |

## 3. What HL-BTI EXTENDS (additively, no fork)

| Existing object                                                                                               | Extension                                                                                                                                                                               | Why not new                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `discovery.profiles` / `assessments` / `evidence` / `profile_scores`                                          | HL-BTI **consumes** them as the assessment substrate; a `bti.assessments` row references a `discovery.assessments` row                                                                  | the discovery scoring engine (weighted 0–5 → 0–100, honest nulls) is exactly what the 7 executive scores roll up from |
| `discovery.score_dimensions` (maturity + health frameworks)                                                   | HL-BTI adds **BTI-specific dimensions** as rows (operations/fleet/warehouse/AI-readiness/financial) under new frameworks — rows, not code                                               | dimensions are a data-driven catalog by design (0020)                                                                 |
| `discovery.blueprints` + blueprint engine (0023 sections/findings/roadmap/impact)                             | HL-BTI's **Executive Business Transformation Blueprint** is a `discovery.blueprints` row assembled by the 0023 engine; HL-BTI adds an **executive-scorecard section** deterministically | 0023 already produces the structured, versioned, workflow-approved blueprint                                          |
| `discovery.recommendations` (has `recommended_service`, `recommended_module`, `estimated_impact`, `priority`) | reused verbatim for "every recommendation includes Priority + Estimated ROI + Recommended Herman Legacy service"                                                                        | the exact shape the PCO asks for already exists                                                                       |
| `discovery.service_catalog` / `module_catalog`                                                                | HL-BTI seeds **HSCS consulting services** + industry packs as catalog rows                                                                                                              | catalogs are extensible by row (0023)                                                                                 |

## 4. What is genuinely NEW in `bti` (and why nothing else covers it)

Each new object is justified by "no existing object does this," in keeping with the honesty rule (never build a control that controls nothing) and the no-duplication rule.

| New `bti` object                                                 | Capability                                                                                                                                                   | Why it cannot reuse an existing object                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bti.businesses`                                                 | registry of Herman Legacy businesses for the CEO dashboard (HSCS, Venuewise, HomeHuddle, 5-Star; configurable)                                               | nothing enumerates "the portfolio of businesses under transformation"; `platform.tenants` are auth tenants, not portfolio businesses with an `analysis_only` posture |
| `bti.engagements`                                                | the 13-stage customer transformation lifecycle (Prospect → Monthly Partnership) tying a business to its discovery/blueprint/proposal/delivery artifacts      | no object tracks the **end-to-end consulting engagement**; discovery/sales track their own sub-lifecycles only                                                       |
| `bti.intelligence_domains` + `bti.domain_dimensions`             | the 6 executive intelligence domains (Business, Operations, Growth, Technology, AI Readiness, Financial) and their dimension membership                      | discovery has two frameworks (maturity/health); the 6 named executive domains + their rollup weights are a new, extensible framework layer                           |
| `bti.assessments` + `bti.domain_scores` + `bti.executive_scores` | the **7 executive scores** (Business Health, Operations, Growth, Technology, AI Readiness, Financial Opportunity, Transformation) computed deterministically | no object computes the executive scorecard; it rolls up discovery dimension ratings by domain                                                                        |
| `bti.projects` / `bti.milestones` / `bti.tasks`                  | **consulting implementation delivery** (projects, milestones, tasks, progress)                                                                               | `provisioning.work_orders`/`work_order_tasks` model **software provisioning** of HL-BOS modules — a different thing from managing a consulting engagement's delivery |
| `bti.roi_metrics`                                                | baseline → target → realized ROI tracking over the engagement                                                                                                | no object records consulting ROI; `discovery.impact_estimates` are pre-engagement estimates, not realized tracking                                                   |
| `bti.industry_packs`                                             | extensible industry configuration (transportation, sports, salon, …) selecting which domains/dimensions/services apply                                       | the PCO's core architecture rule: "future industries extend the assessment engine rather than replacing it"                                                          |

**Net new tables:** all in one `bti` schema. **Net new platform services: zero** — identity, auth, tenancy, permissions, audit, billing, proposals, factory governance, communications, events, workflows, AI, storage are all reused.

## 5. Deterministic-vs-AI boundary (unchanged from platform standard)

- **Deterministic:** the 7 executive scores (weighted rollups with honest nulls, mirrored DB + TS), the engagement stage machine, the Venuewise **analysis-only** cap, blueprint scorecard assembly, ROI math, dashboard aggregation. Same value in DB and TS or it is a bug.
- **AI (advisory only):** narrative summaries for the blueprint/proposal, recommendation drafting suggestions. AI **never** sets a score, advances a stage, approves a blueprint, or authorizes billing — permission checks + approved workflow instances do.

## 6. The Venuewise boundary (hard PCO requirement)

Venuewise is registered as a `bti.businesses` row with `analysis_only = true`. The engagement state machine **deterministically refuses** to advance an analysis-only engagement past blueprint/recommendation into proposal-acceptance, implementation, provisioning, or billing. HL-BTI performs **analysis and recommendations only** for Venuewise — enforced in code, not just documented. No Venuewise migration, rebuild, auth/payment replacement, or data movement is introduced by HL-BTI (consistent with Checkpoint 8B).

## 7. Governance & standing constraints honored

Local stack only; `main` protected (branch + PR); no migration applied to any project without approval; TypeScript pinned 6.0.3; no secret exposed; RLS+FORCE on every `bti` table; no legacy asset touched. HL-BTI is authored as "another reusable platform inside HL-BOS," registrable through the factory — not a bespoke app.
