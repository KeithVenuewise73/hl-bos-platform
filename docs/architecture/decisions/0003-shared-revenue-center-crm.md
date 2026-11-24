# ADR-0003 — Shared HLG Revenue Center CRM (proposal)

**Status:** PROPOSED — awaiting CEO approval. Nothing below is built or applied.
**Date:** 2026-11-24 · **Author:** Claude (engineering) · **Decision owner:** Keith

## 1. Baseline (verified 2026-11-24)

- Repo `KeithVenuewise73/hl-bos-platform`, branch `claude/new-session-h0n95y`, base commit `6a0a397`. Migrations 0001–0060 exist; next is **0061**.
- **No CRM pilot exists.** The Venuewise Hockey Intelligence Revenue Center is a ChatGPT prototype with no repo or database (CEO, 2026-11-24). There are therefore no pilot tests to run, no pilot stages or pricing history to migrate from code, and no pilot behavior to preserve. The "pilot" is built here first, as the first configured workspace.
- Venuewise Platform Supabase (`urwnbskrtoplgnkkxuvl`) has a 21-row `leads` table, `business_workspaces` (5 rows) and `workspace_members`. **Out of scope: not read further, not modified, not repurposed.**
- Not supplied: Venuewise-Claude-Build-Spec.md, HLG-Revenue-Center-Claude-Build-Brief.md, HLG-Revenue-Center-Claude-Handoff.zip, and any ChatGPT research exports. The design below is from the handoff alone and must be checked against them.

## 2. What HL-BOS already gives us (reuse map)

| Need | Existing, reusable | Verdict |
| --- | --- | --- |
| Tenancy, roles, permission checks (`identity.has_permission`), invitations | migrations 0002–0006, 77+ pgTAP tests | **Reuse.** CRM RLS calls the same functions. |
| Audit trail (append-only, `audit.emit()`) | 0004 | **Reuse** via trigger on every CRM table. |
| RLS coverage verifier (`audit.verify_rls_coverage`) | 0004 | **Reuse** as a CI gate for the `crm` schema. |
| Idempotent queue with `FOR UPDATE SKIP LOCKED`, claim token, retry, dead-letter | `events.claim_deliveries` / `complete_delivery` (0009, 0021) | **Reuse the pattern.** Add lease expiry (not present today) in a CRM-owned `crm.review_jobs`. |
| Dedupe, name/address normalisation, CSV import, qualification, export | `packages/presence-scanner` (`dedupe.ts`, `normalize.ts`, `import.ts`, `qualify.ts`, `export.ts`) | **Reuse and generalise** for HLG Digital/BTI. Currently stores to JSON files, not a DB. |
| HLG Digital offer builder, 50-per-industry setting | `presence-scanner` + `site-builder` + control-center `/presence` | **Wire in** as the HLG Digital workspace config. Exact catalog inputs to be confirmed in code before mapping. |
| Consent, suppression, message templates (outreach gate) | `comms.*` (0019) | **Reuse** for the explicit-approval step. |
| Proposals, prices, agreements | `sales.*` (0024), never applied live | **Do not reuse for prospect-stage proposals.** `sales.*` is post-sale commerce. CRM owns prospect proposals; a won deal can create a `sales.*` record later. |
| Evidence model | `discovery.evidence` (0020) | **Partial.** CRM needs fact/inference/unknown typing and source URL and date; own table, same naming. |
| UI | `apps/control-center` is local-only and is the CEO console | **Do not host the CRM there.** New app. |

## 3. Recommended architecture

**Code:** this monorepo. New `packages/revenue-crm` (domain logic, config schema, import/dedupe, scoring runner, tests) and `apps/revenue-center` (Next.js UI). Workspace config lives as versioned JSON in `packages/revenue-crm/workspaces/<slug>/`.
**Caveat:** `hl-bos-platform` is a **public** repo. Only code, config and synthetic fixtures go in it. No real prospects, exports or pricing ever. If you want the code private as well, the alternative is a new private repo; I recommend against it because it forks the identity and audit code we are reusing.

**Data:** a new `crm` schema inside **HL-BOS Core** (`mvvtngiopdrgiedjmhfb`), not a separate Supabase project. This deviates from the handoff's default (dedicated project). Reason: a dedicated project cannot call `identity.has_permission`, audit or the queue, so we would copy and then maintain a second identity system. Tenant isolation and workspace isolation are enforced by RLS either way. Trade-off: CRM shares a database with other products; mitigated by schema separation, its own roles, and the RLS coverage gate. **Decision 1 for you.**

**Boundary with Venuewise Hockey Intelligence software:** none in the database. The CRM holds only a stable `external_ref` (e.g. a league ID) pointing out. Scoring, scouting, bookings, fleet and driver files stay in their products.

## 4. Database design (migration 0061, local only until approved)

Tenant = HLG (existing `platform.tenants`). All tables carry `tenant_id` and, where relevant, `workspace_id`, with composite foreign keys `(tenant_id, workspace_id)` so a row cannot point across a boundary.

- **Workspaces:** `crm.workspaces`, `crm.workspace_members` (+ roles map to `identity` permissions `crm.<resource>.<action>`, checked by `crm.has_ws_permission(workspace, permission)`), `crm.workspace_configs` (versioned: segments, geography, intake questions, criteria, labels, review template, schedule), `crm.pipelines`, `crm.pipeline_stages`, `crm.offer_catalog` (one-time fee and recurring fee as separate columns).
- **Shared records:** `crm.organizations` (account, tenant-wide, dedupe key), `crm.contacts`, `crm.workspace_prospects` (an organization's presence in a workspace), `crm.opportunities` (many per organization, one workspace each; `stage_id`, `status`), `crm.stage_history` (append-only).
- **Evidence and review:** `crm.evidence` (source URL, observed date, `kind` in `fact|inference|unknown`, verification status, value), `crm.reviews` (config version, scoring/template version, basis, recommendation, reviewer, human override with history), `crm.review_jobs` (idempotency key unique, `claimed_by`, `lease_expires_at`, `attempts`, `last_error`, `status`; functions `crm.enqueue_review`, `crm.claim_review`, `crm.complete_review`, `crm.reap_expired_leases`).
- **Selling:** `crm.proposals` (status separate from fees; `one_time_cents`, `recurring_cents`, `recurring_interval`; approval required before any send), `crm.proposal_lines`, `crm.tasks`, `crm.notes`, `crm.activities`.
- **Import:** `crm.import_batches` (dry-run flag, source system, counts expected/created/updated/duplicate/orphan, rollback via `batch_id` on every imported row), `crm.import_rows` (source ID, raw payload, outcome).
- **Portfolio view:** `crm.portfolio_counts` as a `security_invoker` view, so it only sums workspaces the viewer belongs to.
- Audit trigger on every table; RLS enabled on every table; pgTAP tests for cross-tenant, cross-workspace, simultaneous intake, repeat import, lease recovery.

## 5. Workspaces as configuration (no per-workspace code)

Venuewise Hockey Intelligence, HLG Digital/BTI, HSCS Consulting, WNY Sports/5-Star, WNY Hockey are five config packages. Differences (segments, intake questions, criteria, review template, offers) are data. HSCS keeps fleet size and operational gaps `unknown` until evidence is attached. A shared organization (e.g. a rink) can hold one opportunity in WNY Hockey and another in Hockey Intelligence.

## 6. Ingest of ChatGPT scheduled-task research

An importer accepts CSV/JSON with a `source_id` per row, runs as dry-run first, reports duplicates and orphans, reconciles counts, and can roll back a batch. **I need one sample export per workspace to fix the column mapping.** Until then I write the importer against synthetic fixtures only.

## 7. Build order after approval

1. Migration 0061 + pgTAP, run locally. 2. `packages/revenue-crm` with import, dedupe and review worker. 3. `apps/revenue-center` board, account, evidence, follow-ups, reports. 4. Hockey workspace end to end on fixtures. 5. HLG Digital (reusing presence-scanner). 6. HSCS by config only. 7. WNY Sports and WNY Hockey. 8. Staging run, handoff log, draft PR.
**Not done without separate approval:** applying any migration anywhere, creating a Supabase project, switching any schedule, sending any outreach or proposal.

## 8. Decisions needed

1. **Schema in HL-BOS Core** (recommended) vs dedicated CRM Supabase project (handoff default).
2. **Code in this public repo** (recommended; synthetic data only) vs a new private repo.
3. Confirm proposals stay in `crm.*` and do not use `sales.*` until a deal is won.
4. Provide the missing spec/brief/zip and one sample ChatGPT export per workspace.
