# CP8 · Deliverable 9 — Development-Run Lifecycle

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.development_runs`

A development run tracks execution of an approved Software Creation Order. It is **agent-neutral** (Claude is the primary agent, but the schema names none) and never integrates an external Claude API in this checkpoint.

## Record

`order_id` + `order_version`, `prompt_package_id`, `development_agent` (default `claude`), `model_identifier` (when known), `repository`, `branch`, `started_at`, `current_checkpoint`, `status`, `blockers` (jsonb), `human_decisions` (jsonb), `completed_at`, `final_disposition`, and **`external_execution` (always `false`)**.

## Lifecycle

`initialized → prompt_delivered → in_progress → blocked → reports_submitted → completed → accepted → rejected → cancelled` (`hlvs.run_status`).

## RPC + gates

`hlvs.start_development_run(order, attrs)` requires the order to be at `prompt_generated` (a generated prompt package must exist), links the latest prompt package, sets `external_execution = false`, advances the order to `development_active`, and emits `hlvs.development_run.started`. `hlvs.run.manage` required. Proven by `27_hlvs_factory.sql :: t_run_no_external_execution`, `t_order_development_active`.

## No external execution

The initial implementation is agent-neutral and **does not integrate with an external Claude API**. `external_execution` is `false` on every run; the inert development adapter ([Deliverable 19](63-inert-adapter-documentation.md)) demonstrates lifecycle transitions without contacting Claude. Submission of a prompt to Claude remains human-controlled.
