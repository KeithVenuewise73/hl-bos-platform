# Phase 1 · Deliverable 11 (CP4) — Checkpoint 4 Completion Summary

**Date:** 2026-07-27 · **Checkpoint:** 4 (Business Discovery Engine Foundation) · Local dev stack only.

## What was created

- **`discovery` schema** (migration `hlbos_0020_discovery`): the reusable Business Discovery Engine.
  - Canonical **Unified Business Profile** (`profiles`) fed by all collectors.
  - **Collector registry** (`collectors`, a row-catalog) — Modules 1–5 seeded (Business Interview active; Website Assessment, Social Presence, Document Analysis, Integrations as inactive placeholders/interfaces).
  - **Unified evidence store** (`evidence`) + collector runs (`collections`); one ingestion RPC every collector uses; evidence links to `storage_meta.files` and `ai.runs`.
  - **Two data-driven scoring frameworks** (`score_dimensions`: 12 Digital-Maturity + 8 Business-Health dims, weights as rows) + per-assessment `profile_scores`.
  - **Assessment lifecycle** (`assessments`) reusing the `workflows` human-review gate; honest composite scores.
  - **Reusable output containers** (`blueprints`, `recommendations`) — no report generated.
  - 13 SECURITY DEFINER RPCs; 8 new permissions; interview-question + dimension seeds.
- **Docs 12–18**: reuse analysis, architecture (profile/evidence/workflow), Digital Maturity framework, Business Health framework, test coverage, CEO decision report, this summary.

## What was reused (no duplication)

`platform.tenants`, `identity`/permissions, `audit`, `events` (outbox — new `discovery.*` topics, no new bus), `workflows` (human review — no new approval engine), `storage_meta` (document/screenshot evidence), `ai` (analysis evidence via run refs), `integrations` (Module 5 connectors), `billing`/`entitlements` (future subscription recommendation). Reuse analysis written before the migration.

## Test totals

pgTAP **275 passed, 0 failed** (166 baseline + 24 AI + 20 storage + 31 comms + **34 discovery**). Edge Deno **14 passed, 0 failed**. Repo gates all green (lint, typecheck, vitest 45, pinned Prettier, check-migrations 20, secret scan).

## Remaining mock-only / not implemented (by design)

- **No scanning logic** — Website Assessment collector is an inactive placeholder; `start_collection` refuses inactive collectors (verified).
- Social Presence, Document Analysis, Integrations collectors are **interfaces/placeholders** only.
- **No report/blueprint generation** — only reusable containers exist.
- No customer-facing pages; no real provider use; no AI executed (mock only); no customer data.
- Proposal → Customer Approval → Provisioning → Software Factory stages are **interfaces reused from existing services**, not implemented.

## Future extension points (interfaces established)

- New collector = a `discovery.collectors` row + `record_evidence` calls (Website Scanner activates here in CP5).
- New scoring dimension = a `discovery.score_dimensions` row.
- Document evidence → `storage_meta.files` (`file_id`); AI evidence → `ai.runs` (`ai_run_id`); integrations → `integrations.connectors`.
- Blueprint/recommendation sections are open jsonb + a typed recommendations table, ready for generation later.

## CEO approvals required

See the CEO Decision Report (17). Summary: converge `visibility.assessments` later (recommended); confirm framework weights (defaults fine for now); **authorize Checkpoint 5 (Website Assessment collector)**; standing items still open — `anthropic_api_key`, email/Twilio, arm `production`, `pg_cron`/`pg_net`, canonical-project reconciliation; define the service/module catalog before blueprint generation. None performed this checkpoint.

## Readiness for Checkpoint 5

**Ready.** The Business Discovery Engine provides the collector registry, unified evidence store, profile, scoring, and assessment workflow that the Website Assessment Module plugs into as one collector. Checkpoint 5 should implement that collector **local-only**, with the SSRF/abuse controls from Phase 0 designed in from the first line, and pair it with the shared dispatcher handler-invocation extension + `pg_cron`/`pg_net` (CEO-gated) to run scans on a schedule. Awaiting CEO review before starting.
