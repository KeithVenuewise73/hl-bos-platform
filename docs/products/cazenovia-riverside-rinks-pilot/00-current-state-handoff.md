# Cazenovia + Riverside Rinks pilot: current-state handoff

**Date:** 2026-11-06 · **Author:** Claude (AI engineer) · **For:** Keith Herman (CEO), to give to ChatGPT
**Status: read-only inspection.** Nothing was applied, deployed, migrated or written to any database. No record contents were read; only schema, definitions and row **counts**. No keys, tokens or personal data appear below.

Evidence labels: **VERIFIED** = I ran the query or read the file today. **DOCUMENTED** = a repo document says so, but I didn't re-check it. **NOT VERIFIED** = I couldn't check it (the reason is given).

---

## 0. Six facts that shape everything below

1. **The Venuewise platform is not in this repository.** Venuewise runs on Supabase project **`urwnbskrtoplgnkkxuvl` ("Venuewise Platform", us-east-1)**, with static front ends in **`KeithVenuewise73/homehuddle`** (served at `venuewise.net`). `hl-bos-platform` (this repo) is a separate platform on a separate project (`mvvtngiopdrgiedjmhfb`, "HL-BOS Core"), and it has **no booking, rink or calendar code**. Its control-center registry lists Venuewise as `not-started` (`apps/control-center/src/lib/registry.ts:168`). This handoff sits here only because this session can push here. VERIFIED.
2. **FacilityHuddle exists, but the browser can't reach it.** The tables `facilities`, `facility_areas`, `bookings`, `open_slots`, `facility_events`, `calendar_events` and `calendar_event_participants` have RLS on, **zero policies, and no table grants to `anon` or `authenticated`**. The FacilityHuddle dashboard (`facilityhuddle/assets/js/dashboard.js`) reads and writes those tables with the anon key, so it **cannot work in production today**. VERIFIED with `has_table_privilege`.
3. **SMS notifications are down.** Per the 2026-11-04 recovery package, the Twilio account is inactive. 659 `sms_outbox` rows failed and nothing has been delivered since 2026-08-23. The same provider backs phone-OTP login (`verify-phone`). DOCUMENTED (`security/stage0/TWILIO_containment_and_restoration.md` on homehuddle branch `recovery/venuewise-production-2026-11`). The cron jobs that feed the outbox are still active. VERIFIED (`cron.job`).
4. **None of the pilot entities exist in the database.** I found no facility, organization or team matching Cazenovia, Riverside, Chiefs, Sabres, Timon or Hasek. Production has 1 facility (a demo, "Lakeshore Ice & Sports Center"), 1 organization, 0 teams, 3 bookings and 2 open slots. VERIFIED (counts and business names only).
5. **Most of the schema exists only in the live database.** The Venuewise schema came from 118 migrations applied straight to production, mostly with no file on `homehuddle/main`. On 2026-11-04 they were recovered verbatim to the **unmerged** branch `recovery/venuewise-production-2026-11`, along with proposed deployment, migration and AI rules. Those rules say to commit the recovered ledger first, then make changes. DOCUMENTED and VERIFIED (the live ledger lists 118 versions; I ran `list_migrations`).
6. **"HuddleSphere" doesn't appear anywhere** in either repo or the database. I treat it as a brand name for the Venuewise/Huddle family. NOT VERIFIED.

---

## 1. Canonical repository, branch, hosting, deployment

| Item                                | Value                                                                                                                                                                                                                                                                                                                        | Evidence                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                             | Supabase `urwnbskrtoplgnkkxuvl`, Postgres 17.6, us-east-1, status ACTIVE_HEALTHY                                                                                                                                                                                                                                             | VERIFIED (`list_projects`)                                                                                                                                                                                          |
| Front-end repo                      | `KeithVenuewise73/homehuddle` (public). `CNAME` = `venuewise.net`                                                                                                                                                                                                                                                            | VERIFIED (shallow clone)                                                                                                                                                                                            |
| Branches                            | `main` (head `c92f003`, 2026-07-04) · `recovery/venuewise-production-2026-11` (`a3ba3b0`, 2026-11-04: ledger and function recovery plus proposed policies) · `feat/homehuddle-ios-release` (2026-08-14) · `claude/gracious-ride-k4kqan`, `claude/playingtime-football-v1-1wy71u` (2026-08-23) · `claude/fervent-cray-rvmsa5` | VERIFIED                                                                                                                                                                                                            |
| Hosting                             | GitHub Pages: static HTML/CSS/vanilla JS, no build step. Pages talk to Supabase PostgREST directly with the anon key                                                                                                                                                                                                         | VERIFIED (code). **Which branch Pages serves: NOT VERIFIED.** `docs/runbooks/deploy-and-rollback.md` plans a `live` branch, but no `live` branch exists on the remote. This sandbox gets HTTP 403 for venuewise.net |
| Front-end deploy today              | Whatever lands on the Pages source branch goes live immediately. There is no CI on `main`                                                                                                                                                                                                                                    | DOCUMENTED (runbook, deployment-policy.md)                                                                                                                                                                          |
| DB / function deploy today          | Historically applied straight to production, outside version control (hence the recovery)                                                                                                                                                                                                                                    | DOCUMENTED (`docs/operations/ai-development-rules.md` on the recovery branch)                                                                                                                                       |
| Proposed process (not yet in force) | PR into `main` → CI → CEO approval → workflow with an environment gate applies the change. Rehearse on a Supabase branch first                                                                                                                                                                                               | DOCUMENTED (`docs/operations/deployment-policy.md`, `migration-policy.md`, `edge-function-policy.md` on the recovery branch)                                                                                        |
| Edge functions                      | 22 active (e.g. `sync-schedules` v56, `send-sms-outbox`, `send-notifications`, `verify-phone`, `stripe-*`, `workflow-*`, `form-*`, `document-*`)                                                                                                                                                                             | VERIFIED (`list_edge_functions`)                                                                                                                                                                                    |
| Cron                                | `capture-sync-reports` 5m · `escalate-stale-leads-daily` · `flush-schedule-digests` 2m · `nightly-reminders-generate` · `refresh-calendar-events` 10m · `refresh-platform-status` 10m · `send-sms-outbox-every-2min` · `sync-schedules-every-30min`                                                                          | VERIFIED                                                                                                                                                                                                            |
| Auth providers in use               | `email`, `phone`                                                                                                                                                                                                                                                                                                             | VERIFIED (`auth.identities`, distinct providers only)                                                                                                                                                               |

**Recommendation:** treat `homehuddle` plus `urwnbskrtoplgnkkxuvl` as canonical for this pilot. Work happens on a feature branch cut from `recovery/venuewise-production-2026-11` once that branch is merged. Its rule is to commit the recovered ledger before adding new migrations.

---

## 2. Relevant pages, layouts, shared code (homehuddle repo)

| Path                                                                                                                                    | What it is                                                                                                                                                                         | State                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facilityhuddle/index.html`                                                                                                             | FacilityHuddle marketing page: pricing cards ($29/$79 per month) and a lead form that POSTs to `leads`                                                                             | Static; no booking data                                                                                                                                                                                                                                         |
| `facilityhuddle/dashboard.html` + `facilityhuddle/assets/js/dashboard.js`                                                               | Staff dashboard: overview, booking list, "marketplace" of open slots, "Fill this slot", "Publish slot"                                                                             | **Broken in production** (§0.2). Login compares `facilities.access_code` **in the browser**. "Fill" only sets `open_slots.status='claimed'`: no booking is created, no confirmation is actually sent (the toast claims one is), and the claimant isn't recorded |
| `facilityhuddle/assets/js/main.js`                                                                                                      | `ohGet/ohInsert/ohUpdate` REST helpers, nav/footer injection, ecosystem footer bar                                                                                                 | Pattern shared with OrganizationHuddle and CoachesHuddle                                                                                                                                                                                                        |
| `homehuddle/facilityhuddle.html`                                                                                                        | A second FacilityHuddle page (549 lines) inside the HomeHuddle folder                                                                                                              | Not reviewed line by line                                                                                                                                                                                                                                       |
| `organizationhuddle/{index,directory,profile,dashboard,profile-create,join,contact,spotlight-submit}.html`                              | Organization directory and profiles: reads `organizations`, `organization_coaches`, `coaches`, `organization_athletes`, `organization_events`                                      | Public directory works (these tables grant anon SELECT)                                                                                                                                                                                                         |
| `coacheshuddle/*`                                                                                                                       | Coach directory, profiles, clinics                                                                                                                                                 | Not in scope                                                                                                                                                                                                                                                    |
| `calendar.html`, `homehuddle/calendar.html`                                                                                             | HomeHuddle family calendar: reads `events` (iCal-synced), `family_events`, `feeds`, `reminders`, `family_members`, `families`, `people`, `family_access`; RPC `current_family_ids` | Live. **Doesn't read `calendar_events`**                                                                                                                                                                                                                        |
| `homehuddle/athlete-*.html`, `homehuddle/athletehuddle.js`, `family-athletes.html`                                                      | AthleteHuddle persona pages                                                                                                                                                        | Live                                                                                                                                                                                                                                                            |
| `shared/config.js`, `shared/workspace.js`, `shared/workflow.js`, `shared/forms.js`                                                      | Proposed shared Supabase config and engines. `config.js` says "NOTHING ADOPTS THIS YET"                                                                                            | Scaffold                                                                                                                                                                                                                                                        |
| `ARCHITECTURE.md`, `docs/security/rls-baseline.md`, `docs/runbooks/deploy-and-rollback.md`                                              | Venuewise Core architecture, RLS capture, deploy runbook                                                                                                                           | Documentation                                                                                                                                                                                                                                                   |
| Recovery branch: `supabase/recovery/production-2026-11/{migrations,functions}/`, `PRODUCTION_RECOVERY_MANIFEST.md`, `security/stage0/*` | Verbatim schema and function source, plus pending security packages SEC-9 to SEC-13                                                                                                | Unmerged                                                                                                                                                                                                                                                        |

In this repo (HL-BOS), the only Venuewise material is analysis: `docs/architecture/68-venuewise-huddle-evidence.md` and `docs/products/venuewise-backend-harvest/*` (2026-07-31). **That harvest is now stale.** It says 93 tables, 69 functions and 23 edge functions. Today there are **104 tables, 11 views, 108 functions and 22 edge functions**. It also calls `feeds` a notification feed; it is actually the iCal-subscription table.

---

## 3. Database objects relevant to the workflow (live, VERIFIED)

### 3.1 Facility and booking

**`facilities`**: `id, name!, slug (unique), facility_type, address, city, state, contact_email, contact_phone, access_code!, logo_url, description, is_active, created_at, updated_at`. RLS on, 0 policies, no client grants.

**`facility_areas`**: `id, facility_id!→facilities (cascade), name!, area_type ∈ {ice, field, court, room, training, other}, color, display_order, is_active`. Index `idx_facility_areas_facility`.

**`bookings`**: `id, facility_id!→facilities, area_id!→facility_areas, booking_type!, title, customer_name, contact_email, contact_phone, organization_id→organizations (set null), coach_id→coaches, athlete_id→athletes, family_id→families, start_time!, end_time!, amount (numeric, default 0), status, is_recurring, recurrence_rule (text), notes, created_at, updated_at`

- `booking_type` ∈ {organization_rental, team_rental, coach_rental, private_rental, birthday_party, tournament, camp, clinic, maintenance, open_skate}
- `status` ∈ {**confirmed, cancelled, maintenance**}. There is no "cancellation requested" state.
- Indexes: facility, area, start_time, athlete, family. **There is no overlap/exclusion constraint**, so double-booking an area is possible.
- Trigger `bookings_alert` (AFTER INSERT) → `trg_bookings_alert()` → `enqueue_internal_alert('booking', …)` queues an SMS to `alert_recipients`. This is an internal staff alert, not a customer notification, and it currently can't be delivered.
- **There is no `team_id`.**

**`open_slots`**: `id, facility_id!, area_id!, source_booking_id→bookings (set null), source! ∈ {cancellation, unbooked}, start_time!, end_time!, price, reason, status ∈ {open, claimed, expired}, claimed_by_name/email/phone, claimed_by_athlete_id, claimed_by_family_id, views, created_at, claimed_at`. Indexes: facility, status, claimed athlete, claimed family.

- It can't link a claim to an organization, team or coach. It has no visibility flag and doesn't record who released the slot or which booking won it.

**`facility_events`**: tournaments, camps, clinics, open skate, tryouts, fundraisers, with capacity and price. 0 rows.

### 3.2 Shared calendar layer

**`calendar_events`**: `id, source_module! ∈ {homehuddle, athletehuddle, coacheshuddle, organizationhuddle, facilityhuddle, tournamenthuddle, workflow}, source_table!, source_id!, title!, description, event_type, start_time!, end_time, location_name, location_address, organization_id, coach_id, facility_id, is_public, status ∈ {active, cancelled, completed}, is_conflict, is_duplicate, workspace_id, created_at, updated_at`.

- **`UNIQUE (source_module, source_table, source_id)`.** This is the existing guard against duplicates: one source row maps to exactly one calendar row.
- 238 rows: 237 from `homehuddle/events`, 1 from `workflow/workflow_tasks`. **0 from facilityhuddle.**
- No client grants, so no front end reads it today.

**`calendar_event_participants`**: `calendar_event_id→calendar_events (cascade), athlete_id, family_id, participant_role ∈ {registrant, roster_member, claimed_by, host}, workspace_id`, with UNIQUE on (event, athlete, family, role). **0 rows.**

**Functions:**

- `publish_to_calendar(p_source_module, p_source_table, p_source_id, p_title, p_start_time, …, p_facility_id, p_is_public, p_status DEFAULT 'confirmed')`: SECURITY DEFINER; executable by service_role and postgres only. It updates by source key, or inserts if absent, so it is idempotent. It rejects `homehuddle` as a source. **No caller exists** (0 cron jobs, 0 triggers, no other function calls it; the migration is literally named `calendar_hub_writer_unattached`). **Latent bug:** the default `p_status='confirmed'` breaks `calendar_events_status_check` (active/cancelled/completed), so any call that leaves out `p_status` will fail. I worked this out from the two definitions; I didn't execute it, because that would be a write.
- `sync_homehuddle_events_to_calendar()`: cron every 10 min. Upserts `events` into `calendar_events` on the source key, and marks removed events `cancelled` rather than deleting them. **This is the change/cancel propagation pattern to copy.**
- `get_merged_calendar(p_from, p_to)`: returns **only `family_events`** for the signed-in person's families. It doesn't include `calendar_events`.
- `wf_effect_calendar(task_id, actor)`: the workflow engine writes to `calendar_events` (source_module `workflow`).

**Views:** `public_events`, `public_upcoming`, `public_this_week` are built over `events` plus public `family_events`, **not** `calendar_events` or `bookings`. A pending security package (SEC-11) would switch them to `security_invoker`.

### 3.3 HomeHuddle iCal pipeline (live, and the part that actually reaches families)

- `feeds` (iCal subscriptions per kid: `ical_url, platform, team_name, email, pin, status…`) and `player_teams.ical_url` feed the `sync-schedules` edge function (every 30 min). It upserts into **`events`** (PK `(uid, kid)`; unique `(uid, feed_id)`, `(uid, kid, family_phone)` and `idx_events_dedup (platform, kid, start, name)`).
- Events that disappear move to **`events_removed`**. Changes queue into **`schedule_change_queue`** (33 unflushed rows). `flush_schedule_digests()` then sends one SMS digest per family through `enqueue_sms_for_family` → `sms_outbox`.
- `sms_outbox` has `UNIQUE (person_id, event_ref, change_hash)` (`sms_outbox_dedup`), so the same message to the same person is never queued twice.
- Platform-specific handling exists for `leagueapps` UIDs. **RecTimes isn't handled**, and whether RecTimes publishes iCal at all is NOT VERIFIED.

### 3.4 Identity and membership

| Table                         | Key columns                                                                                                                                                         | Notes                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `people`                      | `phone!` (E.164, unique), `phone_verified`, `auth_user_id`→auth.users (unique), `display_name`, `sms_opt_in`                                                        | The person spine. 8 rows                                                         |
| `family_access`               | `person_id`→people, `family_id`→families, `role` ∈ {owner, parent, viewer, player}, `status` ∈ {active, pending, revoked}, `can_edit`                               | Drives `current_family_ids(bool)`                                                |
| `families` / `family_members` | `family_members.person_id`, `player_id`, `receives_sms`, `receives_push`, `sms_status`                                                                              | 1 family                                                                         |
| `business_workspaces`         | `slug` (unique), `workspace_type` ∈ {platform, holding, sports_org, home_services, media_brand, review_platform, education, business_client}, `parent_workspace_id` | 5 rows (2 `sports_org`)                                                          |
| `workspace_members`           | (`workspace_id`, `person_id`) unique, `status`                                                                                                                      | `current_workspace_ids()`, `visible_workspace_ids()` (includes child workspaces) |
| `workspace_roles`             | `role` ∈ {**owner, admin, staff, coach, customer, viewer**}                                                                                                         | Reusable for "facility scheduler" (staff) and "org scheduler / coach"            |
| `admin_users`                 | `user_id`                                                                                                                                                           | `is_admin()`                                                                     |

**Important gap:** `organizations` and `facilities` have **no `workspace_id`**, and there's no organization-membership table. Nothing links a signed-in person to Cazenovia Chiefs or to a rink's scheduling staff today.

### 3.5 How organizations, teams, coaches, athletes and families link

```
organizations ─┬─< teams (organization_id)                 [teams: 0 rows, RLS on, 0 policies]
               ├─< coaches (organization_id)                [coaches: 1]
               ├─< organization_coaches (organization_id, coach_id)
               ├─< organization_athletes (organization_id, athlete_id)  -- display roster, mostly free text
               └─< organization_events (date + text times)

teams ─< player_teams (team_id, nullable; "team_name remains authoritative")
players ─< player_teams (player_id)        players ─< family_players >─ families
players ─ athlete_player_links (1:1) ─ athletes ─> families (athletes.family_id)
families ─< family_access >─ people ─ auth.users
coaches ─< coach_connections >─ athletes   (status pending/active/inactive/declined)
bookings → organization_id, coach_id, athlete_id, family_id    (no team_id)
```

So a booking can reach families like this: booking → organization/**team** → `player_teams.team_id` → `players` → `family_players` → `families` → `family_access` → `people`. The **team hop is missing on `bookings`**, and `teams` and `player_teams.team_id` are unpopulated.

### 3.6 RLS and grants (VERIFIED), with security notes for whoever implements this

- FacilityHuddle and calendar tables: RLS on, 0 policies, no grants. Effectively service-role only, and they must be reached through SECURITY DEFINER RPCs.
- `organizations`, `organization_coaches`, `organization_athletes`, `coaches`: anon `SELECT USING (true)`. Anon also holds table-level INSERT/UPDATE grants, but no write policies exist, so RLS denies writes.
- `players`, `player_teams`, `family_players` have **anon INSERT policies with `WITH CHECK (true)`**, each duplicated. That's a pre-existing weakness: the pilot should not build on it. Fix it under the security packages.
- `teams` has full table grants to anon and authenticated, but RLS with 0 policies blocks all access.
- Pending, unapplied security packages: SEC-9 to SEC-13, plus the Twilio containment package (homehuddle `security/stage0/`). SEC-11 covers SECURITY DEFINER views that are readable by anon.

### 3.7 Notification infrastructure

| Channel                      | Mechanism                                                                                                                                                         | State                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| SMS to families              | `enqueue_sms_for_family` → `sms_outbox` → `send-sms-outbox` (Twilio), with double opt-in (`sms_double_optin`), `people.sms_opt_in`, minor/parent consent triggers | **Provider inactive since 2026-08-23** (DOCUMENTED) |
| SMS to staff                 | `enqueue_internal_alert` → `alert_recipients` (`alert_bookings` flag)                                                                                             | Same provider; down                                 |
| Web push                     | `push_subscriptions` + `send-notifications` (VAPID)                                                                                                               | Functional; 1 subscription                          |
| Workflow notification effect | `wf_effect_notification`: **dry-run only**; it logs `workflow_events` and never sends                                                                             | Doesn't send                                        |
| Email to customers           | None found in Venuewise                                                                                                                                           | Missing                                             |
| In-app inbox                 | None (`feeds` is iCal, not notifications)                                                                                                                         | Missing                                             |

---

## 4. The eight workflow steps against what exists

| #   | Step                                                        | Works                                                                                                 | Partial                                                                                            | Missing                                                                                                                 |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Renter requests cancellation                                | —                                                                                                     | `bookings.status` has `cancelled`                                                                  | A request record; a renter-side UI; renter identity (org scheduler)                                                     |
| 2   | Booking stays active until the scheduler approves           | Booking stays `confirmed` by default                                                                  | —                                                                                                  | An approval state machine, scheduler role, audit of who decided                                                         |
| 3   | Approval puts the slot on the rink website                  | `open_slots` with `source='cancellation'`, `source_booking_id`                                        | Dashboard "marketplace" (broken, §0.2)                                                             | A public rink calendar page; an anon-safe RPC; a visibility flag                                                        |
| 4   | Auto-notify matching, opted-in orgs and coaches             | SMS outbox with dedup and opt-in (provider down); web push                                            | —                                                                                                  | Facility waiting list / interest profiles with match rules and opt-in; any working delivery channel                     |
| 5   | Orgs request the opening                                    | —                                                                                                     | `open_slots.claimed_by_*` (single claimant, free text)                                             | Multiple competing requests per slot, linked to org/team/coach                                                          |
| 6   | Scheduler awards one, closes the rest                       | —                                                                                                     | —                                                                                                  | An atomic award RPC; a booking created from the award; overlap prevention                                               |
| 7   | Event flows to org/team and to family and athlete calendars | `calendar_events` + `calendar_event_participants` schema; `publish_to_calendar`                       | Writer exists but is unattached and buggy; no facility rows; families can't read `calendar_events` | Team on booking; roster fan-out; a read path in the HomeHuddle calendar                                                 |
| 8   | Changes and cancellations propagate without duplicates      | Source-key uniqueness and cancel-not-delete pattern (`sync_homehuddle_events_to_calendar`); SMS dedup | —                                                                                                  | Wiring for bookings, so that a booking update re-publishes and a cancellation sets `status='cancelled'` on the same row |
| —   | 30-day policy, kept separate from money                     | `bookings.amount`                                                                                     | —                                                                                                  | Per-facility policy; a financial disposition record separate from the release                                           |

---

## 5. Recommended minimal changes (all additive, in the Venuewise project)

These are design proposals. **Nothing has been written or applied.** Each migration follows the proposed migration policy: one concern per file, `search_path` set on SECURITY DEFINER functions, `revoke … from public, anon` plus explicit grants, and a forward rollback written first.

### 5.1 Tenancy and roles (reuse workspaces; no new role system)

- `alter table facilities add column workspace_id uuid references business_workspaces`; do the same for `organizations`.
- One workspace per rink and one per organization. Reuse `workspace_roles`: rink **`staff`/`admin`** = ice scheduler; org **`admin`** = renter/org scheduler; **`coach`** = coach. (Optionally add `'facility'` to the `workspace_type` check; otherwise use `business_client`.)
- Helpers: `is_facility_scheduler(facility_id)` and `is_org_scheduler(organization_id)`, built on `current_person_id()` and `workspace_roles`.

### 5.2 Booking integrity

- `alter table bookings add column team_id uuid references teams`, plus `series_id uuid`. Store recurring contract ice as **one row per occurrence**, so a single date can be cancelled.
- `create extension btree_gist` (available, not installed), then `exclude using gist (area_id with =, tstzrange(start_time, end_time) with &&) where (status = 'confirmed')`. Clean existing overlaps first; there are only 3 rows today.

### 5.3 Cancellation is separate from money (new tables)

- `facility_policies (facility_id pk, cancellation_notice_days int, policy_text, updated_by, updated_at)`. Cazenovia = 30. Riverside: **ask the rink**.
- `booking_cancellation_requests (id, booking_id, requested_by_person_id, organization_id, reason, requested_at, status ∈ {pending, approved, denied, withdrawn}, decided_by_person_id, decided_at, decision_note, notice_days_at_request int, inside_policy_window bool)`. A partial unique index allows one `pending` request per booking.
- `booking_financial_dispositions (id, booking_id, cancellation_request_id, status ∈ {undetermined, waived, owed_full, owed_partial, credited, offset_by_replacement}, amount, decided_by_person_id, decided_at, note)`. It is created as `undetermined` when the release is approved, and **never decided automatically**. Nothing here charges a card. That is a separate Level C decision.

### 5.4 Open slots and competing requests (extend `open_slots`)

- Add columns `cancellation_request_id, released_by_person_id, released_at, is_public bool default true, awarded_booking_id, awarded_request_id`. Extend the status check to `{open, claimed, expired, awarded, withdrawn}` (keep the old values).
- `open_slot_requests (id, open_slot_id, organization_id, team_id, coach_id, requested_by_person_id, note, status ∈ {requested, awarded, closed, withdrawn}, created_at, decided_at)`. Unique on (`open_slot_id`, `organization_id`, `team_id`) while active, and a partial unique index allowing **one `awarded` per slot**.

### 5.5 Waiting list and opt-in

- `facility_waitlist (id, facility_id, organization_id, team_id null, coach_id null, contact_person_id, area_types text[], days_of_week int[], earliest_time time, latest_time time, min_minutes, max_price, notify_opt_in bool, channels text[], active, created_at)`.
- `open_slot_offers (id, open_slot_id, waitlist_id, person_id, channel, status ∈ {queued, sent, failed, suppressed, no_channel}, outbox_ref, created_at)` with UNIQUE (`open_slot_id`, `person_id`, `channel`). This is an honest log of every attempt.

### 5.6 RPCs (SECURITY DEFINER, the only write path)

| RPC                                                                    | Who                                        | What                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request_booking_cancellation(booking_id, reason)`                     | org scheduler of `booking.organization_id` | Inserts a pending request and computes `inside_policy_window`. **The booking stays `confirmed`.** Notifies the rink scheduler                                                                                                                                                                |
| `decide_cancellation(request_id, approve bool, note)`                  | facility scheduler                         | Approve: booking → `cancelled`; `publish_to_calendar(..., p_status=>'cancelled')` on the same source key; insert `open_slots` (`source='cancellation'`); insert an `undetermined` financial disposition; run the match fan-out. Deny: request → `denied`, booking untouched                  |
| `set_financial_disposition(booking_id, status, amount, note)`          | facility scheduler                         | Records the decision only                                                                                                                                                                                                                                                                    |
| `request_open_slot(slot_id, organization_id, team_id, note)`           | org scheduler / coach                      | Inserts a request                                                                                                                                                                                                                                                                            |
| `award_open_slot(request_id)`                                          | facility scheduler                         | In one transaction: `SELECT … FOR UPDATE` on the slot; create the booking (the exclusion constraint guarantees no overlap); slot → `awarded`; winner → `awarded`; every other request → `closed`; publish to the calendar; fan out participants; notify the winner and the closed requesters |
| `public_facility_calendar(slug, from, to)` / `public_open_slots(slug)` | anon                                       | Times, area and status labels only ("Booked", "Open ice", "Available"). **Never renter names, contacts or amounts**                                                                                                                                                                          |
| `my_facility_events(from, to)`                                         | authenticated                              | `calendar_events` joined through `calendar_event_participants` on `current_family_ids()`, or through the caller's org/team workspaces                                                                                                                                                        |

### 5.7 Calendar propagation (reuse; don't rebuild)

- One rule: every booking insert or update calls `publish_to_calendar('facilityhuddle', 'bookings', booking.id::text, …)`, through a trigger or inside the RPCs. Fix the default first (`p_status DEFAULT 'active'`). Cancel means the same row goes to `status='cancelled'`; it is never deleted. The unique source key makes duplicates impossible.
- Participant fan-out: team → `player_teams.team_id` → `players` → `family_players` / `athlete_player_links` → `calendar_event_participants` (`roster_member`). This needs `teams` and `player_teams.team_id` populated for the four organizations.
- HomeHuddle display: add `my_facility_events` to `calendar.html` / `homehuddle/calendar.html`, alongside the `events` and `family_events` reads.
- Phase 2 (optional): a per-team ICS edge function, so coaches and families can subscribe in Google/Apple calendars. Stable UIDs = `booking.id`.

### 5.8 Notifications (be honest about delivery)

- Write every attempt to `open_slot_offers`. Use web push where a subscription exists, and SMS through `sms_outbox` only once Twilio is restored (a CEO decision, Level C). Add an email channel if the pilot needs one; there is no email provider today. Until a channel works, offers record `no_channel` or `failed`, and the scheduler UI shows "not delivered". It must never claim a notification was sent.

### 5.9 Front end

- New public rink pages per facility (Cazenovia, Riverside) that call only the anon RPCs.
- Rebuild the FacilityHuddle staff dashboard on Supabase Auth plus RPCs. **Remove the client-side `access_code` login.** Pilot sign-in should be **email OTP/magic link**, because phone OTP depends on the inactive Twilio account.
- An OrganizationHuddle "Ice" tab: my bookings, request cancellation, open slots, my requests.

---

## 6. What to reuse from the separate ChatGPT pilot

**NOT VERIFIED:** the pilot URL returned HTTP 403 from this sandbox, so this assessment rests on your description of it.

| Reuse                                                                                                                       | Don't reuse                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Screen flows and copy: request cancellation → pending → scheduler approve/deny → slot published → offers → requests → award | Its data model, IDs and sample reservations. Map its fields onto `bookings` / `open_slots` / the new tables above            |
| Visual design for the public rink calendar and slot cards                                                                   | "Preview" notification records. Every notification shown must come from `open_slot_offers` / `sms_outbox` with a real status |
| State names and wording, as acceptance criteria for the RPCs                                                                | Its calendar views as a data source. Calendars must read `calendar_events`                                                   |
| The demo scenario, as a scripted test case (with fake data, in a preview branch only)                                       | Any auth or session approach it uses                                                                                         |

---

## 7. Staged implementation and verification plan

Every stage ends with something run and shown, per the operating contract. Production changes need the CEO's approval as a click, never a command.

| Stage                | Deliverable                                                                                                                                                                                                                            | Proof                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Ground**        | Merge the recovery branch (ledger committed unchanged). Decide which branch Pages serves. Approve or decline the Twilio containment package. Create a Supabase **preview branch** of `urwnbskrtoplgnkkxuvl` (has a cost; CEO decision) | Ledger in repo = ledger in DB (118 = 118); preview branch exists                                                                                                                                                             |
| **1. Schema**        | Migrations for §5.1–5.5 plus the `publish_to_calendar` default fix, applied to **preview only**                                                                                                                                        | pgTAP/SQL tests: overlap rejected; one award per slot; booking stays `confirmed` while its request is pending; anon can't read renter fields; the disposition is created `undetermined`                                      |
| **2. RPCs**          | §5.6 functions                                                                                                                                                                                                                         | Tests run as each role (anon, family, org scheduler, coach, rink scheduler, another org) to prove each sees and does only what it should. Concurrency test: two simultaneous `award_open_slot` calls give exactly one winner |
| **3. Calendar**      | Trigger/RPC publishing, participant fan-out, `my_facility_events`                                                                                                                                                                      | Award → 1 `calendar_events` row; edit → same row updated; cancel → same row `cancelled`; re-run → still 1 row; the family calendar shows it                                                                                  |
| **4. Pages**         | Public rink calendar ×2, rebuilt staff dashboard, org Ice tab                                                                                                                                                                          | Playwright run against preview through the full 8-step script, with screenshots                                                                                                                                              |
| **5. Notifications** | Matching, the `open_slot_offers` ledger, push (and SMS/email once a provider is approved)                                                                                                                                              | The ledger shows real statuses; no "sent" without a provider response                                                                                                                                                        |
| **6. Pilot data**    | Rinks, ice areas, policies, the four organizations, teams and scheduler accounts. Initial RecTimes schedule import (method TBD: CSV export or manual)                                                                                  | Counts match the rink's own schedule for a sample week, reviewed with the scheduler                                                                                                                                          |
| **7. Production**    | Same migrations through the approved CI path, then smoke tests                                                                                                                                                                         | Validation queries recorded in the PR                                                                                                                                                                                        |

---

## 8. Not verified, or open questions

1. **Which branch GitHub Pages serves for venuewise.net**, and whether the live site matches `main` (venuewise.net is blocked from this sandbox).
2. **The ChatGPT pilot's** actual screens and data (blocked, HTTP 403).
3. **RecTimes:** whether it offers iCal or CSV export or an API. No integration exists.
4. **Riverside's** cancellation policy, and whether Cazenovia's 30 days counts calendar days or business days, and from what time.
5. **Whether Supabase email auth has custom SMTP configured.** The default sender is rate-limited. Not checked.
6. **The Twilio account's status** is taken from the 2026-11-04 package, not re-checked today (I didn't read `sms_outbox` contents).
7. **`homehuddle/facilityhuddle.html`** (the second copy) and the `super-processor` / `hyper-action` / `smart-function` edge functions weren't reviewed line by line.
8. **"HuddleSphere"** naming (§0.6).
9. **Point-in-time backup retention** on the Venuewise project (plan-dependent; not verified).
10. Whether the four organizations want **coaches** (not only org schedulers) to be able to request ice. This affects §5.6 permissions.

## 9. Decisions only the CEO can make

- Approve merging `recovery/venuewise-production-2026-11` (the ledger becomes the source of truth).
- Twilio: contain now, restore later, or replace with email/push for the pilot.
- Pay for a Supabase preview branch to rehearse migrations.
- Policy terms with each rink: whether the platform only **records** financial dispositions (recommended) or ever charges.
