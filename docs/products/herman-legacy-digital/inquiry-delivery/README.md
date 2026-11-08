# Herman Legacy Digital — Phase 1: Inquiry Delivery and Agency Front Door

**For:** Keith Herman, CEO · **Author:** Claude (engineering) · **Date:** 2026-10-27
**Branch:** `claude/hld-inquiry-delivery` (from `main` @ `58be83d`) · **Status:** prepared, not
merged, not deployed. No production setting, secret, DNS or database was changed.

## 1. What was wrong

**Root cause.** The Book and Visibility Assessment forms (the Contact page only links to them)
post to `/api/intake`. That route delivers an inquiry only to `HLD_INTAKE_WEBHOOK_URL`. On the live
Coolify app `herman-legacy-digital`, that variable is **not set**; only the Supabase URL, the
publishable key and `VSTUDIO_TENANT_ID` are. With no destination:

- the code wrote one `console.info` line containing the request type, business name and the
  visitor's **email**, and nothing else;
- that line lived only in the container's output. No log drain is configured, and Coolify replaces
  the container on every deploy. There have been 27 deploys between 2026-09-02 and 2026-10-26,
  every one triggered by a `main` commit, so each wiped the previous logs;
- the visitor was shown "Request received" and "Your request is captured; our team will confirm it
  directly". Nobody was notified.

**The Business Transformation intake** (`/business-transformation-intake`) was worse. Because the
Supabase URL and key are set, it calls the database function from migration 0031 first. If 0031 is
not applied, that call fails, and the old code then returned "not stored" **without logging
anything and without trying the webhook**, while the visitor saw "Intake received… captured".

**Recoverable inquiries.** Coolify's log endpoint for the running container (up since the
2026-10-26 20:15 UTC deploy) returned 14 lines:

- **0** intake lines and **0** Business Transformation lines;
- 1 page event (`consultation_request` on `/book`). The form sends that same event when the page
  loads, and no submission line follows it.

Logs from earlier containers are gone. **No inquiry can be recovered from the application.** One
place the logs might survive is Docker on the server itself, if old containers were kept. That is
not reachable from here and is not likely.

## 2. What this change does

| File                                                                                                             | Change                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/delivery.ts` (new)                                                                                      | Sends the inquiry to the destination. **Delivered only on a 2xx answer** that does not say `{"ok": false}`. 8-second timeout. One retry, and only for temporary failures (network, timeout, 408, 429, 5xx). Every attempt carries the same `Idempotency-Key`.        |
| `src/lib/intake-handler.ts` (new)                                                                                | The front door as a tested function. Valid and delivered → 200 "received". Valid but not delivered → **503 "not_delivered"**, telling the visitor plainly that it was not received. Invalid → 422, nothing sent. Logs carry the submission id, type and reason only. |
| `src/lib/persist.ts`, `src/app/api/intake/route.ts`                                                              | Thin wrappers over the above. The email is no longer logged.                                                                                                                                                                                                         |
| `src/components/IntakeForm.tsx`                                                                                  | One submission id per visit, so a retry is recognisably the same inquiry. The failure message is shown and the visitor's answers stay on the page. The "captured" wording is removed.                                                                                |
| `src/lib/btdi-persist.ts`, `api/business-transformation-intake/route.ts`, `BusinessTransformationIntakeForm.tsx` | If the database function fails, it now falls back to the same destination. It never logs visitor details. The visitor is told "not received" when nothing stored it.                                                                                                 |
| `src/lib/content.ts`, `src/app/layout.tsx`, `solutions`, `marketplace`, `industries` pages                       | New positioning and copy (§4).                                                                                                                                                                                                                                       |
| Tests: `delivery.test.ts`, `intake-handler.test.ts`, `content.test.ts` (new)                                     | 21 tests: success, missing configuration, refusal, server error with retry, network failure then success with the same key, timeout, `{ok:false}`, no personal data in logs, invalid input sends nothing, copy rules.                                                |

**What reaches the destination** (JSON, `schema: "hld.inquiry.v1"`): `submissionId`, `ref`,
`submittedAt`, `kind`, `organization` {name, website, industry}, `contact` {name, email, phone},
`intent` {goals, challenges}, `attribution` (page, UTM tags, referrer), `consentAcknowledged`.

## 3. Proof

| Check                                                                                                 | Result                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` gates: format, lint, typecheck (30 packages), lineage, tests                             | **All pass. 2,271 tests passed, 2 skipped** (`main` before: 2,250)                                                                                                                                                                                |
| HLD app tests                                                                                         | 105 / 105                                                                                                                                                                                                                                         |
| Sabotage: make the handler always claim success, then log the email                                   | The tests fail both times (2 and 1 failures); restoring the code makes them pass                                                                                                                                                                  |
| Production build (`next build`), run locally in a real browser (Chromium), against a local test inbox | Book form → inbox stored it → "Request received". Visibility Assessment → same. Inbox failing (500) → "has not been received", answers kept, 4 attempts over 2 clicks all with **one** idempotency key. No destination → "has not been received". |
| Business Transformation intake (HTTP)                                                                 | Inbox accepting → received. Inbox failing → 503. No destination → 503. **Database function missing (simulated, as on live) → fell back to the inbox → received.**                                                                                 |
| Logs during all of the above                                                                          | 0 occurrences of any test name, email, phone or business                                                                                                                                                                                          |
| Services / About pages                                                                                | No `$` prices. "not available yet" shown for text-back and review automation. "not a website company" gone.                                                                                                                                       |

**Not yet proven:** delivery to the **real** destination. That needs Keith's choice (§5). The
forms are not fixed until a real inquiry reaches it.

Screenshots: [`screenshots/`](screenshots/). In `book-not-delivered.png` the header appears
mid-page because it is sticky and the full-page capture stitches it in; the site is unchanged there.

## 4. Copy: before and after

| Where                    | Before                                                                                                                                                     | After                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positioning (home, meta) | "…helps organizations improve visibility, operations, customer acquisition, and growth through AI-powered business transformation."                        | "Herman Legacy Digital helps businesses improve their online presence, attract customers and operate more efficiently through websites, marketing and practical technology."                                                                                                                                                                                                  |
| Home title / cards       | "AI-powered business transformation"; Assessment-led / Reusable technology / Long-term partnership                                                         | "Websites, marketing and practical technology"; Get found / Attract customers / Operate more efficiently                                                                                                                                                                                                                                                                      |
| About                    | "The customer-facing operating company for … Business Transformation practice"; "**We are not a website company, an SEO agency, or a generic AI agency.**" | "the digital agency of Herman Legacy Group"; What we do (positioning); How we work (assess, recommend, build only what you approve, publish only confirmed facts); Our work (HLG's own businesses first; client results only when real and agreed)                                                                                                                            |
| Nav / Solutions page     | "Solutions": the product catalog only, including Review Management, Reputation Recovery and ReceptionAI with no availability shown                         | "Services": five services offered today (Visibility Assessment, Website Design & Build, Website Care, Local Visibility Setup, Content & Social), "Pricing is quoted after a free consultation", "Automated missed-call text-back and automated review requests are in development and are not available yet", then the product catalog under a "many are in development" note |
| Marketing                | "content, campaigns and measurable pipeline"                                                                                                               | Posts, short videos from your photos, website and Google profile updates, each approved by you; we report only what we can measure                                                                                                                                                                                                                                            |
| Marketplace / Industries | No availability statement                                                                                                                                  | "Many are in development and not yet available — an advisor will tell you what is available today."                                                                                                                                                                                                                                                                           |
| Contact                  | "Talk to Herman Legacy Digital."                                                                                                                           | "A person at Herman Legacy Digital reads every request and replies."                                                                                                                                                                                                                                                                                                          |

**Unchanged:** no prices published. The methodology section, the Business Transformation intake
and the "Start Your Business Transformation" button are kept as they are. Whether to keep that
button is a positioning decision for Keith.

## 5. Delivery options

| Option                                                                                     | Setup and credentials                                                                                                                                                                          | Stored durably?                             | How Keith hears                                                       | On failure                                                | Safe retry?                                                                              | Verified recurring cost                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. HubSpot form (recommended)**: HLG already has a HubSpot portal, "Herman Legacy Group" | Keith creates one form in HubSpot ("HLD Website Inquiry"). Engineering adds a small adapter to HubSpot's form-submission endpoint (portal ID + form ID; no secret token). One Coolify setting. | Yes: a contact plus a submission in the CRM | HubSpot's form-notification email; the pipeline in the CRM            | HubSpot error → visitor told "not received" and can retry | Contact is de-duplicated by email; a retried submission may appear twice on that contact | **Unverified.** The plan tier could not be read (the connector reports campaigns need an upgrade). Forms are in HubSpot's free tools per HubSpot's published plans; confirm in billing. |
| **B. HL-BOS database table** (extend the 0031 pattern to the short form)                   | A new migration (Keith approval), applied through the protected workflow **after** the drift reconciliation (`.hlbos/milestone.json` blockers). Uses the publishable key already set.          | Yes, in HLG's own database                  | **No notification** until an email provider or an inbox view is built | Database error → "not received"                           | Yes, with a unique index on the submission id                                            | None new (existing project). Slowest: blocked on the migration drift.                                                                                                                   |
| **C. Google Sheet + Apps Script**                                                          | Someone with Keith's Google account deploys a script as a web app. That is an engineering step on his account, which the operating contract forbids asking of him.                             | Yes (sheet)                                 | Email from the script                                                 | Script answers `{"ok":false}` → "not received"            | Yes (script checks the submission id)                                                    | Unverified (quota depends on the account type)                                                                                                                                          |
| Not recommended                                                                            | A new email or automation vendor (Resend, Zapier, Make): not existing HLG infrastructure.                                                                                                      | —                                           | —                                                                     | —                                                         | —                                                                                        | —                                                                                                                                                                                       |

**Recommendation: A (HubSpot).** It already exists, it stores leads where the sales pipeline
lives, and it emails Keith. It needs one business action from him (create the form) and one small
follow-up code change. B is the right long-term home once the migration drift is resolved; the
same `hld.inquiry.v1` envelope can feed it.

**Do not merge this change before a destination is set.** With no destination, the forms will
(truthfully) say "not received" to every visitor. That is honest, but it gives visitors no
alternative, because the site lists no email or phone (Keith decision #8 in the readiness report).

## 6. Business Transformation intake and migration 0031

- **Required?** Only for the database path. With this change, the intake no longer depends on
  0031: if the function is missing, it uses the same destination as the short form.
- **Production state: unverified.** The connected Supabase account does not include HL-BOS Core.
  The API schema listing needs a secret key. A zero-write probe (an empty payload, which 0031
  refuses before writing) was **blocked by this session's safety controls** because it touches
  production, so it was not run. Repository records (2026-08-13 audit) say **unapplied**.
- **To verify:** a person with HL-BOS Core dashboard access checks for
  `public.submit_business_transformation_intake` under Database → Functions, or approves the
  zero-write probe.
- **Do not apply 0031** until the migration drift is reconciled; production holds about 40
  migrations not in the repository.

## 7. Deployment, preview and rollback

**What redeploys hermanlegacydigital.com today:** Coolify app `herman-legacy-digital`
(Dockerfile `apps/herman-legacy-digital/Dockerfile`, port 4400). Settings: `git_branch = main`,
auto-deploy **on**, `watch_paths` **empty**. So **every** commit to `main` rebuilds it, whatever it
touches (all 27 recorded deploys came from the GitHub webhook). Other settings: PR previews off,
health check off, no log drain.

**Preview:** Coolify PR previews are off, and their address template `{{pr_id}}.hermanlegacydigital.com`
would need a wildcard DNS record, which is a DNS change. The Control Center cannot start this app.
Review therefore uses the screenshots above and the local proof in §3. A hosted preview (a
separate Coolify app on an sslip.io address, as already exists for the HSCS repositioning branch)
is available **if Keith authorises it**.

**Options for the auto-deploy (Keith decides; nothing changed):**

1. **Watch paths (recommended, least change).** Set `watch_paths` to the app and what it builds
   from: `apps/herman-legacy-digital/**`, `packages/catalog/**`,
   `packages/transformation-intelligence/**`, `packages/venture-studio/**`, `pnpm-lock.yaml`,
   `pnpm-workspace.yaml`, `package.json`. Unrelated merges (DateSort, docs) stop redeploying the
   site; agency-site merges still deploy automatically.
2. **Auto-deploy off.** Nothing deploys until someone presses Deploy in Coolify. Safest, but the
   site silently lags `main`.
3. Also recommended: **enable the health check** on `/api/health`, so a broken build is not
   switched in.

**The BarberOS subdomains** (`app.` and `shops.hermanlegacydigital.com`) are separate Coolify apps
on branch `claude/shop-transformation-barber-os-ntwb2n`. Neither this change nor any setting above
touches them. They share only the parent domain and the Coolify server.

**Deploy steps once Keith has chosen and approved:**

1. Engineering adds the destination adapter (if HubSpot) to this branch and runs the checks again.
2. Keith sets the destination in Coolify (engineering can do it if Keith grants that access).
3. Keith approves the PR. The merge auto-deploys (about 80 seconds, judging by recent deploys).
4. **Live proof:** one test inquiry marked "TEST — delete" on `/book`. Confirm it arrives in the
   destination and that Keith got the notification, then delete it. **Only then are the forms
   fixed.**

**Rollback:** revert the merge commit on `main`; auto-deploy rebuilds the previous version. Or, in
Coolify, redeploy the previous deployment (`58be83d`). No database change is involved, so rollback
is immediate. Removing the destination setting makes the forms say "not received" honestly; it
does not lose data.

## 8. What Keith needs to provide

1. **The destination:** A (HubSpot) / B (database) / C (Sheet). If A, create the form in HubSpot
   and share its link.
2. **A public contact email and/or phone** for the site, so a visitor who sees "not received" has
   another way to reach HLD.
3. **Auto-deploy choice:** watch paths / off / leave as is. Also: turn the health check on?
4. **Approval of the copy** in §4, and whether to keep "Start Your Business Transformation" as the
   main button.
5. Optional: a hosted preview of this branch; verification of 0031 in the HL-BOS dashboard.
