# Phase 1 · Deliverable 8 (CP4) — Test Coverage Report

**Date:** 2026-07-27 · **Checkpoint:** 4 · Local only.

## Totals

**Database (pgTAP): 275 passed, 0 failed.** **Edge (Deno/Node-tsx): 14 passed, 0 failed.**

| Suite                        | File                      | Assertions |
| ---------------------------- | ------------------------- | ---------: |
| Spine + V0 (baseline)        | `01`–`18`                 |        166 |
| AI runtime (CP2)             | `19_ai_runtime_smoke.sql` |         24 |
| Storage (CP3)                | `20_storage.sql`          |         20 |
| Communications (CP3)         | `21_communications.sql`   |         31 |
| **Business Discovery (CP4)** | **`22_discovery.sql`**    |     **34** |
| **Total**                    |                           |    **275** |

Edge unit tests unchanged this checkpoint (`ai_runtime.test.ts` 8, `comms_storage.test.ts` 6) — Discovery is a DB-layer capability; no new edge code.

## Discovery coverage (test 22) — mapped to the brief's required list

| Required validation            | Assertion(s)                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business Profile creation      | `t_create_profile`, `t_profile_active`                                                                                                                                                                                                                                                        |
| Business Profile updates       | `t_update_profile_summary`, `t_summary_updated`                                                                                                                                                                                                                                               |
| Evidence collection            | `t_start_active_collection`, `t_record_interview_answer`, `t_record_generic_evidence_future_source`, `t_evidence_recorded`                                                                                                                                                                    |
| Evidence isolation             | `t_evidence_tenant_isolation`                                                                                                                                                                                                                                                                 |
| Tenant isolation               | `t_nonmember_cannot_create_profile`, `t_evidence_tenant_isolation`                                                                                                                                                                                                                            |
| Permission enforcement         | `t_viewer_cannot_create_profile`, `t_nonplatform_cannot_register_collector`                                                                                                                                                                                                                   |
| Workflow generation            | `t_submit_for_review`, `t_assessment_in_review`, `t_workflow_generated`                                                                                                                                                                                                                       |
| Assessment lifecycle           | `t_start_assessment` → `t_score_maturity`/`t_score_health` → `t_complete_requires_review` → `t_human_review_decides` → `t_complete_assessment` → `t_assessment_completed`; honest composites `t_maturity_score_computed` (80), `t_health_score_computed` (60); `t_unknown_dimension_rejected` |
| Module registration            | `t_nonplatform_cannot_register_collector`, `t_platform_registers_collector`                                                                                                                                                                                                                   |
| Collector extensibility        | `t_inactive_collector_inert`, `t_new_collector_usable`                                                                                                                                                                                                                                        |
| Future collector compatibility | `t_record_generic_evidence_future_source` (document source via the generic path)                                                                                                                                                                                                              |
| Audit logging                  | `t_profiles_audited`, `t_evidence_audited`, `t_profile_created_event`, `t_assessment_completed_event`                                                                                                                                                                                         |
| Reusable output objects        | `t_draft_blueprint`, `t_add_recommendation`                                                                                                                                                                                                                                                   |

## Repository gates

`pnpm lint` (clean), `pnpm typecheck` (2/2), `pnpm test` (vitest 45), pinned Prettier `--check .` (clean), `scripts/check-migrations.sh` (20 migrations OK), `check-no-public-secrets.sh` (OK). No regressions — all 241 prior assertions still pass.
