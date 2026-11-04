<!-- Written 2026-11-04 on branch recovery/hlbos-production-2026-11. Status: PLAN — nothing built, nothing applied. -->

# FleetHuddle — preservation and DVIR MVP plan

## What exists (VERIFIED)

| Item | State |
| --- | --- |
| Schema `fleet` in HL-BOS Core | 15 tables, applied 2026-10-17 in one afternoon via 7 migrations (`hlg_fleet_module`, `hlg_fleet_query_scoping`, `hlg_fleet_validation_guards`, `driver_medical_cards`, `medical_card_orphan_cleanup`, + 2 scorecard rows). **Source existed only in the production ledger until 2026-11-04**; now archived under `supabase/recovery/production-2026-11/migrations/`. |
| Design | jsonb-payload document tables keyed `(workspace_id, id text)` with revision/snapshot; `workspaces`, `members` (owner/manager/maintenance/driver), `units`, `driver_profiles`, `driver_events`, `fuel_entries`, `work_orders`, `assignments`, `inspections`, `inspection_actions`, `service_records`, `documents`, `medical_cards`, `record_events`, `audit_events`; immutable-record triggers on 6 tables. |
| API | `fleet.api(op, a)` — one 21 KB `SECURITY DEFINER` function with ops `claim_owner, save_fleet, save_member, snapshot, submit_action, submit_document, submit_event, submit_inspection, submit_service, team, workspaces`; `fleet.medical_api`; storage policies `storage_access` / `medical_storage_allowed`. Exposed via `public.hlg_fleet_rpc` / `hlg_fleet_medical_rpc` (authenticated only; anon no). Requires verified email + live session. |
| Security | RLS on all 20 tables; no direct grants to API roles (so "not forced" is not an exposure — see `security/stage0/NEW-E_NEW-F_…md`). |
| Data | workspaces 1, members 1, everything else 0 rows. |
| Client | **None in any repository or branch.** `hscs-glp` branches hold only a `fleethuddle-handoff` contract doc and an edge function of that name. |
| Tests | **None.** |

The pilot schema is intact and reachable; it is a backend with no front end and no tests.

## Preservation (Level A — this PR and the next)

1. Archived migrations committed (done on this branch).
2. Promote the 7 fleet/scorecard ledger rows **unchanged** into `supabase/migrations/` in a follow-up PR (owner: FleetHuddle per `schema-owners.md`) so the repo ledger matches production.
3. Add a pgTAP suite for `fleet.api`: one test per op, run against a Supabase branch seeded from the ledger. Target: every op has a happy path, a wrong-role denial, and a cross-workspace denial. Until this exists, no change to `fleet.api`.
4. Capture `fleet.api`'s current op contract (argument shapes read from the function body) into `docs/products/fleethuddle/api-contract.md` so the MVP client is built against what is deployed, not what was intended.

## DVIR MVP (the smallest sellable thing)

A Driver Vehicle Inspection Report is the daily pre-/post-trip checklist US carriers must keep (FMCSA 49 CFR 396.11/396.13 — stated as context, not legal advice). The schema already has `inspections`, `inspection_actions`, `units`, `driver_profiles`, `assignments`, `work_orders`, immutable records and an audit trail: the data model is the hard part and it exists.

Scope:
- **Driver**: sign in → pick assigned unit → checklist (configurable per workspace via `workspaces.policy` jsonb) → defects with photo (`documents`) → signature → submit (`submit_inspection`). Works offline-first on a phone (PWA).
- **Manager**: day view of inspections, open defects → work order (`submit_action` → `work_orders`), close with `submit_service`. Export month as PDF/CSV for an audit.
- **Not in MVP**: fuel, medical cards (schema exists; keep hidden), ELD/HOS, telematics, scorecards.

Build plan (each step a PR; none applies a migration until the pgTAP suite above is green):
1. `apps/fleethuddle` — Next app in this monorepo (same shape as `apps/barbershop`: publishable key only, middleware auth, Dockerfile). Pages: `/inspect`, `/defects`, `/units`, `/team`, `/export`.
2. Only `hlg_fleet_rpc` is called from the client; no new tables for the MVP. If a checklist template store is needed, it lives in `workspaces.policy` first.
3. Tests: component tests for the checklist; e2e against a Supabase branch.
4. Pilot with one carrier workspace (the existing row) for 30 days before any billing (HLG Billing plan, step 5).

## Decisions for the CEO
- Confirm FleetHuddle stays in HL-BOS Core (vs. moving to its own project): recommendation is stay — the shared `identity`/`entitlements`/`comms`/`billing` primitives are there.
- Confirm DVIR as the first slice (vs. maintenance scheduling or fuel).
