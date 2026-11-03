# HLG Commercial Capability & Reuse Audit

**Date:** 2026-11-03 · **For:** Keith Herman, CEO · **Author:** Claude (AI engineer)
**Method:** read-only. No production code, schema, DNS, credentials, provider settings or billing were changed. No message was sent, no payment taken, no customer contacted. No personal data or secret values appear in this report.

---

## 0. What was inspected, and what could not be

### Systems inspected

| System                                   | Location / commit                                                                                                                                         | Where it runs                                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HomeHuddle front end (Venuewise)         | `KeithVenuewise73/homehuddle` `main` @ `c92f003` (last GitHub Pages deploy 2026-07-04, success)                                                           | GitHub Pages → `venuewise.net`                                                                                                                                                                                                   |
| HomeHuddle billing source                | `homehuddle` branch `feat/homehuddle-ios-release` @ `ebfde29` (unmerged)                                                                                  | Deployed to Venuewise Platform per `docs/appstore/production-change-inventory.md` on that branch                                                                                                                                 |
| HomeHuddle backend (Venuewise Platform)  | Supabase project `urwnbskrtoplgnkkxuvl`. **Source is not in any repo** except the two Stripe functions above                                              | Supabase, us-east-1. Last read-only inspections on record: 2026-07-31 (`hl-bos-platform/docs/products/venuewise-backend-harvest`) and 2026-09-23→28 (`hl-bos-platform` branch `claude/homehuddle-diagnostic-4phwmj` @ `addf9f9`) |
| HL-BOS platform                          | `KeithVenuewise73/hl-bos-platform` `main` @ `ce3456a`; CI run 41008330754 **green** 2026-10-30                                                            | Supabase "HL-BOS Core" `mvvtngiopdrgiedjmhfb`; apps on Coolify                                                                                                                                                                   |
| Herman Legacy Digital website            | `hl-bos-platform/apps/herman-legacy-digital` @ `main`                                                                                                     | Coolify → `hermanlegacydigital.com` (health check disabled; status "running:unknown")                                                                                                                                            |
| BarberOS (shop app + shop pages)         | `hl-bos-platform` branch `claude/shop-transformation-barber-os-ntwb2n` @ `f85577d` (**unmerged**, 32 ahead / 96 behind `main`)                            | Coolify → `app.hermanlegacydigital.com`, `shops.hermanlegacydigital.com`                                                                                                                                                         |
| HSCS-GLP (government logistics) + DMA-OS | `KeithVenuewise73/HSCS-GLP` @ `4fb1793`                                                                                                                   | Coolify → `hscs.hermansupplychainsolutions.com` ("running:healthy")                                                                                                                                                              |
| CharacterStudio / AI Persona X           | `KeithVenuewise73/characterstudio` @ `2c0caea`                                                                                                            | Coolify → `app.aipersonax.com`, `lab.aipersonax.com`; own Supabase projects                                                                                                                                                      |
| Static marketing sites                   | `hermanlegacygroup`, `herman-supply-chain`, `ddhhomeservices.com`, `5stargrowthsolutions`, `5star-sports-media`, `coaches-huddle-chrismazzu`              | CNAMEs: hermanlegacygroup.com, www.hermansupplychainsolutions.com, ddhhomeservices.com, 5stargrowthsolutions.com, 5starsportsmedia.com                                                                                           |
| Unmerged capability branches             | `dispatchos-match-backhaul`, `hld-inquiry-delivery`, `hld-agency-launch-package`, `herman-legacy-intake-pipeline`, `barberos-current-state-audit`, others | Not deployed unless stated                                                                                                                                                                                                       |
| Hosting control plane                    | Coolify 4.5.3 (`coolify.aipersonax.com`), **one server**, 2 projects, 11 applications, **0 Coolify databases, 0 services**                                | Single host at a DigitalOcean IP                                                                                                                                                                                                 |

### Tests run during this audit (2026-11-03, this cloud session, offline, no production access)

| Suite                                                         | Command                                                                                                       | Result                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| HL-BOS `main` unit tests                                      | `pnpm vitest run`                                                                                             | **2,264 passed, 2 skipped** (174 files)         |
| HL-BOS edge-function tests                                    | `deno test --no-check supabase/functions/tests/`                                                              | **130 passed, 0 failed**                        |
| BarberOS branch (`f85577d`)                                   | `pnpm --filter @hl-bos/barbershop test`; root `pnpm test`                                                     | **76 passed**; root **1,008 passed, 1 skipped** |
| HSCS-GLP                                                      | `npm ci && vitest run`                                                                                        | **287 passed** (28 files)                       |
| CharacterStudio                                               | `pnpm test`                                                                                                   | **1,017 passed** (57 files)                     |
| HomeHuddle                                                    | Only Playwright smoke tests exist, and they target production → **not run**. `node --check` syntax pass only. |                                                 |
| Database tests (pgTAP, 47 files / 1,180 assertions on `main`) | Need Docker + local Supabase → **not run here**; CI ran them green on 2026-10-30                              |                                                 |

Unit tests use mocked providers. **None of these runs proves a message was delivered or a payment was taken.**

### Access blocked (these are gaps in verification, not evidence that something is absent)

1. **Supabase.** The connector in this session reaches only the CharacterStudio organization. Venuewise Platform (`urwnbskrtoplgnkkxuvl`), HL-BOS Core (`mvvtngiopdrgiedjmhfb`) and the legacy project (`bkfs…`) could not be queried. All live row counts below come from earlier dated inspections.
2. **Stripe.** No account access. I could not confirm that any charge has succeeded, or check live mode, the webhook endpoint or the portal configuration.
3. **Twilio.** No account access. I could not confirm whether the suspension recorded on 2026-08-23 was lifted, or check delivery logs and 10DLC registration.
4. **Live websites.** This session's network policy blocks requests to every HLG domain (HTTP 403 at the proxy). Liveness comes from Coolify status and GitHub Pages build history only.
5. **DigitalOcean, DNS registrar, Google Workspace and email domain settings.** No access. Server size, monthly cost, backups and DNS records are unverified.
6. **Official pricing pages** (twilio.com, stripe.com, supabase.com, resend.com) were blocked. Prices in §5 come from web-search summaries of those official pages and must be confirmed before quoting.
7. **SalonOS / SalonAI / Canvas Hair Co / FleetHuddle / TransportationAI.** No code for these exists in any of the 14 repositories this GitHub account can see. If they live elsewhere (another account, a local machine, a no-code tool), that location has not been shared.

---

## 1. Executive summary

### What HLG can sell now

- **Website build, hosting and maintenance.** HLG runs custom-domain websites today: static sites on GitHub Pages, and Docker apps on Coolify with HTTPS. That covers 6 static sites and several apps. The scope that can be supported honestly is: build, host, publish updates, domain coordination and fix-on-report support.
  - **Exclusions:** uptime monitoring, automatic backups and redundancy. HLG has none of these today.

### What can be sold after bounded configuration or a small build

- **Website inquiry form that reaches the business.** Forms already save into a database. What is missing is the notification to a person, which is a small build.
- **Payments in the customer's own Stripe account.** This means Payment Links or Checkout buttons, including deposits. It is configuration of Stripe's hosted tools, not HLG software.
- **Online booking by linking or embedding the customer's booking tool.** BarberOS already has a `booking_url` field for this.
- **Review-request link and QR code.** This is configuration only.
- **Basic traffic analytics.** This is configuration only.

### Pilot only (keep off the public price list)

- **Automated SMS for schedule changes and reminders.** Real, and it ran in production for HomeHuddle. But it is coded for families and sports teams. Its source is mostly outside version control. Twilio suspended the account for an unpaid balance on 2026-08-23, and 178 texts failed without anyone noticing.
- **Recurring subscription checkout.** Real in HomeHuddle, but it is wired to one Stripe account and to families.
- **BarberOS.** The shop page, owner sign-in and client record are live. Booking is built but not applied. It runs from an unmerged branch whose migration numbers collide with `main`.
- **Web push** (HomeHuddle, one subscriber on record).
- **Lowe's driver KPI dashboard** (`herman-supply-chain`). It runs on real uploaded data but has no sign-in and runs unauthenticated deletes.
- **DispatchOS backhaul matcher.** Unmerged; sample data or CSV upload; no storage.

### Requires development (not on the sales page)

- CRM pipelines and follow-up sequences
- Transactional or marketing email
- Integrated merchant payments (Stripe Connect), invoices and deposits inside HLG software
- Customer portals and document delivery
- Job, task and workflow software for customers
- Review automation and reputation monitoring
- Customer-acquisition dashboards
- Salon software
- Fleet dispatch, routing, DVIR and live driver KPIs

### The most important corrections to earlier readiness assumptions

1. **Keith is right that HomeHuddle messaging and payments are real.**
   - **Texting:** the path from a schedule change to a text exists in the production database. Inspection records show 284 texts in the outbox (2026-07-31) and texts sent to families.
   - **Billing:** Stripe checkout and webhook versions were deployed to production in August 2026.
   - **What this does not mean:** these are HomeHuddle's own features, working for one product. They are not packaged for other businesses.
2. **No HLG system lets a business collect money from its own customers.** There is no Stripe Connect, no merchant onboarding and no payment routing anywhere. HomeHuddle billing is HomeHuddle charging families $4.99 or $9.99 a month into one Stripe account.
3. **HL-BOS "Communications ✓" and "Billing ✓" in the earlier inventories are wrong.**
   - The database design is solid and tested: consent, suppression, retries and refund approval.
   - Every real provider still throws "not configured". No worker sends anything.
   - The Stripe webhook returns 501.
4. **Inquiries from hermanlegacydigital.com are being lost.**
   - The general inquiry form tells visitors "Your request is captured; our team will confirm it directly". But the live server has no delivery destination set.
   - The inquiry goes only to a server log, and that log is wiped on every redeploy (27 so far).
   - Nobody is notified. The business-assessment form does save to the database, but it also notifies no one.
   - A fix is written on branch `claude/hld-inquiry-delivery` and is waiting for a choice of destination.
5. **Production is running code that is not on `main`.**
   - BarberOS is served from an unmerged branch.
   - Its migrations 0048–0059 reuse numbers that `main` uses for different migrations (0048–0052), and seven files conflict.
   - An audit branch records that production holds more migrations than the repository does.
   - The HomeHuddle backend (23 edge functions) is almost entirely outside version control.
6. **There are trust and security defects that must be fixed before any of this code is reused for customers:**
   - **HomeHuddle admin login:** gated by a 4-digit PIN hardcoded in browser code.
   - **Fabricated revenue figures** in `homehuddle/venuewise-admin/index.html` (for example "Platform Revenue $8,241").
   - **5star analytics dashboard:** a client-side password protects hand-entered metrics.
   - **`herman-supply-chain` dashboards:** run bulk deletes using the public key, with no sign-in.

---

## 2. Master capability matrix

Classification key:

- **SELL NOW** = demonstrated and supportable in a defined scope
- **CONFIG** = sell after configuration or integration
- **PILOT** = pilot only
- **DEV** = requires development

Confidence key:

- **High** = verified in code and tests this session
- **Medium** = code plus a dated record of production
- **Low** = indirect evidence only
- **BLOCKED** = unverified, access blocked

| #   | Capability                                            | Source                                                                                                                                                                                                      | Current functionality                                                                                                                   | Deployment                                           | Evidence                                                                                                                                   | Class                                                                          | Reuse work                                                                                         | Dependencies                                  | Costs (see §5)                              | Gaps                                                                                                                               | Confidence                                                          |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1a  | Web form capture to database                          | Static sites (`contact_submissions`, `ddh_quote_requests`, `growth_demo_requests`); HLD assessment RPC `submit_business_transformation_intake` (0031)                                                       | Visitor submits; a row is written                                                                                                       | Live sites (GitHub Pages / Coolify)                  | Code (`hermanlegacygroup/contact.html:335`, `ddhhomeservices.com/quote.html:335`, `apps/herman-legacy-digital/src/lib/btdi-persist.ts:57`) | **CONFIG**                                                                     | Add a notification and an inbox view; move off the legacy project                                  | Supabase                                      | Supabase plan                               | No one is notified. Static-site forms write to the legacy project, which is out of scope and has open security findings.           | Medium                                                              |
| 1b  | HLD general inquiry delivery                          | `apps/herman-legacy-digital/src/lib/persist.ts`                                                                                                                                                             | **Does not deliver.** Logs to stdout and returns `persisted:false`                                                                      | Coolify (no `HLD_INTAKE_WEBHOOK_URL`)                | Coolify env names; `persist.ts:19-27`                                                                                                      | **DEV** (fix written, unmerged)                                                | Merge `hld-inquiry-delivery`, choose a destination                                                 | Destination (HubSpot form, Supabase or email) | —                                           | Live inquiries are lost                                                                                                            | High                                                                |
| 1c  | CRM, pipeline, follow-up                              | HL-BOS: none. Venuewise: `leads` table (0 rows). BarberOS: client CRM (barber-specific)                                                                                                                     | BarberOS: client list, visit history, haircut spec, "clients due" engine                                                                | BarberOS 0058 applied; 0 clients in production       | pgTAP `58_barberos_client_crm.sql` (39 assertions); 76 app tests                                                                           | **DEV** (generic); **PILOT** (barbers)                                         | Generic contacts/deals schema, or integrate HubSpot                                                | —                                             | —                                           | No pipeline, tasks, sequences or reminders                                                                                         | Medium                                                              |
| 2a  | SMS: schedule-change texts                            | Venuewise DB: `trg_events_sms` → `schedule_change_queue` → `flush_schedule_digests()` (every 2 min) → `sms_outbox` → `send-sms-outbox` (cron every 2 min) → Twilio                                          | Text sent to family phones when a synced team event changes; one digest per family per sync since 2026-09-28                            | Venuewise production                                 | Harvest 2026-07-31: 284 outbox rows. Diagnostic branch `addf9f9`: rolled-back replay shows 136 texts reduced to 4                          | **PILOT**                                                                      | Pull the source into version control; key by workspace; per-business sender, templates and consent | Twilio account, 10DLC registration            | Twilio per-segment + carrier + 10DLC fees   | Twilio suspended for unpaid balance 2026-08-23; 178 texts failed unnoticed; failure alert was itself an SMS. Source not in a repo. | Medium (BLOCKED for current status)                                 |
| 2b  | SMS: nightly reminders                                | Venuewise cron `nightly-reminders-generate` (21:30/22:30) + `reminders` table + in-app banner (`homehuddle/calendar.html:641-656`)                                                                          | Reminder rows generated nightly; banner shown on the day                                                                                | Venuewise production                                 | Harvest: 30 reminder rows                                                                                                                  | **PILOT**                                                                      | Same as 2a                                                                                         | Twilio                                        | Same                                        | Same                                                                                                                               | Medium                                                              |
| 2c  | SMS: inbound replies and STOP                         | Venuewise `sms-inbound` edge function                                                                                                                                                                       | Unknown. Source not in a repo                                                                                                           | Production (listed active)                           | Function name only                                                                                                                         | **PILOT**                                                                      | Verify STOP/HELP handling before any reuse                                                         | Twilio                                        | —                                           | STOP compliance unverified; the legal pages promise it                                                                             | Low                                                                 |
| 2d  | SMS: sign-in codes                                    | Supabase Auth phone OTP (`homehuddle/join.html:617`)                                                                                                                                                        | Phone sign-in                                                                                                                           | Production                                           | Code; 7 auth users (2026-07-31)                                                                                                            | **CONFIG** (for any portal)                                                    | Supabase Auth SMS provider setup                                                                   | Twilio via Supabase                           | Per message                                 | —                                                                                                                                  | Medium                                                              |
| 2e  | HL-BOS comms engine                                   | `0019_communications`; `_shared/comms/{twilio,email,mock}.ts`                                                                                                                                               | Consent, suppression, idempotent queue, delivery log, per-tenant sender identity. **Every provider throws "not configured"; no worker** | Schema on HL-BOS Core; nothing sends                 | pgTAP; Deno tests 130 passed                                                                                                               | **DEV**                                                                        | Build the worker; implement Twilio and email adapters; add inbound STOP and unsubscribe link       | Twilio, email provider                        | —                                           | No channel can deliver                                                                                                             | High                                                                |
| 2f  | Email                                                 | HomeHuddle `send-welcome`, `smart-task` (provider unknown); HL-BOS email adapter (no vendor)                                                                                                                | HomeHuddle sends a welcome and PIN email (failures swallowed)                                                                           | Venuewise production                                 | Front-end calls only                                                                                                                       | **DEV**                                                                        | Choose a vendor; per-business domain verification (SPF/DKIM)                                       | Email provider                                | Email provider plan                         | No unsubscribe; sender fixed to HomeHuddle                                                                                         | Low                                                                 |
| 2g  | Web push                                              | HomeHuddle VAPID push (`homehuddle/calendar.html:601-627`, `sw.js`, `send-notifications`)                                                                                                                   | Browser subscribes; admin test push                                                                                                     | Production                                           | Harvest: 1 subscription                                                                                                                    | **PILOT**                                                                      | Per-business VAPID keys and service worker                                                         | —                                             | Free                                        | iOS needs an installed app (APNs blocked)                                                                                          | Medium                                                              |
| 3a  | HLG billing its own clients                           | HL-BOS billing (0015/0016): plans, subscriptions, invoices, refund approval                                                                                                                                 | Schema and permissions only; `StripeProvider` throws; `billing-webhook` returns 501                                                     | Schema on HL-BOS Core                                | pgTAP `16_`, `17_`                                                                                                                         | **DEV** (software). Interim: Stripe Invoicing / Payment Links run manually     | Implement Stripe adapter and webhook                                                               | Stripe account                                | Stripe fees                                 | —                                                                                                                                  | High                                                                |
| 3b  | Recurring subscription checkout                       | HomeHuddle `stripe-checkout` v9 / `stripe-webhook` v7 (source on `feat/homehuddle-ios-release`)                                                                                                             | Stripe Checkout (subscription mode, 14-day trial), founder pricing pool, signature-verified webhook updating `subscriptions`            | Venuewise production (deployed 2026-08)              | Branch doc `production-change-inventory.md`; 1 subscription row; "existing production trialing subscription"                               | **PILOT**                                                                      | Template only: per-business keys, products and redirect URLs; strip family logic                   | Business's Stripe account                     | Stripe Billing fees                         | No successful charge verified; one Stripe account; family-keyed                                                                    | Medium (BLOCKED on Stripe)                                          |
| 3c  | Customer portal (manage card, cancel)                 | HomeHuddle `stripe-portal`                                                                                                                                                                                  | Opens Stripe's hosted billing portal                                                                                                    | Production                                           | Front-end call `homehuddle/account.html:552-567`; source not in repo                                                                       | **PILOT**                                                                      | As 3b                                                                                              | Stripe                                        | —                                           | —                                                                                                                                  | Low                                                                 |
| 3d  | Refunds                                               | HomeHuddle webhook records `charge.refunded`; HL-BOS `request_refund` → approval → `apply_refund` (schema only)                                                                                             | Refunds issued by hand in the Stripe dashboard                                                                                          | —                                                    | Webhook code; pgTAP                                                                                                                        | **CONFIG** (manual in Stripe) / **DEV** (in-app)                               | —                                                                                                  | Stripe                                        | Stripe keeps its fee on refunds             | No in-app refunds                                                                                                                  | Medium                                                              |
| 3e  | Invoices, deposits                                    | None in any HLG code                                                                                                                                                                                        | —                                                                                                                                       | —                                                    | Repository-wide search                                                                                                                     | **CONFIG** (Stripe-hosted) / **DEV** (integrated)                              | —                                                                                                  | Business's Stripe account                     | Stripe fees                                 | —                                                                                                                                  | High                                                                |
| 3f  | Business collecting from its own customers (merchant) | **None.** No Connect, no merchant onboarding, no payment routing                                                                                                                                            | —                                                                                                                                       | —                                                    | Repository-wide search                                                                                                                     | **CONFIG** (business's own Stripe + Payment Links); **DEV** (Connect platform) | Connect onboarding, fees and payouts would be new                                                  | Stripe Connect                                | Connect fees                                | —                                                                                                                                  | High                                                                |
| 4a  | Booking: link or embed external tool                  | BarberOS `booking_url` (`site_render.ts:62`); HLD site templates                                                                                                                                            | "Book" button opens the business's booking tool                                                                                         | shops.hermanlegacydigital.com                        | Code                                                                                                                                       | **CONFIG**                                                                     | —                                                                                                  | Business's booking tool                       | That tool's fee                             | —                                                                                                                                  | High                                                                |
| 4b  | Booking: native appointment book                      | BarberOS `0059_barberos_booking` + `apps/barbershop/.../book`, `rota`                                                                                                                                       | Staff-side book, rota, no double-booking (exclusion constraint), no-show, completion writes a visit                                     | **Not applied**; screens show "not switched on"      | pgTAP `59_` (45 assertions, not run here); app tests 76 passed                                                                             | **PILOT** (after approval)                                                     | Merge and renumber; customer self-booking; reminders                                               | Approval to apply 0059                        | —                                           | No customer self-booking, no reminders, no deposits                                                                                | Medium                                                              |
| 4c  | Calendar sync and family calendar                     | HomeHuddle `sync-schedules` (cron every 30 min; GameChanger, TeamSnap, LeagueApps iCal) + calendar UI                                                                                                       | Imports team schedules; month and list views; `.ics` export                                                                             | Production                                           | Code + harvest                                                                                                                             | **PILOT** (sports orgs only)                                                   | —                                                                                                  | —                                             | —                                           | Sports-specific                                                                                                                    | Medium                                                              |
| 4d  | Facility booking                                      | Venuewise `bookings`, `open_slots`, `facility_events` + `facilityhuddle/`                                                                                                                                   | Thin UI; browser-side access-code login                                                                                                 | Production                                           | Live table names (rls-baseline)                                                                                                            | **PILOT**                                                                      | Real authentication                                                                                | —                                             | —                                           | Weak authentication                                                                                                                | Low                                                                 |
| 5   | Customer portal, accounts, documents                  | HomeHuddle family accounts (phone OTP); Venuewise `document-generate/approve/download` (source not in repo); HL-BOS identity + HLD portal routes (code); BarberOS owner sign-in                             | Product-specific portals only                                                                                                           | Various                                              | Code; tests on HL-BOS identity                                                                                                             | **DEV** (generic)                                                              | Generic portal shell on HL-BOS identity                                                            | Supabase Auth                                 | —                                           | No sign-up or password reset in BarberOS                                                                                           | Medium                                                              |
| 6   | Job, task, workflow                                   | HL-BOS workflows (0013, approvals; used by refunds); Venuewise `workflow-*` functions + `shared/workflow.js` (sandbox only); HSCS contract admin                                                            | Internal approval gate; no customer job board                                                                                           | Schema only                                          | pgTAP                                                                                                                                      | **DEV**                                                                        | Job/task UI on workflows                                                                           | —                                             | —                                           | —                                                                                                                                  | Medium                                                              |
| 7   | Review requests and reputation                        | BarberOS `review_engine` (planned, blocked); `visibility.reviews` (no write path)                                                                                                                           | **Nothing operates**                                                                                                                    | —                                                    | Repository-wide search                                                                                                                     | **CONFIG** (manual link/QR) / **DEV** (automation)                             | —                                                                                                  | Google Business Profile access                | —                                           | Review gating blocked by design (correct)                                                                                          | High                                                                |
| 8a  | Traffic analytics                                     | 5star first-party tracker `assets/js/analytics.js` → `page_views`; HLD `/api/event` forwarder                                                                                                               | Page-view counts                                                                                                                        | Production (5star)                                   | Harvest: 703 views                                                                                                                         | **CONFIG** (standard analytics tool)                                           | —                                                                                                  | —                                             | Tool's plan                                 | 5star dashboard figures are hand-entered                                                                                           | Medium                                                              |
| 8b  | Online presence and visibility audit                  | `packages/presence-scanner` (Google Places, SSRF-guarded fetch, deterministic score); BarberOS transform audit (40 runs over 50 WNY shops, all findings "inferred")                                         | Prospect scoring for HLG sales                                                                                                          | Control Center (local)                               | 482 tests passed                                                                                                                           | **PILOT** (internal sales tool)                                                | Persist to Supabase; customer-safe report                                                          | Google Places API key                         | Google Places per-request pricing           | No site actually fetched in the BarberOS audits                                                                                    | High                                                                |
| 8c  | Acquisition attribution                               | UTM capture on HomeHuddle branch `claude/gracious-ride-k4kqan` (unmerged)                                                                                                                                   | —                                                                                                                                       | —                                                    | Branch only                                                                                                                                | **DEV**                                                                        | —                                                                                                  | —                                             | —                                           | —                                                                                                                                  | Low                                                                 |
| 9   | Authentication, roles, tenant isolation, provisioning | HL-BOS identity spine (0002/0003/0006/0007/0008/0010/0011): tenants, memberships, invitations, permission checks, forced RLS, Vault-referenced credentials                                                  | Strongest reusable asset                                                                                                                | Applied to HL-BOS Core                               | pgTAP 1,180 assertions (CI green 2026-10-30)                                                                                               | **CONFIG** (foundation for portals; not sold by itself)                        | Self-serve tenant provisioning (BarberOS second shop was hand-built)                               | Supabase                                      | Supabase plan                               | Provisioning manual; HomeHuddle model is family-keyed with hardcoded admin PIN                                                     | High                                                                |
| 10a | Barbershop module                                     | BarberOS (see §3 and 4b)                                                                                                                                                                                    | Shop page, owner editor, client CRM, catalog of 16 capabilities (3 built)                                                               | Live on two subdomains with HLG's own test shop only | 76 + 132 + 143 tests passed; pgTAP not run                                                                                                 | **PILOT**                                                                      | Merge and renumber; provisioning; reminders                                                        | Approvals                                     | —                                           | Not merged; migration drift                                                                                                        | Medium                                                              |
| 10b | Salon module                                          | No code. BarberOS ADR says "SalonOS reuses barberos.capabilities"; site-builder `salon_barber` vertical; `salonai` seeded plan                                                                              | —                                                                                                                                       | —                                                    | —                                                                                                                                          | **DEV**                                                                        | Generalize BarberOS visit spec                                                                     | —                                             | —                                           | —                                                                                                                                  | High (absent from accessible repos; BLOCKED if it exists elsewhere) |
| 10c | Fleet: dispatch, routing, DVIR, driver KPIs           | Dispatch/DVIR: none. `herman-supply-chain/Lowes-KPI.html` (XLSX upload → Lowe's driver/carrier KPI scoring); HSCS-GLP FleetHuddle handoff (`mock: true`); DispatchOS branch (backhaul matcher, sample data) | KPI scoring from uploaded data; government-contract pipeline                                                                            | KPI page on GitHub Pages; HSCS-GLP on Coolify        | HSCS 287 tests; KPI page code                                                                                                              | **PILOT** (KPI dashboard after security fix); **DEV** (dispatch/DVIR)          | Sign-in + RLS on KPI data                                                                          | —                                             | —                                           | KPI page runs unauthenticated deletes                                                                                              | Medium                                                              |
| 10d | Sports organization management                        | HomeHuddle, CoachesHuddle, OrganizationHuddle, 5star (athletes, spotlights, academy, gametracker)                                                                                                           | Live sports pages and admin                                                                                                             | Production                                           | Code + harvest                                                                                                                             | **PILOT** (sports vertical only)                                               | Fix admin auth; tighten academy RLS (minors' data)                                                 | —                                             | —                                           | Any signed-in user can read academy applications                                                                                   | Medium                                                              |
| 11  | Website hosting, domains, deploy, recovery            | Coolify (1 server, Docker builds from GitHub, HTTPS per domain); GitHub Pages; git history for rollback                                                                                                     | Builds, hosts, serves HTTPS on custom domains; health checks on 3 of 11 apps                                                            | Production                                           | Coolify API; Pages build history                                                                                                           | **SELL NOW** (defined scope)                                                   | Uptime monitoring; DB backup policy; written restore runbook                                       | DigitalOcean, GitHub, registrar               | Server + domain (measured cost not visible) | Single server; no monitoring; no Coolify-managed backups; DNS manual                                                               | Medium                                                              |

---

## 3. HomeHuddle reuse findings

### 3.1 Messaging, end to end (what actually happens)

1. **The schedule arrives.** A family links team calendars (GameChanger, TeamSnap, LeagueApps iCal) at signup (`homehuddle/join.html:307-320`). The `sync-schedules` edge function runs every 30 minutes (cron `sync-schedules-every-30min`) and also on manual sync. It writes into `events`.
2. **A change is detected.** The database trigger `trg_events_sms` filters for future, real and not-duplicate changes for a known family. Since 2026-09-28 it writes to `schedule_change_queue`.
3. **One message per family.** `flush_schedule_digests()` runs every 2 minutes. It waits until a family's changes have been quiet for 3 minutes, then queues one text into `sms_outbox`. This was proven by a rolled-back replay on production data: 136 texts became 4.
4. **The text is sent.** The edge function `send-sms-outbox` (cron every 2 minutes) sends through Twilio. Inbound replies go to `sms-inbound`.
5. **Other channels:**
   - nightly reminders (cron at 21:30 and 22:30) into `reminders`, shown as an in-app banner
   - welcome and PIN emails via `send-welcome` / `smart-task`
   - web push via VAPID and `send-notifications`
   - sign-in codes via Supabase Auth phone OTP

**What is proven.** The database objects, cron jobs and functions were observed in production (2026-07-31). There were 284 outbox rows. The 2026-09 diagnostic work changed and tested the trigger path with Keith's approval.

**What failed.**

- Twilio suspended the account in June after a burst of texts.
- It suspended it again on 2026-08-23 for an unpaid balance.
- 178 texts failed over a month with nobody alerted, because the alert itself was an SMS.

**Current Twilio status is unverified.**

**Recipient controls, as far as they go:**

- a `receives_sms` toggle at signup
- an under-13 SMS default on an unmerged branch
- STOP/HELP is promised in `terms.html:79-89`, but the handler source is not in any repo

**Coupling:**

- Keyed on family and phone.
- Message wording is hardcoded ("Family — Schedule change…", "venuewise.net").
- One Twilio sender for all.
- Service-worker text is fixed to "HomeHuddle".

### 3.2 Payments, end to end

1. A signed-in family calls `stripe-checkout` with its `family_id`. The function checks the founder pool (`founder_slots_remaining('homehuddle')`, capped at 100) and resolves the price by lookup key: Founding $4.99/month with no trial, or Standard $9.99/month with a 14-day trial in code. It creates or reuses a Stripe customer and returns a Stripe Checkout URL in subscription mode.
2. Stripe calls `stripe-webhook`. That function verifies the HMAC signature with a timing-safe compare (v7). It handles `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed/succeeded` and `charge.refunded`. It upserts `subscriptions` per family, product and source, then recomputes entitlements.
3. The app unlocks if the subscription status is `active` or `trialing` (`homehuddle/calendar.html:1521-1530`). That gate is client-side only, and data protection relies on RLS.
4. `stripe-portal` opens Stripe's hosted portal for card changes and cancellation.

**Deployed:** `stripe-checkout` v9 and `stripe-webhook` v7 went to Venuewise production in August 2026, with Keith's narrow authorization. Rollback copies of v8/v6 are kept on the branch. Production held 1 subscription row, described as "trialing".

**Not verified:** any successful charge, because Stripe access was blocked.

**Not present:**

- one-time payments
- deposits
- invoices issued from the app
- in-app refunds (done by hand in the Stripe dashboard)
- Stripe Connect
- multi-business support

**Mismatches between the legal pages and the app:**

- `terms.html:80` says "30-day trial, $4.95/month" while the app says 14 days and $4.99.
- `privacy.html:110` says no payment information is collected.
- Stripe's customer-facing product name is still "Venuewise Family Plan".

### 3.3 What can be reused for an unrelated business (a plumber, a salon)

| Component                                                     | Reusable as-is?                                                              | What must change                                                                                                                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change-to-digest-to-outbox-to-Twilio pipeline (design)        | **Yes, as a design.** Burst control, dedupe and outbox are the right pattern | Pull the source into version control. Key by business, not family. Per-business sender number and 10DLC campaign. Templates per business. STOP/HELP handling verified. A failure alert that does not use SMS. |
| Nightly reminder job                                          | Design yes                                                                   | Appointment-based instead of team-event-based                                                                                                                                                                 |
| Stripe checkout + webhook                                     | **As a template only**                                                       | Each business needs its own Stripe account (or Connect). Products and prices per business. Remove founder/family logic. Add an idempotency record keyed on event ID.                                          |
| Stripe hosted portal                                          | Yes, per Stripe account                                                      | Configure per account                                                                                                                                                                                         |
| Calendar UI and iCal sync                                     | Sports/family only                                                           | A business needs its own appointment source                                                                                                                                                                   |
| Phone-OTP sign-in                                             | Yes (Supabase Auth)                                                          | Per-project SMS provider                                                                                                                                                                                      |
| Forms and workflow engines (`shared/forms.js`, `workflow.js`) | Sandbox only                                                                 | Not in use; treat as prototypes                                                                                                                                                                               |
| Admin dashboards                                              | **No**                                                                       | Hardcoded PIN; fabricated revenue figures in `venuewise-admin`                                                                                                                                                |

**Bottom line.** HomeHuddle proves that HLG can run automated texting and subscription billing in production. Reusing them for other businesses is an extraction-and-rebuild job.

- **The rebuild target:** the HL-BOS comms and billing schemas, which already have per-tenant sender identity, consent, suppression, idempotency and refund approval, but no working provider.
- **What it is not:** a configuration change.

---

## 4. Customer-ready add-on shortlist

Only these qualify today. Each is honest about whether HLG software or a third-party tool does the work.

### 4.1 Inquiry form that reaches you

- **Problem solved:** website visitors' questions are lost or slow to answer.
- **Included:** a contact or quote form on the site, saved to a database, plus an immediate email notification to the business.
- **Excluded:** CRM pipeline, automated follow-up, SMS.
- **Reused:**
  - the form-to-database pattern from the static sites
  - the delivery fix with retry, idempotency and no PII in logs (branch `claude/hld-inquiry-delivery`)
  - HL-BOS tenant tables
- **Remaining work:**
  - pick the email provider
  - build the notification sender with failure alert
  - an inbox view, or a forward to HubSpot
  - move customer forms off the legacy Supabase project
- **Acceptance checklist:**
  - A test submission arrives by email within 1 minute.
  - A provider outage shows the visitor an honest "not sent, please call" message.
  - Nothing is lost on redeploy.
  - No PII in server logs.
  - Spam is filtered.
- **Support obligations:** monitor delivery failures; keep the email domain authenticated.
- **Safe description:** "Your website's contact and quote forms send each request straight to your inbox."

### 4.2 Take payments and deposits in your own Stripe account

- **Problem solved:** collecting deposits or payments online.
- **Included:**
  - set up the business's own Stripe account (the owner signs up and owns it)
  - create Payment Links or Checkout buttons for services and deposits
  - place them on the site
  - show the owner how to refund in Stripe
- **Excluded:** HLG-run payment processing, invoicing software, refunds through HLG, accounting sync.
- **Reused:** HomeHuddle's checkout and redirect experience as a reference. No HLG code is in the money path.
- **Remaining work:** none in code; a setup checklist.
- **Acceptance checklist:**
  - A test-mode payment and a live $1 payment both reach the business's own Stripe balance.
  - Refund performed by the owner.
  - Success and cancel pages work.
- **Support obligations:** link changes when prices change. Stripe supports the account itself.
- **Safe description:** "We connect your website to your own Stripe account so customers can pay or leave a deposit online. Money goes directly to you."

### 4.3 Book online

- **Problem solved:** phone tag for appointments.
- **Included:** connect or embed the booking tool the business already uses or chooses (Square, Booksy, Calendly, etc.) and put "Book" buttons site-wide.
- **Excluded:** HLG's own booking engine (BarberOS booking is pilot-only), reminders.
- **Reused:** the BarberOS `booking_url` field and site renderer; HLD templates.
- **Remaining work:** none in code.
- **Acceptance checklist:**
  - Every Book button opens the right booking page on desktop and phone.
  - Hours and services on the site match the booking tool.
- **Support obligations:** update links and hours on request.
- **Safe description:** "Customers can book from any page of your site through your booking system."

### 4.4 Review request link and QR code

- **Problem solved:** few online reviews.
- **Included:** a direct "leave a review" link to the business's Google profile, a printable QR code, and the link placed on the site and in the owner's messages.
- **Excluded:** automated review requests, review monitoring, responding to reviews, review gating.
- **Reused:** nothing yet; this is a configuration service.
- **Remaining work:** none in code; a checklist.
- **Acceptance checklist:**
  - The link opens the review box for the correct business.
  - The QR code scans correctly.
- **Support obligations:** minimal.
- **Safe description:** "A one-tap review link and QR code that send happy customers straight to your Google review page."

### 4.5 Visitor analytics

- **Problem solved:** "Is my website doing anything?"
- **Included:** install a standard analytics tool, owned by the business, and send a short monthly summary written by HLG from that tool's data.
- **Excluded:** HLG-built dashboards, lead attribution, ad tracking.
- **Reused:** the first-party tracker pattern from 5star, if a self-hosted option is preferred.
- **Remaining work:** choose the tool; set up a cookie or consent notice if required.
- **Acceptance checklist:**
  - Visits appear within 24 hours.
  - The owner has their own login.
  - Numbers in the summary come from the tool, never estimates.
- **Support obligations:** monthly summary labor.
- **Safe description:** "We set up website analytics you own, and send you a plain-English monthly summary."

### Pilot offers (not on the public price list; invite-only with written pilot terms)

- **Automated text reminders and schedule-change texts**, built on the HomeHuddle pipeline once it has been extracted (§6, item 4).
- **BarberOS shop page and client book** for one or two friendly barbershops, after merge and renumbering (§6, item 3).

---

## 5. Implementation and monthly cost model

**Measured costs: none.** No billing account (Stripe, Twilio, DigitalOcean, Supabase for HL-BOS or Venuewise, the domain registrar) was reachable. Every provider figure below comes from web-search summaries of the providers' official pricing pages on 2026-11-03. The pages themselves were blocked. Labor is an estimate and is labelled as one. **Confirm every figure in the account consoles before quoting.**

### 5.1 Fixed recurring infrastructure (shared across all customers)

| Item                     | What exists                                                 | Published price (to confirm)                                                                                       | Status                                             |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Coolify server           | One DigitalOcean host runs all 11 apps                      | DigitalOcean Basic Droplets $4–$96/mo; backups add 20% (weekly) or 30% (daily) of the droplet price                | **Size and current bill unknown.** Needed input.   |
| Supabase                 | HL-BOS Core, Venuewise Platform, legacy, CharacterStudio ×2 | Pro $25/mo per organization including $10 compute (covers one Micro project); each extra project from about $10/mo | **Plans in use unknown** for HL-BOS/Venuewise orgs |
| GitHub Pages             | 6 static sites                                              | No charge for public repos                                                                                         | Verified (public repos)                            |
| Domains                  | Several                                                     | Registrar pricing                                                                                                  | Unknown                                            |
| Email provider (for 4.1) | None yet                                                    | Resend: Free 3,000/mo (100/day, 3 domains); Pro $20/mo for 50,000, then $0.90 per 1,000; 10 domains                | Not set up                                         |

### 5.2 Per-business and metered charges (billed to, or owned by, the customer)

| Item                                           | Published price (to confirm)                                                                                                                                                                                                          | Who should pay                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Stripe card processing                         | 2.9% + 30¢ per successful domestic card charge                                                                                                                                                                                        | The business, from its own Stripe account                                                        |
| Stripe Billing (subscriptions)                 | Starts at 0.7% of recurring volume (per Stripe support)                                                                                                                                                                               | The business                                                                                     |
| Stripe Connect (only if HLG builds a platform) | $2 per monthly active account + 0.25% + 25¢ per payout when the platform sets pricing                                                                                                                                                 | HLG, unless passed through                                                                       |
| Twilio SMS (pilot)                             | $0.0083 per segment in or out, plus carrier fees (e.g. AT&T $0.0035, T-Mobile $0.0045 outbound); local number from $1.15/mo; 10DLC: brand $4.50 (low-volume) or $46 (standard) once, campaign vetting $15 once, campaign $1.50–$10/mo | The business, per sender. **Twilio's own pages disagree on 10DLC fees; confirm in the console.** |
| Booking tool, analytics tool                   | The tool's own plan                                                                                                                                                                                                                   | The business                                                                                     |
| Google Places (presence audits)                | Per-request pricing; the repo notes 1,000 free per month for the SKU used                                                                                                                                                             | HLG (sales cost)                                                                                 |

### 5.3 One-time labor (estimates, with assumptions)

Assumptions:

- one experienced engineer
- an existing site template
- the customer supplies content and account access promptly

| Work                                                    | Estimate                                               |
| ------------------------------------------------------- | ------------------------------------------------------ |
| Inquiry form + email notification, first build (shared) | 2–4 engineering days                                   |
| Inquiry form, each additional customer                  | 1–3 hours                                              |
| Stripe Payment Links / deposit setup per customer       | 2–4 hours                                              |
| Booking tool link or embed per customer                 | 1–2 hours                                              |
| Review link + QR per customer                           | 0.5–1 hour                                             |
| Analytics setup per customer                            | 1–2 hours, plus about 0.5–1 hour/month for the summary |

### 5.4 Support labor and shared-cost allocation

- **Rule:** shared fixed costs (server, Supabase organization, email plan) divided by the number of active customers, plus each customer's metered usage, plus support hours × HLG's hourly cost.
- **This cannot be calculated yet.** The fixed bills and HLG's internal labor rate are unknown.
- **On the $149/month website plan:** it can carry hosting and small edits only if the per-customer share of fixed costs plus support time stays well under $149. **Software add-ons need their own monthly fee on top.**
- **Draft pricing already exists elsewhere.** Branch `claude/hld-agency-launch-package` carries draft prices marked DRAFT: Launch Website $1,800; Website Care $99/$199 per month; Local Visibility Setup $450. These differ from the proposed $995 / $149, and the two need reconciling.

### Inputs needed before pricing with confidence

1. DigitalOcean droplet size and monthly bill.
2. Supabase plans and bills for the HL-BOS and Venuewise organizations.
3. Twilio account status, balance and 10DLC registration state.
4. Stripe account mode and fees actually charged.
5. Registrar and domain renewal costs.
6. Keith's target hourly rate for support labor.
7. Expected customer count in year 1.

---

## 6. Prioritized gap-closure plan

| #   | Gap                                                                 | Exact work                                                                                                                                                                                                             | Reuse                                                                      | Dependencies                                                   | Effort (estimate)     | Acceptance test                                                                                      | Launch blocker?                                  |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | HLD inquiries are lost                                              | Choose a destination; merge `claude/hld-inquiry-delivery`; add an email notification; set the Coolify env var                                                                                                          | Branch fix (503 + retry + idempotency + no PII logging)                    | Keith picks a destination (HubSpot form or email provider)     | 1–2 days              | A live test inquiry arrives; Keith gets an email; a redeploy loses nothing                           | **Yes**, for selling 4.1 and for HLG's own sales |
| 2   | No delivery notification on any form                                | Shared notification sender (email) with failure alert by email, not SMS                                                                                                                                                | HL-BOS `0019` message queue + `record_delivery`                            | Email provider account + domain DNS (SPF/DKIM)                 | 2–4 days              | Forced provider failure raises an alert that reaches Keith                                           | **Yes** for 4.1                                  |
| 3   | BarberOS runs from an unmerged branch with forked migration numbers | Renumber the branch's migrations after `main`'s 0052; reconcile with the audit branch's rebuilt migrations and production's migration history; resolve 7 conflicts; merge                                              | Lineage/fingerprint tooling in `.hlbos/`                                   | Approval for any production migration-history change           | 3–6 days              | Merged `main` builds; lineage check passes; production schema fingerprints match the repo; CI green  | **Yes** for any BarberOS pilot                   |
| 4   | HomeHuddle backend is outside version control                       | Export all 23 edge functions and production migrations into `homehuddle/supabase/`; diff against production                                                                                                            | Rollback captures on `feat/homehuddle-ios-release`                         | Supabase access to the Venuewise project from a session        | 1–2 days              | Repo source byte-matches deployed function versions                                                  | **Yes** for reusing messaging or payments        |
| 5   | Twilio failures go unnoticed                                        | Merge the Control Center "HomeHuddle texts" alarm; confirm the account is reinstated and funded; enable auto-recharge                                                                                                  | Branch `homehuddle-diagnostic` (`942a3be`)                                 | Twilio account access (Keith)                                  | 0.5–1 day             | Simulated failure shows red in the console within one cycle                                          | Yes for the SMS pilot                            |
| 6   | No per-business messaging                                           | Implement HL-BOS `TwilioProvider` + comms worker + inbound STOP + per-tenant sender identities; port HomeHuddle digest logic                                                                                           | HL-BOS 0019, 0021 retry/dead-letter; HomeHuddle digest design              | Twilio subaccounts or per-business numbers; 10DLC per business | 2–3 weeks             | Two test tenants send from separate numbers; STOP suppresses the next send; delivery status recorded | Blocks the SMS reminder add-on                   |
| 7   | No integrated payments for businesses                               | Decide: keep "business's own Stripe + Payment Links" (no build) or build Stripe Connect onboarding                                                                                                                     | HL-BOS billing schema; HomeHuddle webhook pattern                          | Stripe Connect platform approval                               | 3–6 weeks for Connect | Test-mode connected account receives a payment; payout reaches the business; refund flows back       | Not a blocker (4.2 needs no build)               |
| 8   | Security and honesty defects in reusable code                       | Remove HomeHuddle hardcoded admin PIN (use `is_admin()`); delete fabricated `venuewise-admin` figures; add sign-in + RLS on `herman-supply-chain` dashboards; replace 5star client-side password; restrict academy RLS | Branch migration 0005 (admin read access) on `feat/homehuddle-ios-release` | Approval for the Venuewise and legacy DB changes               | 2–4 days              | Anonymous request cannot read, delete or view admin data; dashboards show only measured data         | Yes, before showing any of these to customers    |
| 9   | No monitoring or backup policy for hosted sites                     | External uptime checks on every customer domain; enable Coolify health checks; document restore (git + Supabase backups)                                                                                               | Coolify API                                                                | Choice of monitor; Supabase plan with backups                  | 1–2 days              | A stopped app triggers an alert; a test restore succeeds                                             | Yes, before promising uptime                     |
| 10  | Legal-page mismatches                                               | Align HomeHuddle terms and privacy with the actual price, trial and payment collection                                                                                                                                 | —                                                                          | Keith's review                                                 | 0.5 day               | Terms match checkout                                                                                 | Yes for HomeHuddle billing                       |
| 11  | Static-site forms write to the legacy project                       | Move form tables to HL-BOS Core per-tenant                                                                                                                                                                             | HL-BOS tenancy                                                             | Approved plan (legacy project is out of scope)                 | 2–3 days              | New submissions land in HL-BOS Core under the right tenant                                           | Yes for 4.1 on those sites                       |

---

## 7. Sales website copy recommendations

### Included in the website package

> **Your website, built and looked after.** We design and build your site, host it on a secure (HTTPS) connection at your own domain, publish your updates, and fix problems you report. Your contact form sends each enquiry to your inbox.

Do not use these phrases until the gaps below are closed:

| Phrase          | Blocked until                  |
| --------------- | ------------------------------ |
| "99.9% uptime"  | Monitoring exists (gap 9)      |
| "daily backups" | A backup policy exists (gap 9) |
| "24/7 support"  | —                              |

The form line becomes true only after gaps 1–2.

### Optional, with an implementation fee and a monthly service fee

- **Online payments & deposits:** "We connect your site to your own Stripe account so customers can pay or leave a deposit online. Payments go straight to you; Stripe's standard fees apply."
- **Online booking:** "Book buttons on every page, connected to the booking system you use."
- **Review link & QR code:** "Make it easy for happy customers to review you on Google."
- **Website analytics:** "Analytics you own, plus a plain-English monthly summary."

### Custom development (quoted per project)

- Customer portals and accounts
- Job or task tracking
- CRM pipelines
- Integrated invoicing
- Industry dashboards

Describe these as "scoped and quoted after an assessment". Do not list them as features.

### Pilot / coming soon (do not price publicly)

- Automated appointment reminders and schedule-change text messages
- Barbershop client book and appointment system
- Driver and carrier KPI dashboards

### Remove or avoid

- Any claim of automated review generation, reputation management or SMS marketing. Today "review generation" exists only as marketing copy on 5stargrowthsolutions.com.
- Any implication that HLG processes payments for customers.
- Any HomeHuddle figures presented as platform metrics.

---

## 8. Copy-and-paste handoff for ChatGPT

```text
CONTEXT: Herman Legacy Group (HLG) capability audit, 2026-11-03, read-only, evidence-based.
Offer: website build ($995 proposed) + management ($149/mo proposed); software add-ons priced on top.

VERIFIED INVENTORY
- Hosting: one Coolify server (DigitalOcean) runs 11 apps over HTTPS on custom domains; 6 static sites on GitHub Pages. No uptime monitoring, no Coolify-managed backups, DNS manual. -> SELL NOW (build/host/update/fix-on-report).
- Forms: sites save form submissions to Supabase, but NOTHING notifies anyone. hermanlegacydigital.com general inquiries are not stored at all (no delivery endpoint configured; fix is on an unmerged branch). -> fix first, then SELL AFTER CONFIG.
- HomeHuddle SMS: real production pipeline (team schedule sync every 30 min -> change trigger -> one digest text per family -> Twilio). 284 texts on record (Jul 2026). Twilio suspended for unpaid balance 2026-08-23; 178 texts failed unnoticed; current status unverified. Source mostly not in git. Family-specific. -> PILOT ONLY.
- HomeHuddle payments: real Stripe subscription checkout ($4.99 founder / $9.99 standard, 14-day trial) + signature-verified webhook, deployed Aug 2026. One Stripe account, HomeHuddle charging families. 1 subscription on record (trialing). No charge verified. -> PILOT/template only.
- Merchant payments for other businesses (Stripe Connect, deposits, invoices): DO NOT EXIST in any HLG code. Offer instead: set up the business's OWN Stripe account + Payment Links (configuration, no HLG code in the money path).
- HL-BOS platform: strong tested foundation (tenants, roles, row-level security, consent/suppression queue, billing schema, refund approval). 2,264 unit + 130 edge tests pass; DB tests green in CI 2026-10-30. BUT every email/SMS/Stripe provider is a stub. -> REQUIRES DEVELOPMENT to send or charge anything.
- BarberOS: shop page + owner sign-in + client record live (HLG test shop only); booking built but not applied; runs from an unmerged branch with migration numbering that conflicts with main. -> PILOT after merge.
- Not found in any accessible repo: SalonOS/SalonAI, Canvas Hair Co, FleetHuddle app, TransportationAI, DVIR, dispatch, review automation, CRM pipelines, customer portals. Fleet: Lowe's KPI upload dashboard (no login; unsafe deletes) and an unmerged backhaul matcher on sample data.

SELLABLE ADD-ONS (after small setup): 1) inquiry form + email alert (needs 2-4 day build first), 2) payments/deposits via customer's own Stripe, 3) booking links/embeds to customer's booking tool, 4) Google review link + QR, 5) analytics setup + monthly summary.

COSTS (published prices, unconfirmed; no account bills were accessible):
Stripe 2.9% + 30c per card charge; Billing from 0.7%; Connect $2/active account + 0.25% + 25c per payout.
Twilio $0.0083/segment + carrier fees; number ~$1.15/mo; 10DLC brand $4.50-$46 one-time, vetting $15, campaign $1.50-$10/mo.
Supabase Pro $25/mo/org (incl. $10 compute); extra project ~$10/mo.
Resend free 3k emails/mo; Pro $20/mo.
DigitalOcean droplets $4-$96/mo; backups +20-30%.
Labor estimates: form+alert first build 2-4 days; per-customer setups 0.5-4 hours each.

ACCESS GAPS: Supabase projects for Venuewise/HL-BOS/legacy; Stripe; Twilio; DigitalOcean; registrar; live sites blocked by network policy.

CONFLICT TO RESOLVE: draft pricing on branch hld-agency-launch-package (Launch $1,800; Care $99/$199/mo; Local Visibility $450) vs proposed $995/$149.

DECISIONS NEEDED FROM KEITH:
1) Where should website inquiries go (HubSpot form, or email provider such as Resend)? This unblocks the #1 fix.
2) Is Twilio reinstated and funded? Grant account access so status can be verified.
3) Approve merging/renumbering BarberOS before any barbershop pilot.
4) Approve exporting HomeHuddle backend code into git (read-only export) before reuse.
5) Confirm actual monthly bills (server, Supabase, domains) so the $149 plan's margin can be calculated.
6) Choose: keep payments as "customer's own Stripe" (no build) or invest 3-6 weeks in Stripe Connect.
```
