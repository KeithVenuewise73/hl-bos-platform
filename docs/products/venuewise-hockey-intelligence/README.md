# Venuewise Hockey Intelligence (VHI) — architecture audit and proposal

**Status:** PROPOSED. Awaiting CEO approval. **Nothing has been built, created, applied or deployed.**
**Date:** 2026-11-24 · **Author:** AI engineer · **Read-only audit:** no repo, project, migration or setting was changed.

Companion documents: [01-database-and-security.md](01-database-and-security.md) (ERD + multi-tenant security) · [02-implementation-plan.md](02-implementation-plan.md) (phases, tests, risks, open questions).

## 0. Two things to know first

1. **The "Build Specification" did not arrive.** No attachment reached this session (`/mnt/attach`, `/mnt/user-data/uploads` and the repo were all searched; nothing matches). Everything below is built from the written brief only. The module list in the plan is therefore **provisional** and must be reconciled against the spec before Phase 1 starts. I have not guessed at what the spec says.
2. **Only part of the GitHub/Supabase estate was auditable.** I read `hl-bos-platform` (full), `homehuddle` and `5star-sports-media` (public, shallow clone), and listed/inspected all four Supabase projects read-only. I did **not** read the private repos (`HSCS-GLP`, `hscs-driver-recruitment`, `characterstudio`) — they are not hockey-related by name, and this session is scoped away from them. Say so if you want them checked.

## 1. What exists today

### 1.1 Repositories (15 on the account)

| Repo | Hockey-relevant content | Verdict |
| --- | --- | --- |
| `hl-bos-platform` | Tenancy/permissions/audit/events/entitlements/billing (migrations 0001–0060), AI gateway, a football analytics schema (`highlight.*`, mig 0049), player/jersey galleries (`jerseysort.*`), a two-camera hockey video cutter (`packages/game-cut`), sport-guess helper (`date-sort`), `HockeyIQ` catalog entry marked **concept, 0 customers** | Source of **patterns**, not of the product |
| `5star-sports-media` | `shared/sql/gametracker-schema.sql` — canonical *schedule and final-score* record; seeds `boys-ice-hockey`, `girls-ice-hockey`; hockey score pages | Partial overlap (schedule/score only). **No player or game events** |
| `homehuddle` (Venuewise Core) | Family/athlete/team calendar, `athlete_stats`/`athlete_sports` (0 rows), workspaces | Different product (family coordination). No hockey engine |
| `coaches-huddle-chrismazzu` | Coach-facing site | Not reviewed in depth; no engine |
| Others (`hscs-*`, `hl-jobscout`, `herman-supply-chain`, `characterstudio`, foundation/community sites) | None | Out of scope |

### 1.2 Supabase (4 projects, one organization)

| Project | Contents | Relevant finding |
| --- | --- | --- |
| **HL-BOS Core** `mvvtngiopdrgiedjmhfb` | Platform/identity/billing/AI + 30+ product schemas in one DB | Remote history has **migrations that are not in this repo** (barberos, jobscout, serviceos, hlg_fleet, playtime_tracker) and **duplicate version numbers** (0048, 0049, 0051, 0055 each appear more than once). Repo migrations 0049 (football), 0050, 0052 are not applied remotely. It is already a shared, drifting database |
| **Venuewise Platform** `urwnbskrtoplgnkkxuvl` | **Live HomeHuddle production** (7 users, 1,167 SMS rows, 313 calendar events) + `gametracker.*` (252 events, 72 schools, 40 sports) | Advisors: **7 ERROR** (`security_definer_view`), **102 WARN** (32 anon- and 70 authenticated-executable SECURITY DEFINER functions), leaked-password protection off. Do not add anything here |
| Herman Legacy Business Platform `bkfsjhhclbqrhaolvhmz` | HLVS research + HSCS-GLP | Unrelated; has open advisories (CLAUDE.md: legacy, do not touch) |
| HSCS Driver Recruitment `mgtvqsxxgqkdppfymznw` | Driver recruiting | Unrelated |

## 2. Reusable functionality

| Need | Existing asset | Reuse how | Gap |
| --- | --- | --- | --- |
| Tenant + role model | `platform.tenants`, `identity.*`, `has_permission()` (0002/0003) | **Copy the pattern**, re-implement in VHI's own project | Tied to HL-BOS auth users and `platform` schema; cannot be shared across a separate licensable product |
| AI result cannot be fabricated | `highlight.*` (0049): no write grants for tenants on AI output; demo-vs-real flag forced by trigger | **Copy the pattern** verbatim for event provenance (`source_kind`, `is_synthetic`) | Football-specific tables |
| Minors' data lock-down | `review.*` (0055): service-role-only schema, forced RLS, private buckets | Copy | — |
| Entitlements / plans | `entitlements.*`, `billing.*` | Copy shape; keep billing **disabled** | Tied to HL-BOS tenants |
| Sport/period/scoring catalog | `gametracker.sports` (`period_label`, `regulation_periods`, `scoring_model`), `sources.trust_rank`, `import_batches` | Reuse **ideas**; seed hockey rows as data | Stores `final score` only. Defaults hard-code `'WNY'`, `'America/New_York'`, school-centric teams. Cannot answer "who assisted on goal 2" |
| Athlete number ↔ identity per season | `jerseysort.players/player_numbers/seasons`, `highlight.players` | Pattern for jersey-per-season (a number belongs to a *roster entry*, not a person) | Photo-centric |
| Two-camera sync / video moments | `packages/game-cut` (offset sync, camera picking, cut list) | Later optional **event-evidence** source (Phase 7). Output must be *candidate* events needing human confirmation | Audio/motion heuristics, unproven (its own hockey-video-plan.md says breakaway detection "unproven") |
| Operator console | `apps/control-center` | VHI status/approvals surface so Keith never needs a terminal (CLAUDE.md rule) | Runs locally; must read VHI status from the new repo |

## 3. Conflicts and duplication

1. **`HockeyIQ` already exists** in `packages/catalog/src/portfolio.ts` and `factory-blueprints.ts` (maturity `concept`, "hockey analytics engine", "player development index" as net-new). Same idea, different name. **Decision needed:** retire `HockeyIQ` as an HL-BOS product and register VHI as an *externally-licensed product with its own repo*, or the portfolio double-counts it.
2. **Two `events` meanings plus two more.** `events.outbox` (HL-BOS), `gametracker.events` (a *game*), `highlight.events` (football play events), `jerseysort.events` (photo events). VHI must name its tables unambiguously: `game` for the contest, `game_event` for something that happened in it.
3. **Two places a hockey game lives:** `gametracker.events` (schedule/score, Venuewise Platform) and the proposed VHI `game`. Without a rule, scores will disagree. Proposed rule: VHI is the **system of record for games it manages**; `gametracker` consumes VHI finals through a one-way export for public score pages (no shared writes).
4. **Hard-coded WNY/NY defaults** in `gametracker` and the HL-BOS gazetteer. Not carried over; VHI has zero literals for any league.
5. **Shared-project drift.** HL-BOS Core already has migrations missing from the repo and duplicate numbers. Adding VHI there would inherit that, and make independent licensing/sale/exit impossible.
6. **`packages/date-sort` `SPORTS`** is an enum of the CEO's personal shooting list — not a sports catalog. Do not depend on it.

## 4. Recommendation

### 4.1 Dedicated repository — **yes**
`KeithVenuewise73/venuewise-hockey-intelligence` (monorepo, own CI, own license file, own release tags).

```
packages/engine        pure TypeScript: event model, validators, stat definitions, rules interpreter. No I/O, no tenant names.
packages/db            migrations + pgTAP tests (project-owned, numbered from 0001)
packages/sdk           typed client + API contracts
apps/web               coach/scorekeeper/league admin
apps/api               edge functions / server routes
packages/synthetic     deterministic synthetic league generator (labelled synthetic in data)
tenants/               configuration examples ONLY (wnyahl.example.json) — never imported by engine
```
**Why:** the brief requires independent commercial licensing. A buyer or licensee must receive a repo with no HL-BOS, HomeHuddle or WNYAHL history in it. Engine-vs-config separation is enforced by a CI lint (`engine` may not import `tenants/`, and a grep gate fails on `wnyahl`/`WNY` literals under `packages/`).

### 4.2 Dedicated Supabase project — **yes, new, not any of the four existing**
Reasons: (a) licensing/sale/data-exit requires a project that can be handed over; (b) it will hold **minors' performance data**, which should not share a blast radius with HomeHuddle production or a drifting 60-migration platform DB; (c) Venuewise Platform has live security errors; (d) clean migration history from 0001.

**This is an infrastructure change and a cost** — I have *not* created it. Approval requested in §6.

### 4.3 Relationship to HL-BOS
VHI is **loosely coupled**: HL-BOS Control Center shows VHI build/test status (read-only status file); HL-BOS catalog lists VHI as a licensed product. No shared database, no shared auth users, no cross-schema FKs.

## 5. Principles baked into the design
- **Event-sourced analytics.** Every number is derived from `game_event` rows; each derived stat stores the IDs (lineage) of the events behind it. No stat without events.
- **Unknown ≠ zero.** A stat that cannot be computed from recorded data is `NULL` with a `reason_code` (e.g. `no_shift_data`), never `0`. Plus/minus requires on-ice tracking; save% requires shots-against recorded. UI shows "Not recorded".
- **Provenance on every event:** `source_kind` (`scorekeeper`, `official_sheet`, `import`, `video_candidate_confirmed`, `synthetic`), who, when, evidence reference.
- **Corrections append, never overwrite.** A correction is a new event that supersedes the old; history is kept.
- **Synthetic is structural.** `tenant.data_class` ∈ {`synthetic`,`production`}; a trigger blocks synthetic rows in production tenants and vice versa. UI badges synthetic data.
- **Rules are data.** Period count/length, overtime, penalty catalog, points system, age-division rules live in versioned `rule_set` rows per tenant/division.

## 6. Decisions requested from Keith (plain English)
1. **Approve a new GitHub repository** `venuewise-hockey-intelligence` (empty, private).
2. **Approve a new Supabase project** for it (extra monthly cost — current org is on Pro; a new project is billed separately, amount shown at creation). Nothing is applied to any existing project.
3. **Retire `HockeyIQ`** as a separate HL-BOS concept in favour of VHI? (Default: yes.)
4. **Send the specification again** (it did not arrive) — or tell me to proceed on the brief alone and reconcile later.
5. **Confirm licensing shape** (per league / per team / per season) so entitlements are modelled correctly. Default until told: per-organization subscription, billing **disabled**.
