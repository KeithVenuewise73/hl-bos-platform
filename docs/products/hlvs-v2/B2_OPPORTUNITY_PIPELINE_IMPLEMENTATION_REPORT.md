# HLVS V2 · B2 — Opportunity Intelligence Pipeline (Implementation Report)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Branch:** `claude/hlvs-v2-opportunity-pipeline` (stacked on B1) · **Migration 0031 UNAPPLIED.**

## What was built (inside Venture Studio — no new app)

The Opportunity Intelligence Pipeline: **Opportunity Inbox, Research Queue, AI Research Requests, Source Tracking, Opportunity Relationships, Automatic Duplicate Detection, AI Opportunity Summaries, and an Executive Priority Queue** — all reachable at `/pipeline` in the existing app.

## Reuse map (assemble, do not rebuild)

- **Reused unchanged:** `vstudio.opportunities` (the Inbox), identity/permissions (`vstudio.opportunity.read`/`.manage` — **no new permission key**), `ai.runs` (summary provenance), `events.emit`, `@hl-bos/catalog` (`analyzeReuse`), the app shell / honest-state pattern; and — by architecture — `integrations` (connector registry), `discovery` (collectors), `workflows` (research review), `graph` (future relationship projection).
- **Net-new (thin, additive):** migration 0031 (`relationship_type` enum; `opportunity_relationships`; non-authoritative `opportunity_summaries` with honest estimates; `source_connector`/`external_ref`/`priority_score`/`priority_tier` on opportunities; 3 RPCs), the pure `pipeline.ts` module (connector registry, `detectDuplicates`, `computePriority`, `assembleDiscovery`) + tests, the `/pipeline` page, one API route, one form control.
- **NOT built:** no new app, no live external calls, no fabricated discoveries, no new connector system (reuses `integrations`), no new AI gateway (reuses `ai`).

## Database — migration 0031 (UNAPPLIED)

`supabase/migrations/20260802130000_hlbos_0031_opportunity_pipeline.sql` — purely additive:

- `vstudio.relationship_type` enum (`duplicate_of`/`related_to`/`supersedes`/`depends_on`/`merged_into`).
- `vstudio.opportunity_relationships` (directed, unique per pair+type, self-relation rejected).
- `vstudio.opportunity_summaries` — AI summary, **non-authoritative** (`CHECK authoritative = false`), estimates carry measured/estimated/unknown status, `ai.runs` provenance.
- `vstudio.opportunities` gains `source_connector`, `external_ref` (unique per connector — dedup), `priority_score` (0..100), `priority_tier`.
- 3 `SECURITY DEFINER` RPCs (`relate_opportunities`, `record_opportunity_summary`, `set_opportunity_priority`), gated on `vstudio.opportunity.manage`, `search_path=''`, event-emitting.
- RLS forced + `vstudio.opportunity.read` select policy + anon-denied on both new tables.
- pgTAP: `supabase/tests/24_opportunity_pipeline.sql` (9 assertions).

**UNAPPLIED** — applying it to production is a separate CEO-approved step.

## Connectors (11, stubbed)

Defined in `OPPORTUNITY_CONNECTORS` (code registry): GitHub, Reddit, Product Hunt, Hacker News, Acquire.com, AppSumo, Microns.io, Flippa, Grants.gov, USPTO, Google Patents. Each maps to an Intelligence Program + credential type + integration style. All **stubbed** — no credential, no live calls. Adding one is a registry entry + a `discovery` collector; no redesign.

## Verification actually run (locally)

- `pnpm check` — **PASS**: format, lint, typecheck (11 projects), lineage (**31 migrations**, checksum-locked), **407 unit tests** (incl. new `pipeline.test.ts`).
- `pnpm build` — **PASS**: 7/7 apps; `apps/venture-studio` standalone builds with the `/pipeline` route.
- Migration governance — `check-migrations` + `check-lineage` **PASS**.
- **pgTAP (`24_opportunity_pipeline.sql`) is CI-verified**, not run locally (Supabase CLI unavailable; DB tests run in CI against an ephemeral database, never production).

## Honesty & governance

- AI summaries + the Build/Acquire/Partner/Ignore recommendation are **advisory only** (DB CHECK); the CEO decision (0029) remains the sole authoritative act.
- Estimates never fabricate a number (measured/estimated/unknown). Duplicate detection and priority scoring are **deterministic**.
- Additive only; TypeScript pinned 6.0.3; no new permission key. Stacked on B1 (PR #25) so the migration lineage 0029→0030→0031 stays intact.

## Boundary

No deploy, no API exposure, migration 0031 UNAPPLIED. PR opened, **not merged**.
