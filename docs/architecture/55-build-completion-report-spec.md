# CP8 · Deliverable 11 — Build Completion Report Specification

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.build_completion_reports`

A Build Completion Report is generated only after **all** required development checkpoint reports are accepted.

## Summarizes (in `content` jsonb)

Original blueprint; approved creation order; final repositories + branches; created/reused/extended capabilities; created/reused modules; migration inventory; test inventory; security validation; documentation inventory; deployment requirements; environment variables + secrets **required** (names only, no values); known limitations; remaining risks; compatibility requirements; rollback considerations; catalog updates proposed; production-readiness recommendation.

## Gate

`hlvs.submit_build_completion_report(run, content, drafted_by_ai)` raises unless every checkpoint report for the run is `accepted` / `accepted_with_conditions` **and** at least one exists (`t_build_completion_created` after acceptance; the requirement is enforced by the RPC). It advances the run to `completed` and emits `hlvs.build_completion_report.submitted`. One report per run (`unique (run_id)`).

## AI may draft; AI may not accept

`drafted_by_ai` records whether AI drafted the report (`t_bcr_ai_drafted`). The report stays `pending` until a human calls `hlvs.accept_build_completion_report(run)` — an AI run cannot accept it (`t_bcr_pending_until_human`, `t_bcr_accepted`). `hlvs.run.manage` required for both.

## Secrets

Only secret **names** are recorded (never values); the `check-no-public-secrets` gate and the prompt-generator secret scrubber keep values out of the record.
