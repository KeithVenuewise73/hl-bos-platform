# CP8 · Deliverable 19 — Inert Development Adapter Documentation

**Date:** 2026-07-27 · **Checkpoint:** 8 · `_shared/hlvs/adapter.ts` (`hlvs-inert-adapter-0.1.0`) + `hlvs-factory-worker`

The inert development-agent adapter exists so the factory lifecycle can be exercised end-to-end **without contacting Claude or any external API**.

## It may

- Accept a generated prompt package and return a **simulated** submission receipt.
- Accept fixture checkpoint reports.
- Demonstrate lifecycle transitions.

## It always reports

`external_execution: false` — on the submission receipt, on fixture reports, and on the `hlvs-factory-worker` response.

## It must never

Contact Claude; call an external AI API; modify a repository; create a branch; commit code; run migrations; deploy software; or access secrets.

## Enforcement

- `InertDevelopmentAdapter.submit()` **refuses** a prompt package that carries a secret shape or whose `live_execution` is not `false`, and its accept-path note states _"Claude was NOT contacted"_. Proven by `hlvs_factory.test.ts :: adapter: refuses a non-inert prompt and a secret-bearing prompt`, `adapter: accepts an inert prompt and reports external_execution false`.
- `hlvs-factory-worker/index.ts` claims deliveries via the CP5 shared dispatcher but wires no agent — it processes nothing and returns `external_execution: false`.
- The DB `hlvs.development_runs.external_execution` and `hlvs.hlbos_feedback.external_execution` columns are `false` for every row (`t_run_no_external_execution`, `t_feedback_inert`).

Agent-neutrality: although Claude is the primary agent, the adapter and schema name no provider, so a different governed agent could be substituted without schema change.
