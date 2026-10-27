# Herman Legacy Digital — Agency Readiness Report

**For:** Keith Herman, CEO · **Author:** Claude (engineering) · **Date:** 2026-10-27
**Status:** DRAFT for review. Analysis plus documents only. Nothing was published, deployed,
merged, migrated or sent, and no DNS or database was changed.

**Scope:** Herman Legacy Group (parent) assembling Herman Legacy Digital (HLD) as HLG's own
operating digital agency from assets that already exist. This is not an agency-launch service for
other founders.

## How this was checked

| Source                               | How it was inspected                                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KeithVenuewise73/hl-bos-platform`   | Full clone. `main` @ `58be83d` (2026-10-26). 80 remote branches listed.                                                                                                                                                                                                             |
| 13 other repositories on the account | Read-only clones: hermanlegacygroup, herman-supply-chain, HSCS-GLP, homehuddle, 5star-sports-media, 5stargrowthsolutions, 5starcommunityevents, ddhhomeservices.com, hermanlegacyfoundation, laurieandlewcommunitynetwork, hl-jobscout, coaches-huddle-chrismazzu, characterstudio. |
| Herman Legacy Cloud (Coolify)        | Read-only API calls listing applications, deployment history, and environment-variable names (whether each is set or empty, never the values).                                                                                                                                      |
| Tests                                | Ran HLD app + Presence Scanner + Site Builder + Transformation Intelligence: **378 of 378 passed (31 files)**.                                                                                                                                                                      |
| Live websites                        | **Could not be checked.** This environment's network policy blocks the public domains, and the web fetcher could not resolve any domain (even example.com). Every "live" statement below comes from Coolify's records, not from loading the page.                                   |
| HL-BOS production database           | **Could not be checked.** The connected Supabase account only holds the two CharacterStudio projects; HL-BOS Core (`mvvtngiopdrgiedjmhfb`) is not in it. Migration status comes from repository records.                                                                            |

## Five findings that change the plan

1. **hermanlegacydigital.com is already deployed.** Coolify app `herman-legacy-digital` serves
   `hermanlegacydigital.com` and `www.` from `hl-bos-platform` `main`
   (`apps/herman-legacy-digital/Dockerfile`, port 4400). The last deploy (commit `58be83d`)
   finished 2026-10-26 20:15 UTC. The repository docs still say "built, not deployed", so they are
   stale. DNS resolution could not be verified from here.
2. **Every merge to `main` redeploys the live agency site.** Coolify rebuilds it on every `main`
   commit; the last three deploys were DateSort and Video Studio merges. Unrelated work therefore
   republishes the agency site.
3. **Leads from the live Contact/Book forms are not stored.** `/api/intake` delivers only to
   `HLD_INTAKE_WEBHOOK_URL`, and that variable is **not set** on the live app. Only the Supabase
   URL, the publishable key and `VSTUDIO_TENANT_ID` are set. Without it, a lead goes only to the
   container log, which a redeploy wipes. The visitor sees an honest "a person will follow up"
   message, but nobody is notified. The longer Business Transformation intake writes to Supabase
   through migration 0031, which repository records say is **not applied**.
4. **Two public subdomains run unmerged code.** `app.hermanlegacydigital.com` and
   `shops.hermanlegacydigital.com` run the BarberOS / shop-pages apps from branch
   `claude/shop-transformation-barber-os-ntwb2n`. That branch is 32 commits ahead of `main` and 92
   behind, and its migrations (0048–0059) collide with `main`'s numbering. What they show
   publicly could not be verified from here.
5. **Missed-call text-back and review reminders do not exist as software.** They are marketing
   copy on 5stargrowthsolutions.com and catalog rows marked `coming_soon` / `planned` in migration 0023. The SMS adapter (`supabase/functions/_shared/comms/twilio.ts`) throws
   `twilio_not_configured`. There is no A2P 10DLC registration, no TCPA logic, and no
   inbound-call webhook.

---

## A. Existing assets

### Verified: works, with evidence

| Asset                                                                    | Where                                                                                           | Evidence                                                                                                                                                                                                                                   | Agency use                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **HLD website + client portal**                                          | `hl-bos-platform/apps/herman-legacy-digital` (`main` `58be83d`)                                 | Coolify app deployed from `main` at hermanlegacydigital.com. App tests pass (part of 378/378). 13 screenshots in `docs/products/herman-legacy-digital/release-1/screenshots/`. Strict CSP, HSTS, login gating, honest `persisted:false`.   | **Use now** as the agency site, **after** the lead-delivery gap is fixed and the positioning copy is updated (§D). |
| **Presence Scanner** (VisibilityAI-style audit, local)                   | `packages/presence-scanner`, Control Center `/presence`                                         | About 138 package tests plus console tests. Merged (PRs #90–#92). Pilot audits for HLG BT (60/60 points checked) and HSCS (21/70) in `docs/products/hlg-internal-pilot/README.md`.                                                         | **Use now internally** for prospect audits and lead lists. Google listing checks need a Places key.                |
| **Instant Site Builder** (draft websites from verified facts)            | `packages/site-builder`, Control Center `/presence/[id]/demo`, `/profiles/[id]/draft`           | About 51 tests plus golden files. Fabrication guard refuses invented claims and prices. Templates: contractor, salon/barber, restaurant/bar, professional services. Preview, approve, ZIP.                                                 | **Use now** to produce client website drafts. Hosting and publishing are manual (§B).                              |
| **VisibilityAI backend** (scoring, blueprint, proposal and sales schema) | `supabase/migrations` 0014, 0017, 0020–0024; `supabase/functions/_shared/{discovery,blueprint}` | pgTAP and Deno suites (e.g. blueprint 65, commerce 90). Records say applied to production (`.hlbos/canonical.json`, 0001–0028). Edge workers: **0 deployed**.                                                                              | Data model is ready. **No UI and no running worker**, so not usable by a person today.                             |
| **Communications consent model**                                         | migration 0019 `comms`                                                                          | pgTAP 31 plus Deno 6. Consent, suppression (STOP), approval-gated messages.                                                                                                                                                                | Foundation for compliant SMS later. **Sends nothing.**                                                             |
| **HSCS-GLP** (government-logistics app plus DMA-OS)                      | `KeithVenuewise73/HSCS-GLP` `main` `4fb1793`                                                    | Coolify `running:healthy` at hscs.hermansupplychainsolutions.com. 28 test files (not run here). `dma/` names HLD "the operating agency" and holds client/lead/campaign tables plus VisibilityAI scoring (`src/dma/engines/visibility.ts`). | HSCS's own operating tool. DMA-OS is a **candidate agency client-intelligence layer**; needs review before use.    |
| **HomeHuddle** (live family calendar PWA, Stripe billing)                | `KeithVenuewise73/homehuddle` `main` `c92f003` (CNAME venuewise.net)                            | Playwright smoke suite against production. Stripe checkout/portal calls. Published pricing ($4.95 / $9.99 per month).                                                                                                                      | **Portfolio example**, labelled "HLG-owned product", once child PII and unverified "Live Now" claims are removed.  |
| **5-Star Sports Media** (GameTracker WNY, story intake)                  | `KeithVenuewise73/5star-sports-media` `main` `4c89912` (CNAME 5starsportsmedia.com)             | Working scoreboard pipeline (iCal → sport pages), 7 intake forms, first-party page-view analytics. No automated tests.                                                                                                                     | **Portfolio example** after fixes: fictional sponsors listed as active, dead `contact.html` form, minor's photo.   |
| **Video Studio** (photo → camera-move video)                             | `packages/video-studio`, Control Center `/video`                                                | 7 test files. Records a real `.mp4` in the browser.                                                                                                                                                                                        | **Use now** for simple client promo clips (Ken-Burns-style). No generative motion.                                 |
| **HLG brand tokens**                                                     | inline in every page of `KeithVenuewise73/hermanlegacygroup` (e.g. `contact.html:13-32`)        | Ink `#13283d`, paper `#f7f4ee`, brass `#c0892d`; Fraunces + Inter.                                                                                                                                                                         | **Use now** as the HLD/HLG visual identity. No logo image files exist.                                             |

### Partially built

| Asset                                                     | Where                                                                                         | What is missing                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business Transformation intake (10 sections)              | HLD `/business-transformation-intake`, migration 0031                                         | Migration 0031 not applied (per records), so submissions are not stored. No admin view.                                                                                                                                          |
| Billing / proposals / agreements / entitlements           | migrations 0010, 0015, 0016, 0024; `_shared/billing/stripe.ts`                                | Stripe adapter is an inert stub. Agreements are attorney-review placeholders. **Every price is `pending-ceo`** (`docs/visibilityai/phase-1-enablement/46-pricing-and-commercial-terms.md`).                                      |
| Social publishing (Facebook, Instagram, LinkedIn, TikTok) | migrations 0046/0047 (applied 2026-08-26), `_shared/social/*`                                 | Workers not deployed; no channels connected; HLG-owned channels only.                                                                                                                                                            |
| Hype Video (fact-checked sports promo copy)               | `packages/hype-video`, `apps/hype-video`                                                      | Writes scripts and captions; renders no video. Built for youth athletes (minor-consent model).                                                                                                                                   |
| HSCS website, repositioned                                | `KeithVenuewise73/herman-supply-chain` branch `claude/hscs-content-repositioning` (`1279a60`) | Removes the fabricated statistics from `main`. **Not merged.** A Coolify preview runs from this branch (`running:unknown`, sslip.io address). Open: 1-800-555 placeholder phone, mismatched email domain, "Est. 1994" vs "1980". |
| HSCS website, new build                                   | `hl-bos-platform/apps/hscs-website`                                                           | 11 service and 5 industry pages built, about 47 tests. `/request-an-assessment` has **no form**. Not deployed.                                                                                                                   |
| Premium Business Sites (Phase 3B)                         | branch `feat/premium-professional-sites-phase-3b` (`eff863e`)                                 | 5 commits, not merged.                                                                                                                                                                                                           |
| HLD scan → blueprint flow                                 | branch `claude/herman-legacy-intake-pipeline-7a1uvh`                                          | 12 commits, 122 behind `main`, not merged.                                                                                                                                                                                       |

### Planned only (no working code)

- **5-Star Lead Recovery / missed-call text-back.** Marketing copy at
  `5stargrowthsolutions/{index,services,pricing}.html`; catalog row `missed_call_recovery`
  (`coming_soon`) in migration 0023.
- **5-Star Review Reminder / review requests.** Catalog row `review_management`; table
  `visibility.reviews` with no writer; no Google Business Profile connector.
- **Scheduling / booking.** HLD `/book` is the intake form. BarberOS booking exists only on an
  unmerged branch.
- **CRM.** `packages/transformation-intelligence/src/crm.ts` is a mapping model; the audits say
  "do not build a standalone CRM".
- **Invoicing for agency clients.** Nothing exists. HSCS-GLP has contract-finance views for
  government logistics only.
- **Monthly client reporting.** Catalog row `reporting` is `coming_soon`.

### Inaccessible or unverified

- Every live URL's actual content (blocked from this environment).
- The HL-BOS production database: whether 0031 is applied, and whether lead tables exist for the
  six static HLG-family sites (their migration `20260626030000_herman_legacy_sites_form_submissions.sql`
  is in none of the repositories).
- DNS for every domain.
- Google Business Profile, social accounts, email inboxes, phone carrier, Twilio, Stripe — no
  access from here.
- A HubSpot connector is attached to this Claude account. It was **not** opened, so whether a
  HubSpot CRM is in use is unknown.

### Do not use as HLD portfolio

- **characterstudio / AI Persona X** (app.aipersonax.com): an adult character-image product,
  deliberately isolated from HLG (`docs/adr/0001-isolation.md`).
- **hl-jobscout**: personal job-search tool.
- **coaches-huddle-chrismazzu**: unfinished scaffold, superseded.

---

## B. Fastest way to assemble each function

| Function                          | Fastest path using what exists                                                                                                                                                                                                                                                                                                                                                                            | Blocked on                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Agency website + inquiry**      | Keep the deployed HLD app; do not build a second site. (1) Make leads land somewhere: set `HLD_INTAKE_WEBHOOK_URL` to an inbox/automation endpoint, or approve migration 0031 and send both forms to it. (2) Add a "Digital Agency Services" page and fix the About copy that says "we are not a website company". (3) Add a real contact email/phone. (4) Stop routine merges from redeploying the site. | Keith: lead destination, positioning decision, contact details, deploy-trigger change |
| **Prospect + sales pipeline**     | Presence Scanner (local) builds and ranks the prospect list; Lead Card + CSV export. Track deals in one shared place (the 8-stage pipeline in `03-sales-kit.md`). Use the existing CRM if one is chosen; do not build one.                                                                                                                                                                                | Keith: where the pipeline lives; Google Places key (optional)                         |
| **Proposal, onboarding, payment** | Proposal outline and onboarding checklist in this package. Payment out-of-band for the first clients (an invoice or payment link from HLG's existing business account); the Stripe adapter stays off until approved. Agreement needs an attorney.                                                                                                                                                         | Keith: prices, payment method, agreement template, legal entity                       |
| **Website care + monthly report** | Host client sites on Herman Legacy Cloud (Coolify, already running HLG apps). Monthly report = re-run the Presence Scanner on the client's site and fill the report template. Uptime check via Coolify health checks.                                                                                                                                                                                     | Keith: hosting approval per client, backup policy                                     |
| **Content + creative**            | Site Builder copy (Claude writer once a key is added; template writer today), Video Studio clips, Canva for graphics (a Canva connector is attached to this account; not opened). Social posting stays manual until channels are connected and approved.                                                                                                                                                  | Keith: Anthropic key (optional), brand assets, channel access                         |

## C. Reusable work, with exact paths

| Need                        | Reuse                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agency site                 | `hl-bos-platform/apps/herman-legacy-digital` (copy in `src/lib/content.ts`; forms in `src/components/IntakeForm.tsx`, `BusinessTransformationIntakeForm.tsx`) |
| Intake question set         | `docs/products/herman-legacy-digital/business-transformation-intake-v1.md`; `apps/herman-legacy-digital/src/lib/btdi.ts`                                      |
| Prospect audit              | `packages/presence-scanner`; Control Center `/presence`; `docs/products/presence-scanner/README.md`                                                           |
| Client site drafts          | `packages/site-builder`; Control Center `/profiles`, `/presence/[id]/demo`, `/presence/batch`; `docs/products/instant-site-builder/README.md`                 |
| Service catalog (no prices) | `supabase/migrations/*_hlbos_0023_*.sql` lines ~919–942; `docs/visibilityai/phase-1-enablement/32-service-catalog-spec.md`                                    |
| Proposal / agreement model  | `docs/visibilityai/phase-1-enablement/45-proposal-architecture.md`, `46-pricing-and-commercial-terms.md`, `48-agreement-and-acceptance.md`                    |
| Consent / opt-out model     | migration 0019; `docs/visibilityai/phase-1-enablement/08-communications-architecture-report.md`                                                               |
| Brand tokens                | `KeithVenuewise73/hermanlegacygroup/contact.html:13-32`                                                                                                       |
| Agency offer copy (shell)   | `KeithVenuewise73/5stargrowthsolutions/{services,pricing}.html`. Copy only; it implies working automation that does not exist.                                |
| Deploy pattern              | `apps/*/Dockerfile` + `docs/products/herman-legacy-digital/release-1/01-deployment-dns-runbook.md`                                                            |
| Portfolio candidates        | `KeithVenuewise73/homehuddle`, `KeithVenuewise73/5star-sports-media`, HLG pilot drafts (`docs/products/hlg-internal-pilot`)                                   |
| HLD operating model         | branch `claude/hld-operating-model`, commit `6116e62` (docs only, unmerged, no shared history with `main`)                                                    |

## D. Minimum missing pieces before the first client

1. **Inquiries must reach a person.** Set a lead destination on the live site (or approve
   migration 0031) and test it end to end with one real submission.
2. **Real contact details** on the agency site: email, phone (not 555), legal business name.
3. **Positioning fix:** the live About page says "We are not a website company, an SEO agency, or a
   generic AI agency." That must change if HLD sells websites, care and visibility services.
4. **Approved prices** for the 3–4 launch services (drafts in `02-service-catalog-and-website-care.md`).
5. **A signed agreement template** (attorney-reviewed): scope, payment, ownership of site and
   domain, cancellation, privacy.
6. **A way to get paid:** invoice or payment link from HLG's existing business account.
7. **Hosting decision** for client sites (Herman Legacy Cloud vs client-owned hosting).
8. **A privacy policy** page on the agency site. The intake asks for privacy acknowledgment;
   whether a policy page exists on the live site is unverified.
9. **At least one honest portfolio example** (HomeHuddle or 5-Star Sports Media, cleaned and
   labelled "HLG-owned").

Not required for the first client: missed-call text-back, review automation, Stripe, a CRM build,
social auto-publishing.

## E. Risks and dependencies

| Risk                                                     | Why it matters                                                                                                                                                                                                                                                                                                                                | Mitigation                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lost leads**                                           | Live forms do not store leads; logs are wiped on redeploy. The log line also contains the visitor's email (PII in logs).                                                                                                                                                                                                                      | Configure the lead destination first; remove email from the log line in the same change.                                                                      |
| **Auto-deploy from `main`**                              | Any merge, including unrelated work, republishes the agency site.                                                                                                                                                                                                                                                                             | Switch HLD to manual deploy or a release branch/tag in Coolify (Keith approves).                                                                              |
| **Unmerged code public**                                 | `app.` / `shops.hermanlegacydigital.com` serve an unmerged branch with colliding migration numbers.                                                                                                                                                                                                                                           | Keith decides: keep (label as preview), restrict, or stop them.                                                                                               |
| **SMS compliance (Lead Recovery, Review Reminder)**      | US business texting needs A2P 10DLC brand and campaign registration with the carriers (via Twilio or similar). TCPA requires documented consent for marketing texts, honoured STOP/HELP, and quiet hours. Missed-call text-back is usually treated as a reply to an inbound call, but the client's consent language and records still matter. | Do not sell automated SMS until registration is approved and opt-in language is in place. Offer review requests by email/manual link first. Get legal review. |
| **Third-party review platform rules**                    | Google prohibits review gating (asking only happy customers) and incentivised reviews.                                                                                                                                                                                                                                                        | Review Reminder sends the same request to every customer; no filtering, no rewards.                                                                           |
| **Fabricated or placeholder claims on HLG-family sites** | HSCS `main` shows "$2.4M+ average annual savings", "98.2% client retention" and invented testimonials. All six template sites show (716) 555-0142. 5-Star Sports Media lists sponsors that appear fictional. hermanlegacygroup.com shows six "live" Huddle products.                                                                          | Clean each before it is shown as agency work. HSCS: merge the repositioning branch after review.                                                              |
| **Minors' data in portfolio repos**                      | homehuddle (`dominic.html`, demo athlete details) and 5star-sports-media (`assets/images/Dom AthleteHuddle.JPG`).                                                                                                                                                                                                                             | Remove or obtain guardian consent before anything is shown as portfolio.                                                                                      |
| **Database drift**                                       | About 40 production migrations are not in the repository, and some were applied under different version stamps (`.hlbos/milestone.json` blockers).                                                                                                                                                                                            | Do not apply 0031 until the drift reconciliation is approved; apply only through the protected workflow.                                                      |
| **Stale status records**                                 | `registry.ts`, the HLD README and the release-1 docs say "not deployed"; the console may tell Keith the wrong thing.                                                                                                                                                                                                                          | Update them in a separate, reviewed change.                                                                                                                   |
| **Dependencies**                                         | Google Places key (US$35 per 1,000 requests after the free tier, per the scanner docs); Anthropic key (optional); a payment account; an attorney; Twilio + A2P 10DLC (later); Google Business Profile access per client (later).                                                                                                              | —                                                                                                                                                             |

## F. 7-day execution plan

| Day | Tasks                                                                                                                                                                                                              | Owner               | Depends on                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------ |
| 1   | Keith: approve or adjust services, draft prices, lead destination, contact details, auto-deploy change. Engineering: reconcile stale status docs; prepare the intake-delivery change (PR, not merged).             | Keith + engineering | This report                    |
| 2   | Engineering: lead delivery live and proven with one test submission; remove email from logs; HLD switched off auto-deploy (with Keith's approval in Coolify). Keith: send the agreement template to an attorney.   | Engineering         | Day 1 decisions                |
| 3   | Engineering: "Digital Agency Services" page plus corrected About copy as a PR with screenshots; Keith reviews in a preview, not production.                                                                        | Engineering → Keith | Day 1 positioning decision     |
| 4   | Portfolio: clean one example (remove minors' data, fictional sponsors, "Live Now" claims) and write an honest case-study page. Prospecting: run the Presence Scanner on one WNY vertical; pick 10 qualified leads. | Engineering + Keith | Places key (optional)          |
| 5   | Build 3 demo sites from the shortlisted leads (Site Builder, private previews). Keith approves which, if any, to show. Proposal template filled for the top lead.                                                  | Engineering → Keith | Day 4                          |
| 6   | Keith approves the agency-site PR; it deploys. Outreach is **Keith's** decision and action (no automated outreach).                                                                                                | Keith               | Day 3 PR green; attorney draft |
| 7   | First discovery calls. Onboarding checklist ready. Review the week: leads received, demos built, proposals sent (real numbers only).                                                                               | Keith               | Day 6                          |

Lead Recovery and Review Reminder are **not** in the 7-day plan. Start A2P 10DLC registration in
week 1 only if Keith decides to offer SMS. Approval typically takes days to weeks and is outside our
control.

## G. Done now vs. Keith's decision

**Completed in this session**

- Inventory of 14 repositories and the Coolify deployments (this report).
- Draft launch package (this folder) on staging branch `claude/hld-agency-launch-package`:
  service descriptions with **draft** prices, website-care scope, inquiry questions, lead
  pipeline, proposal outline, onboarding checklist, launch checklist.
- Tests run: 378/378 pass. No code changed.

**Needs Keith's decision or access**

1. Where inquiries go (email inbox, existing CRM such as HubSpot, or approve migration 0031).
2. Turn off auto-deploy of hermanlegacydigital.com from `main`.
3. What to do with `app.` and `shops.hermanlegacydigital.com` (unmerged BarberOS code).
4. Positioning: is HLD a "digital agency" publicly, or does "Business Transformation" stay the
   headline with agency services under it?
5. Prices (all drafts), payment method, legal entity on invoices.
6. Agreement template (attorney).
7. Whether to offer SMS products at all; if yes, authorise A2P 10DLC registration.
8. Contact email/phone for the agency site.
9. Google Places key (optional) and Anthropic key (optional).
10. Which portfolio examples may be shown, after cleanup.
