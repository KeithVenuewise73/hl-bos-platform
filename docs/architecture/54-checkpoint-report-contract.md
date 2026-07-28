# CP8 · Deliverable 10 — Checkpoint-Report Contract

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.checkpoint_reports` · format `hlvs.checkpoint_report.v1`

Each checkpoint report captures the structured evidence Claude returns for one development checkpoint.

## Fields (in `content` jsonb + typed columns)

Development run; checkpoint number + name; summary; reuse findings; files created; files changed; migrations created; database objects; API/RPC changes; UI changes; tests added; test results; lint + typecheck results; security findings; architecture deviations; unresolved decisions; known limitations; next-checkpoint recommendation; commit identifier; branch; evidence artifacts.

The conformance engine consumes `content.modules_created` + `content.modules_reused` (and the `production_action` / `secret_exposure` flags) — see [Deliverable 12](56-blueprint-conformance-model.md).

## Review

`hlvs.review_checkpoint_report(report, decision)` records one of `accepted`, `accepted_with_conditions`, `rejected`, `revision_required` (`hlvs.report_review`); acceptance stamps `accepted_at` and emits `hlvs.checkpoint_report.accepted`. `hlvs.run.manage` required.

## Append-only after acceptance

Once a report's review is `accepted` / `accepted_with_conditions`, its content and review are frozen — a trigger (`hlvs.freeze_accepted_report`) raises on any mutation. Proven by `27_hlvs_factory.sql :: t_report_append_only`. This preserves the evidence trail.

## Submission

`hlvs.submit_checkpoint_report(run, number, name, content)` appends a report (unique per `(run, checkpoint_number)`), advances the run's `current_checkpoint`, sets status `reports_submitted`, and emits `hlvs.checkpoint_report.submitted`.
