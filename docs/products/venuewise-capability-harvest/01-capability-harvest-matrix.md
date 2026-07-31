# Venuewise Capability Harvest · 01 — Capability Harvest Matrix

**Read-only harvest. No code/schema/deploy changes.** Organized by the 13 capability
categories. Each row documents the 11 required fields (compacted; see legends).

**Maturity:** `PROD` production-live (front-end verified; repo documents it as production) ·
`FUNC` functional-but-incomplete · `PROTO` prototype · `STUB` stub/scaffold · `DOC`
documentation-only. **Backend maturity is _inferred_ — the DB (`urwnbskrtoplgnkkxuvl`) is not
reachable; see [00](00-evidence-and-scope.md).**
**Factory class:** `as-is` reuse as-is · `adapter` reuse with adapter · `refactor` refactor
into shared module · `VW` keep Venuewise-specific · `retire`.
**Reuse?** = reusable outside Venuewise. **Layers** = commercialization layers supported
(L1 internal · L2 BTI engagement · L3 SaaS · L4 license/API/white-label · L5 Factory assembly).

---

## A. Shared platform capabilities

| Capability                                           | Product        | User problem                    | Evidence                                                                              | Front-end   | Maturity                                             | Reuse?  | Factory class                                                          | Layers |
| ---------------------------------------------------- | -------------- | ------------------------------- | ------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------- | ------- | ---------------------------------------------------------------------- | ------ |
| **Multi-tenant workspaces** (branded, config-driven) | Venuewise Core | One platform, many branded orgs | `business_workspaces, workspace_branding, workspace_roles`; `/workspaces`,`/platform` | admin pages | **STUB** (Wave 0 scaffold, "adopted by nothing yet") | Partial | **retire→HL-BOS** (HL-BOS tenancy is further along)                    | L5     |
| **Identity / PIN family auth**                       | HomeHuddle     | Families log in simply (PIN)    | `family_access, workspace_roles`; `login.html, login-pin-OLD, coach-login`            | login pages | **PROD** (front-end)                                 | Partial | **VW / adapter** (PIN UX is domain-specific; HL-BOS Auth is canonical) | L1,L5  |
| **Workflow engine**                                  | Venuewise Core | Approvals/tasks/stages          | `workflow_instances, _instance_stages, _tasks, _approvals, _events`                   | admin       | **FUNC** (inferred)                                  | Yes     | **retire→HL-BOS** (HL-BOS `workflows` is the canonical engine)         | L5     |
| **Dynamic forms engine**                             | Venuewise Core | Configurable intake forms       | `form_templates, form_sections, form_fields`; `forms-sandbox.html`                    | forms       | **PROTO** (sandbox)                                  | **Yes** | **refactor** (HL-BOS has _no_ forms engine — genuine gap-filler)       | L3,L5  |

## B. Scheduling & calendar ⭐ (the crown jewel)

| Capability                         | Product    | User problem                                  | Evidence                                                                                                          | Front-end | Maturity            | Reuse?  | Factory class                       | Layers   |
| ---------------------------------- | ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ------------------- | ------- | ----------------------------------- | -------- |
| **Merged family/athlete calendar** | HomeHuddle | One family calendar across kids/teams/coaches | RPC `get_merged_calendar`; `events, family_events, athlete_events`; `calendar.html, calendar-v2, calendar-merged` | rich UI   | **PROD**            | **Yes** | **refactor** (no HL-BOS equivalent) | L1,L3,L5 |
| **Schedule sync / calendar feed**  | HomeHuddle | Auto-sync sessions to family devices          | edge `sync-schedules`; `athlete-calendar-link.html`                                                               | link page | **FUNC** (inferred) | **Yes** | **refactor**                        | L3,L5    |

## C. CRM & contacts

| Capability                  | Product        | User problem                   | Evidence                                                                                                                 | Front-end       | Maturity            | Reuse?  | Factory class                                                                     | Layers   |
| --------------------------- | -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------- | ------- | --------------------------------------------------------------------------------- | -------- |
| **Family CRM & membership** | HomeHuddle     | Manage a family unit + members | `families, family_members, people, family_access`; RPCs `invite_family_member, remove_family_member, current_family_ids` | account, invite | **PROD**            | Partial | **refactor** (family graph is VW-specific; contact core overlaps HL-BOS identity) | L1,L3,L5 |
| **Lead capture**            | Venuewise Core | Capture prospects              | `leads` table                                                                                                            | join/contact    | **FUNC** (inferred) | Yes     | **adapter** (overlaps HL-BOS discovery/CRM-lite)                                  | L1,L3,L5 |

## D. Communications

| Capability                                   | Product    | User problem                 | Evidence                                                                                        | Front-end      | Maturity            | Reuse? | Factory class                                         | Layers |
| -------------------------------------------- | ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | -------------- | ------------------- | ------ | ----------------------------------------------------- | ------ |
| **Notifications (email + push + reminders)** | HomeHuddle | Never miss a change/reminder | edge `send-welcome, send-notifications, send-pin-reset`; `reminders, feeds, push_subscriptions` | alerts/feed UI | **FUNC** (inferred) | Yes    | **retire→HL-BOS / adapter** (overlaps HL-BOS `comms`) | L1,L5  |
| **Player/parent SMS**                        | HomeHuddle | Text players/parents         | RPC `request_player_sms`                                                                        | dashboards     | **FUNC** (inferred) | Yes    | **adapter** (fills HL-BOS Twilio seam)                | L1,L5  |

## E. Registration & payments ⭐ (fills a real HL-BOS gap)

| Capability                                   | Product                  | User problem              | Evidence                                                               | Front-end         | Maturity                                  | Reuse?  | Factory class                                              | Layers      |
| -------------------------------------------- | ------------------------ | ------------------------- | ---------------------------------------------------------------------- | ----------------- | ----------------------------------------- | ------- | ---------------------------------------------------------- | ----------- |
| **Program/clinic registration**              | CoachesHuddle/HomeHuddle | Sign up + pay for clinics | `join.html, coacheshuddle/join.html, clinic.html`; onboarding RPCs     | multi-step form   | **PROD**                                  | **Yes** | **refactor**                                               | L1,L3,L5    |
| **Stripe subscriptions (checkout + portal)** | HomeHuddle               | Recurring billing         | edge `stripe-checkout, stripe-portal`; `subscriptions` table; 12 pages | checkout redirect | **PROD** (front-end wired to live Stripe) | **Yes** | **adapter** — **directly fills HL-BOS's 501-stub billing** | L1,L3,L4,L5 |

## F. Facility operations

| Capability              | Product        | Evidence                                    | Front-end | Maturity  | Reuse?  | Factory class                            | Layers   |
| ----------------------- | -------------- | ------------------------------------------- | --------- | --------- | ------- | ---------------------------------------- | -------- |
| **Facility management** | FacilityHuddle | `facilityhuddle/dashboard.html, index.html` | dashboard | **PROTO** | Partial | **VW / refactor** (no HL-BOS equivalent) | L1,L3,L5 |

## G. Team & roster management

| Capability                            | Product            | Evidence                                                                                                       | Front-end | Maturity       | Reuse?  | Factory class     | Layers   |
| ------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- | --------- | -------------- | ------- | ----------------- | -------- |
| **Family athlete roster**             | HomeHuddle         | `family-athletes.html, create-athlete.html`; RPCs `my_athletes, my_athlete_candidates, create_athlete_profile` | roster UI | **PROD**       | **Yes** | **refactor**      | L1,L3,L5 |
| **Organization directory & profiles** | OrganizationHuddle | `organizationhuddle/{directory,dashboard,profile,join}.html`                                                   | org pages | **PROTO/FUNC** | Yes     | **VW / refactor** | L1,L3,L5 |

## H. Athlete development ⭐ (fully Venuewise-only)

| Capability                                    | Product                  | Evidence                                                                                                                                            | Front-end   | Maturity | Reuse?  | Factory class                       | Layers   |
| --------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ------- | ----------------------------------- | -------- |
| **Athlete profiles + goals + stats + sports** | AthleteHuddle/HomeHuddle | `athletes, athlete_goals, athlete_stats, athlete_sports`; `athlete-dashboard, athlete-onboarding, athletehuddle.html`; RPC `create_athlete_profile` | dashboards  | **FUNC** | **Yes** | **refactor** (no HL-BOS equivalent) | L1,L3,L5 |
| **Public athlete profile / recruiting page**  | AthleteHuddle            | `athlete-public-profile.html`; RPC `set_athlete_public`                                                                                             | public page | **FUNC** | **Yes** | **refactor**                        | L3,L4,L5 |

## I. Coaching

| Capability                                   | Product       | Evidence                                                                               | Front-end   | Maturity  | Reuse?  | Factory class | Layers   |
| -------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- | ----------- | --------- | ------- | ------------- | -------- |
| **Coach profiles + directory + connections** | CoachesHuddle | `coach_connections`; `coach-directory, coaches-dashboard, profile-create, coach-login` | directory   | **FUNC**  | **Yes** | **refactor**  | L1,L3,L5 |
| **Athlete spotlight / recognition**          | CoachesHuddle | RPC `submit_athlete_spotlight`; `spotlight-submit.html`                                | submit form | **PROTO** | Yes     | **refactor**  | L3,L5    |

## J. Media & content

| Capability              | Product       | Evidence                               | Front-end | Maturity             | Reuse? | Factory class | Layers   |
| ----------------------- | ------------- | -------------------------------------- | --------- | -------------------- | ------ | ------------- | -------- |
| **Athlete video/media** | AthleteHuddle | `athlete_videos` table; public profile | profile   | **PROTO** (inferred) | Yes    | **refactor**  | L3,L4,L5 |
| **Activity feeds**      | HomeHuddle    | `feeds` table                          | feed UI   | **FUNC** (inferred)  | Yes    | **adapter**   | L1,L5    |

## K. Analytics & reporting

| Capability                                 | Product        | Evidence                              | Front-end   | Maturity            | Reuse?  | Factory class                                                               | Layers |
| ------------------------------------------ | -------------- | ------------------------------------- | ----------- | ------------------- | ------- | --------------------------------------------------------------------------- | ------ |
| **Platform / workspace admin + reporting** | Venuewise Core | `venuewise-admin/, admin/, /platform` | admin pages | **STUB** (scaffold) | Partial | **retire→HL-BOS** (HL-BOS Executive Portal is the canonical report surface) | L1,L5  |

## L. AI capabilities

| Capability                              | Product        | Evidence               | Front-end | Maturity                                                        | Reuse? | Factory class                                                      | Layers |
| --------------------------------------- | -------------- | ---------------------- | --------- | --------------------------------------------------------------- | ------ | ------------------------------------------------------------------ | ------ |
| **Task automation (`smart-task`)**      | Venuewise Core | edge `smart-task`      | —         | **UNKNOWN** (backend inaccessible — cannot verify what it does) | ?      | **investigate** (needs backend access; overlaps HL-BOS AI gateway) | L1,L5  |
| **Batch processor (`super-processor`)** | Venuewise Core | edge `super-processor` | —         | **UNKNOWN**                                                     | ?      | **investigate**                                                    | L1,L5  |

## M. Integrations

| Capability                          | Product    | Evidence                                  | Maturity            | Reuse?    | Factory class                                       | Layers      |
| ----------------------------------- | ---------- | ----------------------------------------- | ------------------- | --------- | --------------------------------------------------- | ----------- |
| **Stripe (billing)**                | HomeHuddle | `stripe-checkout, stripe-portal`          | **PROD**            | **Yes**   | **adapter** (fills HL-BOS gap)                      | L1,L3,L4,L5 |
| **Web Push**                        | HomeHuddle | `push_subscriptions`                      | **FUNC** (inferred) | Yes       | **adapter**                                         | L1,L5       |
| **Calendar feed / sync**            | HomeHuddle | `sync-schedules`, `athlete-calendar-link` | **FUNC** (inferred) | Yes       | **refactor**                                        | L3,L5       |
| **Supabase (Auth/DB/Edge/Storage)** | all        | project `urwnbskrtoplgnkkxuvl`            | **PROD** (inferred) | — (infra) | **retire→HL-BOS** (HL-BOS is the canonical backend) | —           |

---

## User-problem summary (field #3, consolidated)

Venuewise/Huddle solves the **youth-sports / family coordination** problem: families juggling
multiple kids, teams, coaches, clinics, schedules, and payments get **one place** to register,
pay, see a merged calendar, get reminders/SMS, track athlete development, and connect with
coaches — under per-organization branding. That is a **coherent vertical domain HL-BOS does
not have.**

## Maturity headline (honest)

- **Genuinely production (front-end verified + repo says prod):** HomeHuddle core — family CRM,
  merged calendar, registration, Stripe subscriptions, PIN login, roster.
- **Functional-but-unverifiable-backend:** notifications, SMS, athlete profiles, coaching,
  schedule sync (front-end wired; DB not inspectable here).
- **Prototype / scaffold:** FacilityHuddle, OrganizationHuddle, spotlight, forms sandbox,
  Venuewise Core platform layer (workspaces/admin), media.
- **Unknown (needs backend access):** the two AI edge functions.
- **Not real software:** the standalone `coaches-huddle-chrismazzu` repo (demo scaffold);
  the `5star-*` / `hermanlegacy*` repos (static marketing).
