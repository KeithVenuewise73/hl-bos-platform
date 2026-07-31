# Venuewise Backend Harvest · 03 — Commercialization Matrix & Maturity

**READ-ONLY harvest.** Two grids: (A) which commercialization layers each capability _could_
support (Commercialization Law #1 — capability **potential**, not a plan or sequence), and
(B) an evidence-based maturity assessment. No planning, no recommendations.

## A. Commercialization Matrix (capability × layer)

Layers: **L1** Internal HL Operations · **L2** HL-BTI Transformation · **L3** Standalone SaaS
· **L4** Licensed / API / White-label · **L5** Factory Assembly.
✓ = can support · ~ = partial/conditional · — = not a fit.

| Capability                         | L1  | L2  | L3  | L4  | L5  |
| ---------------------------------- | :-: | :-: | :-: | :-: | :-: |
| Identity & Access (phone-first)    |  ✓  |  ~  |  —  |  ✓  |  ✓  |
| Multi-tenant Workspaces & Branding |  ✓  |  —  |  —  |  ✓  |  ✓  |
| Scheduling & Unified Calendar      |  ✓  |  ~  |  ✓  |  ✓  |  ✓  |
| Messaging: SMS + Reminders         |  ✓  |  ~  |  ✓  |  ✓  |  ✓  |
| Push & Feed Notifications          |  ✓  |  —  |  ~  |  ✓  |  ✓  |
| Payments & Subscriptions (Stripe)  |  ✓  |  —  |  ~  |  ✓  |  ✓  |
| Forms Engine                       |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| Documents Engine                   |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| Workflow Engine                    |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| Analytics & Platform Status        |  ✓  |  ~  |  ~  |  ~  |  ✓  |
| CRM / Lead Capture                 |  ✓  |  ✓  |  ~  |  ~  |  ✓  |
| Administration & Moderation        |  ✓  |  —  |  —  |  —  |  ✓  |
| Family Management                  |  ~  |  —  |  ✓  |  ~  |  ✓  |
| Athlete Development                |  ~  |  —  |  ✓  |  ✓  |  ✓  |
| Coach Management                   |  ~  |  —  |  ✓  |  ✓  |  ✓  |
| Team & Roster Management           |  ~  |  —  |  ✓  |  ~  |  ✓  |
| Facility Management & Booking      |  ~  |  —  |  ✓  |  ✓  |  ✓  |
| Clinics & Academy Registration     |  ~  |  —  |  ✓  |  ~  |  ✓  |
| Organization Directory             |  ~  |  —  |  ✓  |  ✓  |  ✓  |
| Media Operation (5-Star)           |  ~  |  —  |  ✓  |  ✓  |  ✓  |
| Public Directories / Games Board   |  —  |  —  |  ~  |  ✓  |  ✓  |

**Reading (not a plan):** the **horizontal engines** (forms, documents, workflow, scheduling,
messaging, payments, identity) score across the widest range of layers; the **sports-vertical
capabilities** cluster on L3 (standalone SaaS) and L5 (assembly). **Every** discovered
capability can serve **L5 (Factory assembly)** — each is a composable building block.

## B. Maturity Assessment (evidence-based)

Evidence = live row counts + build completeness + automation observed on 2026-07-31.

| Capability                       | Maturity              | Evidence                                                                                                              |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Identity & Access                | **Production**        | 7 users, phone+email providers, `verify-phone` fn + trigger live                                                      |
| Scheduling & Calendar            | **Production**        | `calendar_events` 93, `events` 118; 2 cron jobs refreshing/syncing                                                    |
| Messaging: SMS + Reminders       | **Production**        | **`sms_outbox` 284 sent**, `reminders` 30; cron every 2 min                                                           |
| Family Management                | **Production**        | families/members/`family_events` populated (7 members)                                                                |
| Payments & Subscriptions         | **Production**        | full Stripe suite (checkout/portal/webhook) active; `subscriptions` 1                                                 |
| Analytics & Status               | **Production**        | `page_views` **703**; `platform_status` refreshed every 10 min                                                        |
| Workflow Engine                  | **Production-tested** | `workflow_events` 52 (it has executed); templates/instances built                                                     |
| Administration & Moderation      | **Production**        | admin fns + anti-spam triggers active on 7 tables                                                                     |
| Athlete Development              | **Functional**        | `athlete_events` 51; full profile/goal/stat/video model + RPCs built                                                  |
| Facility Management & Booking    | **Functional**        | `bookings` 3, `open_slots` 2; full facility model built                                                               |
| Team & Roster                    | **Functional**        | `players` 3, `player_teams` 2; model + featured RPC built                                                             |
| Coach Management                 | **Functional**        | `coaches` 1 (33-column profile); connections + featured RPC built                                                     |
| Workspaces & Branding            | **Functional**        | full workspace/branding/roles/services model; low data                                                                |
| Forms Engine                     | **Functional**        | templates/sections/fields/submissions + draft/submit fns + edge API; 0 submissions                                    |
| Documents Engine                 | **Functional**        | templates/versions/approvals + generate/download/approve edge API; 0 docs                                             |
| Push & Feeds                     | **Functional**        | VAPID keys set; `send-notifications`; `push_subscriptions` 1                                                          |
| CRM / Leads                      | **Functional**        | `leads` table + RLS; 0 rows                                                                                           |
| Clinics & Academy                | **Functional**        | full academy model (apps/assignments/mentorship/permissions) + admin fns; 0 rows                                      |
| Organization Directory           | **Functional**        | org + athletes/coaches/events + featured RPC; low data                                                                |
| Media Operation (5-Star)         | **Partial**           | `spotlights` 1 + full media-review pipeline (6 submission types, `media_*` fns, public bucket); most content tables 0 |
| Public Directories / Games Board | **Functional**        | public RPCs built; depend on athlete/media data volume                                                                |
| AI / generic processors          | **Unknown**           | 3 edge fns; purpose not determinable from metadata (source not read)                                                  |
| `_leagueapps_uid_backup`         | **Retired**           | 0 rows, 0 policies — import artifact                                                                                  |

### Maturity headline

- **8 capabilities are genuinely in production** (live data + running automation): identity,
  calendar, SMS, family, payments, analytics, workflow, admin.
- **~11 capabilities are fully built and functional**, awaiting usage/data (forms, documents,
  workspaces, athlete/coach/team/facility, clinics/academy, organizations, CRM, push).
- **1 partial** (media operation — pipeline built, content sparse); **3 unknown** (AI edge
  fns); **1 retired** (import backup).
- **Overall:** a **mature, migration-managed (73 migrations), fully-RLS'd, cron-automated**
  backend — not a prototype. The engines are complete; several verticals simply await
  customers/data.
