# Venuewise Backend Harvest — Executive Summary & Software Factory Harvest

**Project inspected:** `urwnbskrtoplgnkkxuvl` ("Venuewise Platform", Postgres 17, us-east-1)
**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**READ-ONLY backend harvest.** Nothing was modified, written, deployed, or migrated; no
schemas/RLS/edge functions/env changed; no secret values were read. **No comparison to any
other platform, and no migration/architecture/commercialization plan** — inventory only, as
scoped. This is the final backend harvest.

## The question this answers

> **"What software capabilities already exist inside the Venuewise backend?"**

## The answer, in one paragraph

A **mature, fully operational, migration-managed backend** — not a prototype. **93 tables
(all RLS-enabled), 69 database functions, 23 active Edge Functions, 7 calendar views, 5 live
cron jobs, 2 storage buckets, phone+email auth, and 73 tracked migrations.** It implements a
complete set of **horizontal engines** (identity, multi-tenant workspaces, scheduling/calendar,
messaging/SMS, push, Stripe payments, a forms engine, a documents engine, and a template-driven
workflow engine) **and** a full **youth-sports vertical** (families, athletes, coaches, teams,
facilities/booking, clinics + an academy program, organizations, and a "5-Star" media
operation with a spotlight-review pipeline). It **genuinely runs**: 284 SMS sent, 703 page
views, 118 events, 93 calendar entries, live subscriptions, and workflow executions — driven by
cron automation (`pg_cron`) and async HTTP (`pg_net`).

## The capabilities that exist (22 discovered + 1 retired)

**Horizontal engines (platform-grade):**

1. Phone-first **Identity & Access** · 2. Multi-tenant **Workspaces & Branding** ·
2. **Scheduling & Unified Calendar** · 4. **Messaging: SMS (in/out) + Reminders** ·
3. **Push & Feeds** · 6. **Payments & Subscriptions (Stripe: checkout/portal/webhook)** ·
4. **Forms Engine** · 8. **Documents Engine (generate/version/approve)** ·
5. **Workflow Engine (templates→stages→tasks→approvals→effects)** · 10. **Analytics & Status** ·
6. **CRM / Leads** · 12. **Administration & Moderation (+ anti-spam)**.

**Youth-sports vertical:** 13. **Family Management** · 14. **Athlete Development (profiles/goals/stats/videos/public card)** · 15. **Coach Management** · 16. **Team & Roster** · 17. **Facility Management & Booking** · 18. **Clinic Registration & Academy** · 19. **Organization Directory** · 20. **Media Operation — 5-Star Sports Media** (spotlights, articles, podcasts, photos/video,
game coverage/scores, legends, sponsors) · 21. **Public Directories / Games Board**.

**Undetermined / retired:** 22. Three **AI/generic edge processors** (`super-processor`, `hyper-action`, `smart-function`)
— purpose not determinable from metadata (source not read) → _Investigate_. 23. `_leagueapps_uid_backup` — an import artifact → _Retired_.

## What is genuinely running (evidence)

| Signal                                  | Value                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| SMS sent (`sms_outbox`)                 | **284**                                                                      |
| Page views (`page_views`)               | **703**                                                                      |
| Events / calendar entries               | 118 / 93                                                                     |
| Workflow executions (`workflow_events`) | 52                                                                           |
| Athlete events                          | 51 · reminders 30 · family members 7                                         |
| Auth users (phone + email)              | 7                                                                            |
| Active subscriptions                    | 1 (Stripe suite live)                                                        |
| Cron automation                         | 5 jobs (SMS every 2m, calendar 10m, sync 30m, nightly reminders, status 10m) |
| Migrations tracked                      | 73                                                                           |

## Classification summary (nature of each capability)

| Classification                 | Capabilities                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Shared / horizontal engine** | Identity, Workspaces, Scheduling/Calendar, Messaging/SMS, Push/Feeds, Payments, Forms, Documents, Workflow, Analytics, CRM |
| **Sports Vertical Module**     | Athlete, Coach, Team/Roster, Facility/Booking, Clinics/Academy, Organizations, Media (5-Star), Public Directories          |
| **Venuewise-specific**         | Family Management model                                                                                                    |
| **Internal Only**              | Administration & Moderation                                                                                                |
| **Investigate**                | the 3 AI/generic edge processors                                                                                           |
| **Retired**                    | `_leagueapps_uid_backup`                                                                                                   |

## Maturity at a glance

- **Production (live data + automation):** identity, calendar, SMS, family, payments,
  analytics, workflow, admin (**8**).
- **Functional (fully built, awaiting data):** workspaces, forms, documents, athlete, coach,
  team, facility, clinics/academy, organizations, CRM, push (**~11**).
- **Partial:** media operation (**1**). **Unknown:** AI processors (**3**). **Retired:** 1.
- **Bottom line:** the **engines are complete**; several verticals simply await customers/data.

## Security & operations posture (observed)

- **RLS on all 93 tables**; the read/write path is centralized in **SECURITY DEFINER** RPCs
  gated by helper predicates (`current_*`, `is_admin`, `is_media_member`, `wf_has_role`).
- **Self-running:** `pg_cron` + `pg_net` drive the SMS outbox, reminders, calendar refresh,
  schedule sync, and status page.
- **Secrets:** only **VAPID (web-push)** keys are in the DB vault; Stripe/SMS credentials live
  in edge-function config (names not DB-enumerable; **no values accessed**).

## Documents (the full harvest)

| #   | Document                                                                     | Contents                                                                                                                            |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0   | [00-database-inventory.md](00-database-inventory.md)                         | Complete DB inventory: schemas, 93 tables, views, 69 functions, 23 edge fns, cron, storage, auth, RLS, extensions, roles, env names |
| 1   | [01-capability-inventory.md](01-capability-inventory.md)                     | Complete capability inventory (purpose · product · status · workflow · classification)                                              |
| 2   | [02-capability-to-database-map.md](02-capability-to-database-map.md)         | Every capability mapped to its exact backend objects                                                                                |
| 3   | [03-commercialization-and-maturity.md](03-commercialization-and-maturity.md) | Commercialization matrix (L1–L5 support) + evidence-based maturity                                                                  |

## Scope statement (what this task did and did not do)

**Did:** a complete, read-only, evidence-backed inventory of the Venuewise backend. **Did
not:** modify anything, read secret values, compare to any other platform, or recommend
migration/architecture/commercialization. Per instruction, discovery **stops here**; the
separate Capability Crosswalk will decide reuse/assembly/classification.
