# HL-BTI — Architecture Impact Report (Deliverable 11)

What adding HL-BTI does — and deliberately does not do — to the HL-BOS architecture.

## 1. Net additions

- **One new schema:** `bti` (13 tables, 7 new enum types, ~20 RPCs, RLS+FORCE, 12 permissions).
- **One new migration:** `0026_bti_platform.sql` (migration count 25 → 26).
- **One new edge engine:** `_shared/bti/{scoring,lifecycle,growth,blueprint}.ts` (pure, offline, deterministic).
- **Two new test files:** `28_bti_platform.sql` (47 pgTAP) + `bti_platform.test.ts` (11 Deno).
- **Portfolio truth updated:** HL-BTI added to `registry.ts` as `development` (it has code).

## 2. Net platform-service additions: ZERO

No new identity, authentication, tenancy, permission engine, audit sink, event bus, workflow engine, billing system, proposal engine, factory governance, communications plane, AI gateway, or file store. HL-BTI **consumes** all of these. (Detail: [Reuse Analysis](12-reuse-analysis.md).)

## 3. Impact on existing objects

- **No existing table, function, enum, policy, or permission was altered or dropped.** HL-BTI references existing objects by foreign key (`discovery.profiles`, `discovery.blueprints`, `sales.proposals`, `workflows.instances`) and by function call — additively.
- **No existing test changed.** The prior suite (560 pgTAP + 93 Deno) still passes unchanged; HL-BTI is purely additive (now 607 pgTAP + 104 Deno).
- **No enum was extended** (`ALTER TYPE ADD VALUE` cannot run in a migration transaction); all new vocabularies are new enum types.

## 4. Coupling & blast radius

`bti` depends on `platform`, `identity`, `audit`, `events`, `workflows`, `discovery`, `sales`. Those schemas do **not** depend on `bti` (one-directional). Dropping `bti` (`DROP SCHEMA bti CASCADE` + permission cleanup) removes HL-BTI cleanly with no effect on the rest of the platform — the rollback is stated in the migration header and is safe because nothing else references `bti`.

## 5. Governance & standing constraints

- **Local stack only.** Migration 0026 is authored and tested locally; **not applied** to any live project. Applying it (with 0021–0025) remains a CEO-approved production step.
- `main` protected → branch + PR. TypeScript pinned 6.0.3 (unchanged). No secret exposed (gate green). No legacy asset touched.
- HL-BTI is authored as "another reusable platform inside HL-BOS," registrable through the HLVS factory — matching the PCO's architecture mandate.

## 6. Quality gates (real runs — see the Build Completion Report)

pgTAP 607/0 · Deno 104/0 · vitest 45 · prettier `--check .` clean · eslint clean · typecheck clean · check-migrations OK (26) · no-public-secrets OK · ts-pin OK (6.0.3).

## 7. What remains for production

Applying migration 0026, wiring a customer-facing UI (portal/dashboards) to the tested read models, and any Claude API integration for the advisory narrative — each separately gated. None is claimed as done.
