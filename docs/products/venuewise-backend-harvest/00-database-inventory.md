# Venuewise Backend Harvest · 00 — Complete Database Inventory

**Project:** `urwnbskrtoplgnkkxuvl` ("Venuewise Platform"), Postgres 17.6, us-east-1
**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**READ-ONLY. Nothing was modified, written, deployed, or migrated.** Every figure below was
observed live via read-only SQL / metadata calls on 2026-07-31.

## Headline counts

| Object                            | Count                            |
| --------------------------------- | -------------------------------- |
| Business schema (`public`) tables | **93** (all with RLS enabled)    |
| Views (`public`)                  | 7                                |
| Functions/RPCs (`public`)         | 69                               |
| Edge Functions                    | **23** (all ACTIVE)              |
| Cron jobs (`pg_cron`)             | 5                                |
| Storage buckets                   | 2                                |
| Auth users                        | 7 (providers: **phone + email**) |
| Migrations tracked                | **73**                           |
| Realtime published tables         | 0                                |
| Sequence (`public`)               | 1                                |

## Schemas (non-system)

`public` (the app), plus standard Supabase schemas: `auth` (23 tables), `storage` (8),
`cron` (2), `realtime` (2), `net` (pg_net), `vault` (secrets), `extensions`,
`supabase_migrations`, `graphql`/`graphql_public`.

## Tables (`public`, 93) — grouped by subject

**Identity & people:** `people, family_access, admin_users, athlete_player_links,
workspace_roles, workspace_members`
**Workspaces / organizations:** `business_workspaces, workspace_branding, workspace_services,
workspace_settings, organizations, organization_athletes, organization_coaches,
organization_events, organization_spotlight_submissions`
**Families:** `families, family_members, family_players, family_events`
**Athletes:** `athletes, athlete_events, athlete_goals, athlete_sports, athlete_stats,
athlete_videos, athlete_spotlight_submissions`
**Coaches:** `coaches (33 cols), coach_connections, coach_spotlight_submissions`
**Teams / players:** `players, player_teams, team_spotlight_submissions, board_hidden_teams`
**Facilities:** `facilities, facility_areas, facility_events, facility_spotlight_submissions,
bookings, open_slots`
**Scheduling / calendar:** `calendar_events, calendar_event_participants, events`
**Registration / academy:** `clinics, clinic_registrations, academy_applications,
academy_assignments, academy_members, academy_mentor_inquiries, academy_parent_permissions,
academy_submissions`
**Payments:** `subscriptions`
**Messaging / notifications:** `sms_outbox, reminders, push_subscriptions, feeds`
**Forms engine:** `form_templates, form_sections, form_fields, form_submissions,
form_submission_events`
**Documents engine:** `documents, document_templates, document_versions, document_approvals,
document_events`
**Workflow engine:** `workflow_templates, workflow_template_stages, workflow_template_tasks,
workflow_instances, workflow_instance_stages, workflow_tasks, workflow_approvals,
workflow_events`
**Media / content (5-Star):** `articles, podcast_episodes, videos, photos, photo_galleries,
game_day_photos, spotlights, story_submissions, game_coverage_tips, game_scores, legends,
legends_spotlight_submissions, sponsors, interview_records`
**CRM:** `leads`
**Analytics / admin:** `page_views, analytics_data, platform_status, invite_log`
**Legacy artifact:** `_leagueapps_uid_backup` (0 rows, 0 policies — a one-time import backup)

## Views (7) — all calendar/event projections

`public_events, public_this_week, public_upcoming, this_week, upcoming_events,
family_events_by_email, sync_summary`

## Functions / RPCs (69) — by role

- **Auth/context (SECURITY DEFINER helpers):** `current_person_id, current_family_ids,
current_family_emails, current_workspace_ids, visible_workspace_ids, is_admin,
is_academy_member, is_media_member, wf_has_role, wf_is_member, norm_phone,
handle_phone_auth_user (trigger), verify_and_link`
- **Family/athlete:** `create_family_onboarding, create_athlete_profile, invite_family_member,
remove_family_member, request_player_sms, my_athletes, my_athlete_candidates,
set_athlete_public, submit_athlete_spotlight`
- **Calendar:** `get_merged_calendar, sync_homehuddle_events_to_calendar`
- **Messaging:** `enqueue_sms_for_family, enqueue_nightly_reminders, trg_events_sms,
trg_family_events_sms`
- **Public directories:** `public_athlete_card, public_athlete_directory, public_featured_coach,
public_featured_legend, public_featured_organization, public_featured_team,
public_games_board`
- **Media moderation:** `is_media_member, media_list_{athlete,coach,facility,legends,org,team}_subs,
media_list_game_tips, media_update_status`
- **Admin/academy/spotlight:** `is_admin, admin_add/list/remove/set_academy_member,
admin_list/update/delete_spotlight, refresh_platform_status`
- **Forms:** `fs_save_draft, fs_submit, readable_form_template_ids`
- **Documents:** `doc_create_version, doc_decide_approval, readable_document_template_ids`
- **Workflow:** `wf_start, wf_advance, wf_task_action, wf_generate_stage_tasks, wf_effect_calendar,
wf_effect_notification, wf_tick, readable_workflow_template_ids`
- **Utility/triggers:** `generate_slug, set_article_slug, reject_spam_submission (7 triggers),
trg_subscriptions_updated_at, refresh_platform_status`

Of 69 functions, the large majority are **SECURITY DEFINER** (the enforced write/read path).

## Edge Functions (23, all ACTIVE)

| Domain                                                   | Functions                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Scheduling                                               | `sync-schedules` (v54 — heavily iterated)                               |
| Notifications / SMS                                      | `send-notifications, send-sms-outbox, sms-inbound, send-pin-reset`      |
| Phone auth                                               | `verify-phone`                                                          |
| Payments (Stripe)                                        | `stripe-checkout, stripe-portal, stripe-webhook, stripe-secret-check`   |
| Workflow API                                             | `workflow-start, workflow-advance, workflow-task-action, workflow-tick` |
| Forms API                                                | `form-save, form-submit`                                                |
| Documents API                                            | `document-generate, document-download, document-approve`                |
| AI / processing (purpose not determinable from metadata) | `super-processor, hyper-action, smart-function`                         |

## Cron jobs (5, `pg_cron`)

| Job                          | Schedule         |
| ---------------------------- | ---------------- |
| `send-sms-outbox-every-2min` | `*/2 * * * *`    |
| `refresh-calendar-events`    | `*/10 * * * *`   |
| `refresh-platform-status`    | `*/10 * * * *`   |
| `sync-schedules-every-30min` | `*/30 * * * *`   |
| `nightly-reminders-generate` | `30 21,22 * * *` |

## Storage buckets (2)

`5star-media` (**public**) · `documents` (**private**)

## Authentication & authorization

- **Auth providers:** phone + email. **7 users.** Custom `verify-phone` edge function +
  `handle_phone_auth_user` trigger + `verify_and_link` RPC = **phone-first identity**.
- **Authorization:** RLS on **all 93 tables**; enforced through SECURITY DEFINER helper
  functions (`current_*`, `is_*`, `wf_has_role`) referenced in policies. Roles are
  application-level (admin / academy member / media member / workspace roles / family access),
  not database roles. No custom Postgres roles beyond Supabase system roles.

## Triggers, indexes, sequences

- **Triggers:** present across submission tables (anti-spam `reject_spam_submission` on 7),
  SMS emitters (`trg_events_sms`, `trg_family_events_sms`), slug generation, `updated_at`.
- **Indexes:** every table indexed; heavier tables (`events` 12, `calendar_events` 8,
  `form_submissions` 7, `workflow_tasks` 7) well-indexed.
- **Sequences:** 1 in `public` (the rest are UUID PKs).

## Extensions (installed)

`pg_cron` (scheduler), `pg_net` (async HTTP from DB), `pgcrypto`, `uuid-ossp`,
`supabase_vault` (secrets), `pg_stat_statements`. (No pgvector/postgis installed.)

## Environment configuration (names only — values never read)

DB **vault** secrets: `VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT` (Web Push). Stripe
and SMS/Twilio credentials are referenced by the `stripe-*` and `sms-*`/`send-*` edge
functions and live in **edge-function config** (not the DB vault); their names were not
enumerable via read-only DB access and **no secret values were accessed**.

## Realtime

No tables are published to `supabase_realtime` (the app polls/refreshes via cron rather than
using Postgres realtime).
