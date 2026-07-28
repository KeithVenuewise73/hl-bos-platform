# Phase 1 · Deliverable 1 (CP6) — Business Transformation Blueprint Engine Reuse Analysis

**Date:** 2026-07-27 · **Checkpoint:** 6 · Completed **before** authoring any migration or application code.

The Blueprint Engine converts Business Discovery evidence into an actionable, evidence-supported transformation plan. It is a **generation and governance layer over the existing Discovery Engine** — it introduces no second assessment, recommendation, approval, catalog, proposal, or provisioning system.

## 1. Reused verbatim (no duplication)

| Need                          | Reused component (already built)                                       | How the Blueprint Engine uses it                                                             |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Business identity             | `discovery.profiles`                                                   | Blueprint is generated for a profile; executive summary reads identity from it               |
| Evidence                      | `discovery.evidence`                                                   | Every finding/opportunity/recommendation traces to evidence rows (ids + keys)                |
| Assessment + composite scores | `discovery.assessments`, `discovery.profile_scores`                    | Blueprint requires a **completed** assessment; current-state section reads `profile_scores`  |
| Scoring frameworks            | `discovery.score_dimensions` (maturity 12 + health 8)                  | Current-state section maps 1:1 to these dimensions — no new score model                      |
| AI                            | `ai` gateway + `_shared/ai` (mock locally)                             | Narrative synthesis only; every AI conclusion cites evidence; failure ⇒ partial blueprint    |
| Prompt-injection defense      | `_shared/discovery/injection.ts`                                       | Reused unchanged to fence untrusted evidence text sent to the model                          |
| Human approval                | `workflows.request_approval` / `decide` / `is_approved`                | Blueprint approval is a workflow instance; an AI run can never approve                       |
| Events                        | `events.emit` + transactional outbox                                   | New `blueprint.*` / `recommendation.*` topics on the existing bus — no new bus               |
| Handler invocation            | `events.handlers` + `claim_deliveries` / `complete_delivery` (CP5)     | Inert `discovery_blueprint_worker` handler; retry/backoff/dead-letter reused                 |
| Storage                       | `storage_meta.files`                                                   | Future JSON/PDF/evidence-package artifacts reference files; no new bucket                    |
| Communications                | `comms` + `_shared/comms`                                              | Future review/approval/delivery notifications — **interface/events only** this checkpoint    |
| Billing / entitlements        | `billing.*`, `entitlements.*`                                          | Module catalog carries an `entitlement_key`; pricing is a **reference**, not a created price |
| Integrations                  | `integrations.*`                                                       | Module catalog dependencies reference integration capabilities                               |
| Audit / Identity / Tenancy    | spine (`audit.emit`, RLS+FORCE, `identity.has_permission`)             | Every new table tenant-scoped, permission-gated, audited                                     |
| Permissions                   | `identity.permissions` (action vocab read/create/update/delete/manage) | New `discovery.blueprint.*` + `discovery.catalog.manage` keys                                |

## 2. Are the CP4 blueprint / recommendation containers sufficient?

**Partially. They are the correct home and must not be replaced — but they lack the structure this checkpoint requires.** CP4 (migration 0020) created deliberately minimal containers:

- `discovery.blueprints` — `id, tenant, profile, assessment, status text, content jsonb, timestamps`. **Missing:** versioning, a controlled lifecycle, a workflow link, rule/priority-model versions, partial-generation flag, supersede link, AI-run references.
- `discovery.recommendations` — `id, tenant, assessment, kind, title, detail, recommended_service text, recommended_module, estimated_impact text, priority int`. **Missing:** origin (deterministic/AI/human), status (accepted/rejected/deferred/override/proposal flags), confidence, severity, the rule + rule version that produced it, priority factors/band, effort/cost bands, evidence references, affected dimensions, blueprint-version link.

**Decision: extend, do not replace.** Migration 0023 adds columns to both tables (all nullable or defaulted, so existing rows and the CP4 `draft_blueprint` / `add_recommendation` RPCs keep working) and adds the surrounding data-driven catalogs and rule/priority/impact structures.

## 3. New objects — why each is necessary

| New object                       | Why it cannot reuse an existing table                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `discovery.service_catalog`      | No Herman Legacy service catalog exists anywhere. Data-driven, versioned, availability-gated.         |
| `discovery.module_catalog`       | No HL-BOS module catalog exists. Represents provisionable capabilities + entitlement keys.            |
| `discovery.roadmap_phases`       | Roadmap phases must be a **configurable catalog**, not hard-coded — seeded with 8, extensible.        |
| `discovery.recommendation_rules` | Versioned, data-driven rule definitions so recommendations are traceable to a rule, not opaque AI.    |
| `discovery.blueprint_sections`   | Per-section narrative with independent origin + evidence traceability (exec summary, current state…). |
| `discovery.blueprint_findings`   | Priority findings have a distinct shape (severity/impact/urgency/affected dimensions/review status).  |
| `discovery.roadmap_items`        | Roadmap items have a distinct shape (phase/sequence/effort/duration/approvals/related recs+evidence). |
| `discovery.impact_estimates`     | Assumption-based ROI scenarios (low/expected/high + caveats) — deliberately separate from scores.     |

Recommendations (opportunities and solution-stack items alike) remain in the **single** extended `discovery.recommendations` table — there is no second recommendation engine. Findings, roadmap items, and impact estimates are blueprint sub-structures that reference recommendations and evidence; they are not competing recommendation lists.

## 4. What is deliberately NOT built (checkpoint boundaries)

No proposal engine, no provisioning, no customer communication, no live AI/PageSpeed/crawl, no remote migration, no billing activation, no created prices. Clean interfaces are defined for the future Proposal → Selection → Agreement → Provisioning → Module Enablement path; recommendations can be flagged `included_in_proposal` / `excluded_from_proposal` / `deferred` / `customer_selected` / `awaiting_pricing` / `awaiting_technical_review`, but nothing acts on those flags this checkpoint.
