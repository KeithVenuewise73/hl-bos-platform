# Venuewise Capability Harvest · 00 — Evidence, scope & honesty boundary

**For:** Keith Herman, CEO · **Author:** Claude (AI engineer) · **Date:** 2026-07-31
**Read-only harvest. Nothing was modified, deployed, or written. No migrations. No redesign.**
Engineering Law #1 (assemble, don't rebuild) upheld — this task only _discovers and documents_.

## What I actually inspected (and could not)

| Source                                                                                              | Access                                 | What I could see                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase `ywrzgursvdowzyhipsmt` ("keith@venuewise.net")                                             | ✅ read-only                           | **Empty** — 0 schemas/tables/functions/users/buckets, no migrations. **Not** the Huddle backend.                                      |
| Supabase `urwnbskrtoplgnkkxuvl` ("Venuewise Platform") — **the real Huddle backend**                | ❌ **not reachable** by my credentials | Only its _shape_, inferred from the front-end (table/RPC/edge-function names). **Backend implementation NOT independently verified.** |
| GitHub `coaches-huddle-chrismazzu`                                                                  | ✅ cloned (read-only)                  | A **bare `create-next-app` scaffold** — one hardcoded demo page, no backend.                                                          |
| GitHub `homehuddle` (= **"Venuewise Core"** monorepo)                                               | ✅ cloned (read-only)                  | The **real functional app**: 62 HTML pages, sub-apps, `/shared`, `/docs`, smoke tests, and all the backend call-sites.                |
| Other repos (`5star-*`, `hermanlegacy*`, `ddhhomeservices`, `herman-supply-chain`, `laurieandlew*`) | listed, not cloned                     | Classified as **static marketing sites** from the application registry (external-hosted GitHub Pages); no functional-software signal. |

**The honesty-critical consequence:** every Venuewise/Huddle _backend_ maturity call in this
harvest is **inferred from the front-end + the repo's own status docs**, not verified against
the database (which I cannot reach). Where I say "functional," I mean the front-end is wired
to a live backend that the repo documents as production; I have **not** run it or read its
tables directly. Front-end maturity **is** directly verified (I read the code).

## What the repo tells us about itself (grounded in its own docs)

- `ARCHITECTURE.md`: **"Venuewise Core** is the shared, multi-tenant coordination platform
  that powers Herman Legacy Group businesses, the Huddle products, and future partner
  organizations."** Same philosophy as HL-BOS: _"Engines, not products"_, _"One Core, many
  Workspaces"_ (`workspace_id` + RLS), _"Configuration over custom code."_
- **"HomeHuddle production is Priority #1"** — HomeHuddle is **live** (`venuewise.net`); a
  Playwright **smoke suite runs against production**.
- Status = **Wave 0** (Safety Baseline + platform scaffold). The _platform_ layer
  (`/shared`, `/platform`, `/workspaces`) is a **scaffold "adopted by nothing yet"**; the
  _HomeHuddle app underneath it_ is the live, functional part.
- Iteration/legacy markers present (`calendar-v2`, `calendar-email-OLD`, `login-pin-OLD`,
  `demo`, `forms-sandbox`) — an actively-evolving codebase, not a frozen product.
- **33 of 62 HTML pages** call the backend (Supabase/edge/RPC); the rest are marketing/legal.

## Backend shape (names harvested from the front-end — not read from the DB)

- **~30 tables:** `families, family_members, family_access, people, leads, athletes,
athlete_events, athlete_goals, athlete_sports, athlete_stats, athlete_videos,
coach_connections, events, family_events, feeds, reminders, push_subscriptions,
subscriptions, form_templates, form_sections, form_fields, business_workspaces,
workspace_branding, workspace_roles, workflow_instances, workflow_instance_stages,
workflow_tasks, workflow_approvals, workflow_events`.
- **8 edge functions:** `send-welcome, send-notifications, send-pin-reset, sync-schedules,
stripe-checkout, stripe-portal, smart-task, super-processor`.
- **12 RPCs:** `get_merged_calendar, create_family_onboarding, create_athlete_profile,
my_athletes, my_athlete_candidates, current_family_ids, invite_family_member,
remove_family_member, set_athlete_public, submit_athlete_spotlight, request_player_sms`.

## Security note (factual, not a leak)

`shared/config.js` contains only the **public anon key** (JWT role `anon`) and a **publishable
key** — both client-safe by design and RLS-protected; the file itself documents this. **No
`service_role` or `sk_live/sk_test` secret was found** in the client code. Whether RLS is
actually sound cannot be verified without backend access — a caveat, not a finding. (Key
values are intentionally **not** reproduced in this document.)

## Scope statement

This harvest answers **"what functional software exists in Venuewise/Huddle and what can the
Factory reuse without rebuilding"** from the evidence above. It does **not** migrate, redesign,
or recommend executing a migration (explicitly out of scope for this task).
