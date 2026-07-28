# Phase 1 · Deliverable 7 (CP6) — Blueprint Lifecycle and Workflow Report

**Date:** 2026-07-27 · **Checkpoint:** 6 · Controlled lifecycle, human approval, versioning. An AI run can never approve.

## 1. Lifecycle states (`discovery.blueprint_status`)

```
draft → generating → generated | partially_generated → awaiting_review
   → (changes_requested → awaiting_review)* → approved → ready_for_proposal
   approved/awaiting_review → rejected
   any → archived ;  prior version → superseded
```

`partially_generated` is reached when the deterministic plan succeeded but the AI narrative failed or was rejected. `rejected` and `changes_requested` route back through review. `superseded` marks a version replaced by a newer one.

## 2. RPCs and their gates

| RPC                                                                                     | Permission                   | Extra gate                                            |
| --------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| `request_blueprint`                                                                     | `discovery.blueprint.create` | assessment must be `completed`                        |
| `start_blueprint_generation`                                                            | `discovery.blueprint.create` | from `draft`                                          |
| `add_blueprint_section/finding`, `recommend`, `add_roadmap_item`, `add_impact_estimate` | `discovery.blueprint.create` | blueprint in `draft`/`generating`/`changes_requested` |
| `mark_blueprint_generated`                                                              | `discovery.blueprint.create` | sets `generated`/`partially_generated`                |
| `submit_blueprint_for_review`                                                           | `discovery.blueprint.create` | opens a `workflows` instance                          |
| `request_blueprint_changes`                                                             | `discovery.blueprint.manage` | → `changes_requested`                                 |
| `approve_blueprint`                                                                     | `discovery.blueprint.manage` | **requires an approved workflow instance**            |
| `reject_blueprint`                                                                      | `discovery.blueprint.manage` |                                                       |
| `mark_ready_for_proposal`                                                               | `discovery.blueprint.manage` | must be `approved`                                    |
| `new_blueprint_version`                                                                 | `discovery.blueprint.create` | supersedes the prior version                          |
| `archive_blueprint`                                                                     | `discovery.blueprint.manage` |                                                       |

## 3. AI can never approve — two independent gates

`approve_blueprint` requires **both** the `discovery.blueprint.manage` permission (held by human tenant owners/admins) **and** an approved `workflows` instance created by `submit_blueprint_for_review` and decided by a human via `workflows.decide`. An AI run has no `auth.uid()` with `blueprint.manage` and cannot decide a workflow task, so it cannot satisfy either gate. Proven by `25_blueprint_engine.sql :: t_cannot_approve_without_review` (approval is rejected before human review) and `t_approved` (succeeds only after a human decides the workflow task).

## 4. Versioning — a reviewed version is never overwritten

`request_blueprint` and `new_blueprint_version` compute the next `version` for the assessment. `new_blueprint_version` creates a fresh `draft` at `version + 1` and marks the prior blueprint `superseded` with a `superseded_by` pointer — the prior version, its findings, recommendations, roadmap, and impact estimates all remain intact. Proven by `t_new_version_v2`, `t_prior_superseded`, `t_supersede_pointer`, `t_prior_findings_preserved`.

## 5. Events emitted (on the existing bus)

`blueprint.requested`, `blueprint.generation_started`, `blueprint.generated`, `blueprint.partially_generated`, `blueprint.review_requested`, `blueprint.changes_requested`, `blueprint.approved`, `blueprint.rejected`, `blueprint.ready_for_proposal`, `recommendation.created`, `recommendation.overridden`. Delivery to the (inert) `discovery-blueprint-worker` uses the CP5 shared dispatcher — no new queue.
