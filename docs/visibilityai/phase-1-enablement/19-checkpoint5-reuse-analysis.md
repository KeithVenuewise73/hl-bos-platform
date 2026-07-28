# Phase 1 · Deliverable 1 (CP5) — Website Assessment Collector Reuse Analysis

**Date:** 2026-07-27 · **Checkpoint:** 5 · Completed **before** authoring migrations or worker code.

The Website Assessment Collector is **Discovery Module 1** inside the Checkpoint-4 Business Discovery Engine. It is not a standalone product and creates no second assessment/evidence/workflow/scoring/storage/event/AI/tenant system. All findings feed the existing unified architecture.

## 1. Reused verbatim (no duplication)

| Need                                         | Reused component                                                                  | How the collector uses it                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Collector registry                           | `discovery.collectors`                                                            | **Activates** the seeded `website_assessment` row (no new collector record)                                                                            |
| Collection runs                              | `discovery.collections`                                                           | One row per scan run                                                                                                                                   |
| Unified evidence                             | `discovery.evidence`                                                              | Every website finding is an evidence row (category/severity/detection_method in `value`, artifact via `file_id`/`refs`) — the canonical evidence layer |
| Business Profile                             | `discovery.profiles`                                                              | Findings link to the profile                                                                                                                           |
| Assessment + scoring                         | `discovery.assessments`, `discovery.score_dimensions`, `discovery.profile_scores` | Rubric maps evidence → dimension contributions via `score_dimension`; composites stay data-driven                                                      |
| Storage                                      | `storage_meta.files`                                                              | Raw HTML/screenshots/robots/sitemap artifacts; evidence references them (never duplicated into audit/events)                                           |
| AI                                           | `ai` gateway + `_shared/ai`                                                       | Content classification; evidence carries `ai_run_id`; **mock provider** locally                                                                        |
| Events                                       | `events` outbox                                                                   | New `discovery.website_scan.*` topics; no new bus                                                                                                      |
| Workflows                                    | `workflows`                                                                       | Human-review gate before assessment completion                                                                                                         |
| Audit / Tenancy / Permissions / Entitlements | spine                                                                             | Every write audited, tenant-scoped, permission-gated                                                                                                   |
| Communications                               | `comms`                                                                           | Future assessment-ready delivery — event/interface only this checkpoint                                                                                |
| Retry / redaction                            | `_shared/ai/retry.ts`, `_shared/ai/redact.ts`                                     | Provider-call retry + secret scrubbing in the worker                                                                                                   |
| Provider abstraction                         | `_shared/ai`, `_shared/comms` patterns                                            | PageSpeed adapter mirrors it (mock + inert real)                                                                                                       |

## 2. New objects — why each is necessary

| Object                                                                                                                                          | Why new / not a duplicate                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared dispatcher handler-invocation** (extends `events`: `handlers` registry + `claim_deliveries`/`complete_delivery` + backoff/dead-letter) | The CP2/CP3 gap: `dispatch_batch` writes deliveries but never invokes a consumer. This is the **shared** delivery→handler mechanism every module needs (not a scanner queue). Extends the existing `events` schema; **no second bus.**                                                                                |
| `discovery.website_scans`                                                                                                                       | The website-specific **scan lifecycle + counters** (pages fetched/skipped, redirects, bytes, versions, ai_run_ids, cost). Mirrors the `integrations.sync_runs` honest-instrumentation pattern; website detail that doesn't belong in the generic `collections` row. Evidence stays canonical in `discovery.evidence`. |
| `discovery.scan_status` enum                                                                                                                    | The extended lifecycle (requested→validating→…→completed/partially_completed/failed/cancelled).                                                                                                                                                                                                                       |
| Website RPCs (`request_website_scan`, `update_scan_progress`, `record_scan_finding`, `complete_scan`, `cancel_scan`)                            | Thin, permission-gated lifecycle wrappers that write through `discovery.record_evidence`/`score_dimension` — no parallel evidence/scoring path.                                                                                                                                                                       |

## 3. Collector activation decision

The CP4-seeded `website_assessment` collector is technically usable → **activate it** (`is_active=true`), no second record. Consequence: CP4 test 22's "inactive collector is inert" assertion is repointed to `social_presence` (still an inactive placeholder), preserving the guard while honoring the brief's activation requirement.

## 4. Duplication test — cleared

No second event bus (extends `events`), no second evidence/scoring/assessment model (writes into `discovery.*`), no second storage/AI/tenant/workflow system. The only genuinely new capability is the **shared** handler-invocation extension, which is reusable by every module and was explicitly required by CP2/CP3.

## 5. Website-findings table? — No

Per the brief, `discovery.evidence` remains the canonical summarized evidence layer. Website findings are evidence rows; the only website-specific table is `discovery.website_scans` (lifecycle/counters), not a parallel findings store.
