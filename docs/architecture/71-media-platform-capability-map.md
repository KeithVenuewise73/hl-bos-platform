# Checkpoint 8B — Shared Media Platform Capability Map & Venuewise Product Boundary

**Date:** 2026-07-27 · **Checkpoint:** 8B · **Method:** synthesis of the verified evidence (docs 67–70). No legacy asset altered.

> **Covers required deliverables 15 (Shared media-platform capability map) and 16 (Venuewise product boundary — what stays vs. what moves).** Evidence base: [Venuewise & Huddle Evidence](68-venuewise-huddle-evidence.md) · [Duplicate & Unsafe Report](69-duplicate-and-unsafe-legacy-report.md) · [Video-AI Audit](70-highlightai-broadcastai-evidence-audit.md).

## 1. Shared media-platform capability map (deliverable 15)

The estate is **one shared media/community platform** (Venuewise Core + 5 Star Sports Media) on a single Supabase backend. Mapping every verified capability to where it should live and how HL-BOS treats it:

| Capability                               | Verified today                                                                 | HL-BOS treatment                         | Classification               |
| ---------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------- |
| **Identity / auth**                      | Supabase Auth + `users_profile` + `is_admin()`                                 | `identity` spine (built)                 | reuse HL-BOS                 |
| **Tenancy / workspaces**                 | planned only (VPS §4)                                                          | `platform` tenancy (built)               | reuse HL-BOS / convergence   |
| **Community: families/athletes/coaches** | `families`, `athletes`, `coaches` (+ live `players`, `player_teams`)           | re-implement on spine                    | adapt_before_migration       |
| **Organizations/clubs**                  | `organizations`, `organization_*`                                              | re-implement on spine                    | adapt_before_migration       |
| **Facilities & booking**                 | `facilities`, live `bookings`/`open_slots`/`facility_events`/`calendar_events` | re-implement on spine                    | adapt_before_migration       |
| **Events / calendar**                    | `events`, `organization_events`, `calendar_event_participants`                 | re-implement (+ `events` infra distinct) | adapt_before_migration       |
| **Media library (photos)**               | `game_day_photos`, `photo_galleries` + Supabase Storage                        | `storage_meta` + media domain            | adapt_before_migration       |
| **Media library (video)**                | `videos` = **YouTube links only** (no processing)                              | media domain (links)                     | adapt_before_migration       |
| **Editorial / CMS / spotlights**         | `spotlights`, `articles`, `*_spotlight_submissions`, `cms-schema.sql`          | content domain (`comms`)                 | adapt_before_migration       |
| **Sponsors**                             | `sponsors`                                                                     | commercial domain                        | adapt_before_migration       |
| **Leads / intake**                       | `leads`, submissions, `game_coverage_tips`                                     | `discovery`/`sales` intake               | adapt_before_migration       |
| **Analytics**                            | `page_views`, `analytics_data`                                                 | `audit`/`events`                         | reuse HL-BOS (re-instrument) |
| **Academy**                              | `academy-schema.sql` (6 tables), `academy_members`, `clinic_registrations`     | new product                              | adapt_before_migration       |
| **Podcast**                              | `podcast_episodes`, `/podcast/`                                                | content domain                           | adapt_before_migration       |
| **Payments**                             | planned engine (VPS §3)                                                        | `billing` (built)                        | reuse HL-BOS                 |
| **Messaging**                            | planned engine (VPS §3)                                                        | `comms` (built)                          | reuse HL-BOS                 |
| **HighlightAI (video AI)**               | **absent** (doc 70)                                                            | **greenfield** on HL-BOS                 | new_build                    |
| **BroadcastAI (live video)**             | **absent** (doc 70)                                                            | **greenfield** on HL-BOS                 | new_build                    |
| **LeagueApps import**                    | `_leagueapps_uid_backup` (live)                                                | one-time data migration                  | retain_in_venuewise          |

**Reading of the map:** the platform-plane capabilities (identity, tenancy, events, billing, messaging, audit, storage) are **already HL-BOS's** — Venuewise duplicates them and should eventually _consume_ HL-BOS, not be copied in. The domain capabilities (community, facilities, events, media, editorial, academy, podcast) are **requirements to re-implement**. The two AI products (Highlight/Broadcast) are **genuinely greenfield**.

## 2. Venuewise product boundary — stays vs. moves (deliverable 16)

The boundary is drawn to honor the VPS **Prime Directive** ("HomeHuddle production is Priority #1; never destabilize it") **and** the HL-BOS constraint that unsafe patterns never migrate.

### Stays in Venuewise (for now) — `retain_in_venuewise`

- **The live `venuewise.net` and `5starsportsmedia.com` sites and their traffic.** They are production; CP8B changes nothing about them.
- **The live shared Supabase project `urwnbskrtoplgnkkxuvl`** and all live data, until an approved migration exists.
- **The LeagueApps backup** and any live-only tables.
- **Every page's current anon-key data path** until its capability is re-implemented on HL-BOS and the page is re-pointed — one consumer at a time (mirrors VPS's own "migrate one consumer at a time" rule).

### Moves to HL-BOS (as re-implemented capability, on approval) — `migrate_to_hlbos` / `adapt_before_migration`

- The **domain capabilities** in §1 (community, organizations, facilities/booking, events, media, editorial/CMS, sponsors, leads, academy, podcast), rebuilt with RLS+FORCE, permission-checked writes, and tenant isolation.
- The **platform concerns** (identity, tenancy, events, billing, messaging, analytics) are _already_ in HL-BOS; "moving" here means **Venuewise adopting HL-BOS**, not code transfer.

### Greenfield in HL-BOS — `new_build`

- **HighlightAI** and **BroadcastAI** — nothing to move; build fresh under the deterministic-engine + advisory-AI pattern.

### The boundary decision that is the CEO's, not engineering's

Whether the endgame is **convergence** (Venuewise Core dissolves into HL-BOS tenants/products) or **coexistence** (two platforms, one federating to the other). Engineering's recommendation and the trade-offs are in the [CEO Decision Report](73-checkpoint8b-ceo-decision-report.md); the migration ordering that either path would follow is in the [Migration Sequence](72-hlvs-catalog-registration-and-migration-sequence.md). **Neither is executed in CP8B.**
