# Checkpoint 8B — Venuewise & Huddle Evidence Report

**Date:** 2026-07-27 · **Checkpoint:** 8B · **Method:** read-only inspection of committed source in `homehuddle` (→ `venuewise.net`) and `5star-sports-media` (→ `5starsportsmedia.com`). No legacy asset altered.

> **Covers required deliverables 4 (Venuewise system evidence), 5 (Huddle product evidence), 6 (Huddle capability extraction matrix), and 7 (HL-BOS migration-candidate map).** Prerequisite context is in the [Reuse & Evidence Analysis](67-checkpoint8b-legacy-asset-discovery-reuse-analysis.md).

## 1. Venuewise system evidence (deliverable 4)

**Venuewise is real, live, and actively evolving — not a concept.** The evidence is committed source, not planning prose:

| Evidence                                          | What it proves                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `homehuddle/CNAME` = `venuewise.net`              | The `homehuddle` repo **is** the deployed Venuewise site.                                                                                                                                                                                       |
| `homehuddle/ARCHITECTURE.md`                      | Declares **"Venuewise Core"**: "the shared, multi-tenant coordination platform that powers Herman Legacy Group businesses, the Huddle products, and future partner organizations… Branded experiences on the surface; one platform underneath." |
| `homehuddle/docs/README.md`                       | A governing document stack: **Venuewise Platform Specification (VPS) v1.0** ("the constitutional document"), Master Architecture v1.0, Phase-1 Architecture & Safety Plan.                                                                      |
| `homehuddle/docs/security/rls-baseline.md`        | A **read-only `pg_policies` capture of the live production project `urwnbskrtoplgnkkxuvl`** — real live-state evidence (see §Live-state below).                                                                                                 |
| `homehuddle/docs/runbooks/deploy-and-rollback.md` | A `live`-branch promotion model (Pages served from `live`; `main` is the working branch; `git merge --ff-only` promotes).                                                                                                                       |
| `shared/config.js` (both repos)                   | A shared `VENUEWISE_CONFIG` — Supabase project `urwnbskrtoplgnkkxuvl` + a public **anon** key + a product registry (HomeHuddle, AthleteHuddle, CoachesHuddle, OrganizationHuddle, FacilityHuddle, 5 Star Sports Media).                         |

**Architecture (verified from committed source):** GitHub-Pages static HTML/CSS/vanilla-JS front ends; **one shared Supabase project** (`urwnbskrtoplgnkkxuvl`) reached directly from the browser via the anon key + PostgREST; Supabase Auth for authenticated users; Supabase Storage for photo/video uploads; a `service_role` bypass for Edge Functions (referenced in `rls-baseline.md`). No SPA framework, no build step, no server tier of its own.

**Venuewise Core is the same problem HL-BOS solves.** VPS §2/§4 plan **logical tenancy** — `workspace_id` + RLS, "introduced additively in later waves." That is the _identical_ goal as the HL-BOS `platform`/`identity` tenancy spine, approached from the opposite direction: Venuewise Core is retrofitting multi-tenancy onto a live static estate; HL-BOS built it first. **This overlap is a CEO-level convergence decision, not an engineering one** — see the [CEO Decision Report](73-checkpoint8b-ceo-decision-report.md).

### Live-state evidence vs. intended-schema evidence

Two distinct evidence tiers — do not conflate them:

- **Intended schema (committed SQL):** `5star-sports-media/shared/sql/` — 7 files, ~38 tables (see §2). This is what the team _wrote_.
- **Live production state (captured, not directly reachable by this session's token):** `homehuddle/docs/security/rls-baseline.md` records, from a real `pg_policies` query, that the **live** project has additional tables beyond the committed schema (`admin_users`, `bookings`, `facilities`, `facility_areas`, `facility_events`, `open_slots`, `calendar_events`, `calendar_event_participants`, `academy_members`, `clinic_registrations`, `players`, `player_teams`, `family_players`, `story_submissions`, `analytics_data`, `coach_connections`, `_leagueapps_uid_backup`), helper functions `current_family_ids(bool)`, `current_family_emails()`, `is_admin()`, and a `service_role` Edge-Function bypass. The `_leagueapps_uid_backup` table indicates a **LeagueApps** data import/integration in the live system's history.

The **live project itself remains unreachable** by the Supabase MCP token available here (§4 of doc 67). Live table data, current live RLS, Storage buckets, and Edge Functions are therefore **known only through this committed capture**, not independently re-verified now.

## 2. Huddle product evidence (deliverable 5)

All "Huddle" products are **workspaces/paths inside `homehuddle` on the one shared backend**, not separate applications or repos:

| Product                 | Evidence (verified)                                                                                                            | Form                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **HomeHuddle**          | `/homehuddle/` (26 HTML), root pages, `sw.js` PWA                                                                              | Family/athlete community hub — the flagship                                                              |
| **AthleteHuddle**       | `config.js` registry id `athletehuddle` → `family--athlete.html`                                                               | A **path/persona**, not a standalone app; `athletes` table                                               |
| **CoachesHuddle**       | `/coacheshuddle/` (11 HTML); `coacheshuddle-schema.sql`; separate repo `coaches-huddle-chrismazzu` (a variant, **not cloned**) | Coach-facing pages + `coaches` table                                                                     |
| **OrganizationHuddle**  | `/organizationhuddle/` (8 HTML); `organizationhuddle-schema.sql` + `organizationhuddle-phase1-schema.sql`                      | Org/club pages + `organizations`, `organization_athletes`, `organization_coaches`, `organization_events` |
| **FacilityHuddle**      | `/facilityhuddle/` (2 HTML); `facilities` table + live `bookings`/`open_slots`/`facility_events`                               | Facility booking (thinnest UI, real live booking tables)                                                 |
| **5 Star Sports Media** | separate repo `5star-sports-media` → `5starsportsmedia.com`                                                                    | Sports-media site + Academy + podcast, **same shared backend**                                           |

**Not found as products/systems in the accessible estate** (restating doc 67 §2, for completeness): `HighlightAI`, `HighlightHuddle`, `BroadcastAI`, `CoachAI`, `TournamentHuddle`. See the [HighlightAI & BroadcastAI Evidence Audit](70-highlightai-broadcastai-evidence-audit.md).

## 3. Huddle capability extraction matrix (deliverable 6)

Capabilities present in the legacy estate (from committed schema + pages), each classified against the §7 vocabulary of doc 67. **"Reuse code" is never a value** — legacy is static-site + anon-key + no-FORCE (see [Duplicate & Unsafe Report](69-duplicate-and-unsafe-legacy-report.md)); the reusable asset is the **domain model and requirements**, re-implemented on the HL-BOS spine.

| #   | Legacy capability                     | Evidence                                                                         | HL-BOS home                                       | Classification                                    |
| --- | ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| 1   | Identity / user profiles              | `users_profile`, Supabase Auth, `is_admin()`                                     | `identity` schema                                 | `reuse_existing_hlbos` (HL-BOS is stronger)       |
| 2   | Families / athletes / coaches         | `families`, `athletes`, `coaches`, `family_players`                              | new `visibility`/tenant domain tables             | `adapt_before_migration`                          |
| 3   | Organizations / clubs                 | `organizations`, `organization_*`                                                | tenant domain                                     | `adapt_before_migration`                          |
| 4   | Facilities & booking                  | `facilities`, `bookings`, `open_slots`, `facility_events`, `calendar_events`     | new capability on HL-BOS spine                    | `adapt_before_migration`                          |
| 5   | Events / calendar                     | `events`, `organization_events`, `calendar_event_participants`                   | tenant domain + `events` infra (distinct concern) | `adapt_before_migration`                          |
| 6   | Media (photos/videos)                 | `game_day_photos`, `photo_galleries`, `videos` (YouTube links), Supabase Storage | `storage_meta` + new media domain                 | `adapt_before_migration`                          |
| 7   | Spotlights / editorial CMS            | `spotlights`, `articles`, `spotlight_submissions`, `cms-schema.sql`              | new `comms`/content domain                        | `adapt_before_migration`                          |
| 8   | Sponsors                              | `sponsors`                                                                       | new commercial domain                             | `adapt_before_migration`                          |
| 9   | Leads / intake forms                  | `leads`, `*_spotlight_submissions`, `game_coverage_tips`                         | `discovery`/`sales` intake                        | `adapt_before_migration`                          |
| 10  | Analytics / page views                | `page_views`, `analytics_data`                                                   | `audit`/`events` + analytics                      | `reuse_existing_hlbos` (re-instrument)            |
| 11  | Academy                               | `academy-schema.sql` (6 tables), `academy_members`                               | new product on HL-BOS                             | `adapt_before_migration`                          |
| 12  | Podcast                               | `podcast_episodes`, `/podcast/`                                                  | new content domain                                | `adapt_before_migration`                          |
| 13  | Multi-tenant workspace platform (VPS) | `ARCHITECTURE.md`, VPS §2/§4                                                     | **`platform`/`identity` — already built**         | `reuse_existing_hlbos` / **convergence decision** |
| 14  | Payments/messaging (planned engines)  | VPS §3 names Payments, Messaging                                                 | `billing`, `comms` — already built                | `reuse_existing_hlbos`                            |
| 15  | LeagueApps import                     | `_leagueapps_uid_backup`                                                         | one-time data migration concern                   | `retain_in_venuewise` until convergence           |

## 4. HL-BOS migration-candidate map (deliverable 7)

Grouping the matrix into **what HL-BOS should own vs. what stays in Venuewise**, with the driving reason:

- **HL-BOS already owns (no migration of code — Venuewise should eventually consume HL-BOS):** identity/auth, tenancy/workspaces, events infrastructure, billing, messaging, audit/analytics plumbing, file metadata. Legacy versions are weaker (anon-key, no FORCE, single shared project) — **never copy them in.**
- **Migration candidates (domain re-implementation on HL-BOS, `adapt_before_migration`):** families/athletes/coaches, organizations, facilities & booking, events/calendar, media, spotlights/CMS, sponsors, leads intake, academy, podcast. These are **requirements to re-express**, not code to lift.
- **Retain in Venuewise for now (`retain_in_venuewise`):** the live production site itself (Priority #1 per VPS — "never destabilize"), the LeagueApps backup, and every live page until an approved convergence sequence exists (see [Migration Sequence](72-hlvs-catalog-registration-and-migration-sequence.md)).
- **CEO convergence decision (not classifiable by engineering):** whether Venuewise Core and HL-BOS **converge** (Venuewise becomes a set of HL-BOS tenants/products) or **coexist** (two platforms). Both are running the same play; only the CEO can decide which one is the platform of record.

**Nothing here is executed in CP8B.** This is a candidate map for CEO review, not a migration.
