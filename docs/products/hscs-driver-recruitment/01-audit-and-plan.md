# HSCS Driver Recruitment and Fleet Management — audit, boundary and plan

Audit date: 2026-11-18. Read-only. **No code, migration, storage or deployment was changed to produce this.**

What was read: three repositories (`hl-bos-platform`, `hl-jobscout`, `homehuddle`), the three Supabase projects, and the list of Edge Functions, buckets and advisors on HL-BOS Core. What could not be read: see [Not audited](#not-audited).

## 1. What exists and where

### Driver Recruitment: nothing exists

A search of all three repositories for FMCSA, USDOT, CDL, driver recruiting, carrier prospecting and driver job boards returned no recruitment code. The only hits were unrelated: college recruiting-reel templates (`hype-video`, `highlight-football`) and the recruiter-name field of a job seeker's application tracker (`ats-resume-optimizer`). No migration, table, bucket or Edge Function in any project is a driver recruitment capability. **Nothing is being duplicated by building it.**

### Fleet Management: a database module exists; no application was found

| Item | Location | State |
| --- | --- | --- |
| `fleet` schema, 14 tables | HL-BOS Core (`mvvtngiopdrgiedjmhfb`) | Live. RLS on every table. |
| Roles | `fleet.members.role` | `owner`, `manager`, `maintenance`, `driver` |
| Tenancy | `fleet.workspaces.id` references `platform.tenants.id` | 2 workspaces: "Herman Legacy Group Internal" (first-party) and "HLG Test Fleet" (customer) |
| Domain tables | `units`, `assignments`, `work_orders`, `fuel_entries`, `inspections`, `inspection_actions`, `service_records`, `documents`, `driver_profiles`, `driver_events`, `medical_cards`, `record_events`, `audit_events` | **All empty** except 2 workspaces, 2 members, 2 audit events |
| API | `fleet.api`, `fleet.medical_api`, `public.hlg_fleet_rpc`, `public.hlg_fleet_medical_rpc` | Security-definer functions |
| Private storage | buckets `hlg-fleet-documents`, `hlg-driver-medical-cards` | Both private, with policies |
| Migrations applied | `hlg_fleet_module`, `hlg_fleet_query_scoping`, `hlg_fleet_validation_guards`, `driver_medical_cards`, `medical_card_orphan_cleanup` (all 2026-10-17) | **Not in any repository I can read** |

Not found: any Fleet front-end, and any routing, dispatch or maintenance-scheduling tables. `inspections` and `inspection_actions` may be the DVIR capability, but I have not confirmed that; the table names are the only evidence. The control-center registry still lists FleetHuddle as `not-started` ("no HL-BOS code yet"), which is now inaccurate: the database module is live. I have not changed that file.

### Adjacent things that are not recruitment

| Item | Where | Why it is not reusable as recruitment |
| --- | --- | --- |
| `ats` schema (15 tables) and `apps/ats-resume-optimizer` | HL-BOS Core / this repo | The **job seeker's** private resume tool: one user owns their own profile. A recruiter CRM needs the opposite ownership model. Zero rows. |
| `jobscout` schema and `hl-jobscout` | HL-BOS Core / separate repo | Keith's personal job search. Single user. |
| `comms` schema (consent, suppression, sender identities, messages, templates) | HL-BOS Core | A generic tenant-scoped consent/suppression design that Recruitment should **copy as a pattern, not share**. Providers are seeded inactive; zero rows. |
| `hscs_glp.carriers` (4 rows) and `execution_handoffs` | Legacy project `bkfsjhhclbqrhaolvhmz` | Government-logistics subcontractor carriers. A different business. The handoff table says FleetHuddle owns routes and drivers, which is a cross-product coupling the new brief forbids. |
| `dpi.drivers` | Legacy project | DSP driver survey, empty. |
| `visibility.prospects` (50 rows) | HL-BOS Core | Barbershop prospects. Unrelated. |

### Usable pieces of recruitment-adjacent code

None of the *code* is usable as is. Two *designs* are worth following:

1. The private-bucket plus path-scoped storage policy plus orphan-cleanup pattern in the Fleet medical-card migrations. It has to be re-implemented for Recruitment, not shared.
2. `comms.consent` / `comms.suppression`, for opt-out and do-not-contact.

## 1a. Third product: HSCS delivery operations (added after owner correction)

Source: the owner's screenshot of the GitHub page for `KeithVenuewise73/herman-supply-chain`, plus read-only column names from the legacy Supabase project. **I have not opened the repository itself.**

| Item | Evidence |
| --- | --- |
| Repo | `herman-supply-chain`, public, 44 commits, `main` not protected (per GitHub's banner). A static HTML/JS site on GitHub Pages (about, services, assessment, contact) plus a "Lowe's KPI Dashboard" (React, Vite, Supabase, Recharts, SheetJS). |
| What the dashboard does | Reads Lowe's carrier and driver delivery KPIs: executive summary, driver and carrier rankings, store rankings, detractor review. Composite score formula is published in its README. Data comes from two uploaded Excel files. |
| Database | Legacy project `bkfsjhhclbqrhaolvhmz`: `public.ltr_data` (1,144 rows), `public.kpi_sp_weekly` (287), `public.kpi_spe_weekly` (1,050). The README names exactly these three tables. Also `hscs_glp.kpi_catalog` (14) and `hscs_glp.contract_kpis` (3). |
| HL-BOS Core | Only a generic, empty `scorecard` schema. No HSCS KPI data. |

Conclusions:

1. HSCS delivery operations is a **third, separate business** with its own repo and database. Driver Recruitment must not read, write or reference its tables, and must not reuse its `hscs_glp.carriers` as a prospect list.
2. The dashboard ranks individual drivers by name. That is personal performance data and must never flow into candidate or employer records.
3. Risks (now partly verified, see 1b): the README tells the user to put a Supabase URL and anon key in `.env`, so the legacy project's row-level security is the only protection for those tables; the repo is public; `main` is unprotected.
4. The earlier note that the legacy project is "out of scope" in `CLAUDE.md` still applies. Nothing here was changed.

### 1b. `herman-supply-chain` read (owner-approved, read-only)

Cloned shallow to a scratch path; nothing was pushed to it. 9 HTML pages, `js/script.js`, `css/styles.css`, `CNAME`. It is a plain static site, not the React/Vite app the README describes: there is no `package.json` or `src`.

- **No recruiting, FMCSA, CDL or job-board code.** Recruitment is confirmed as net-new. The only "candidate" matches are in the KPI page's own scripting.
- **Contact and assessment forms** (`contact.html`, `assessment.html`) are the only intake. They post nowhere I could identify; the site's contact route is a `mailto:` link.
- **Public key in public code.** `Lowes-KPI.html`, `dashboard.html` and `js/script.js` embed the legacy project URL and a Supabase key whose decoded role is `anon` (no `service_role` key was found). An anon key in a browser is normal. It is only safe if row-level security is correct.
- **It is not correct.** In the legacy project, `ltr_data`, `kpi_sp_weekly` and `kpi_spe_weekly` each have one policy, "Allow all", for role `public`, `USING true / WITH CHECK true`. The `anon` and `authenticated` roles hold SELECT, INSERT, UPDATE, DELETE and TRUNCATE. **Anyone who opens the public repo can read, alter or wipe those three tables, which hold per-driver and per-store customer performance data.** This was derived from the policy and grant metadata. I did not call the API from outside, and no data values were read.
- The KPI page itself writes with `.insert()` from the browser, which is why the tables were opened. A fix needs the upload to move behind a signed-in role or a server function.
- Proposed fix (not applied; needs approval): replace "Allow all" with read for signed-in HSCS staff only, move uploads to an authenticated path, revoke `anon` privileges, then rotate the anon key if the owner wants the old one dead.

**Further exposure found while preparing the dashboard sign-in** (read-only metadata on the legacy project; no values read; nothing changed):

- `dpi.deliveries` (about 400 rows), `dpi.surveys` (about 244), `dpi.drivers` and `dpi.dsp_companies` each have a policy "Public read ... SELECT, role public, USING true" and "Public insert ... INSERT". `dashboard.html` reads them with the anon key. **Anyone holding the public key can read all of it and add rows.** The earlier row-count listing showed 0 for these tables because it used stale statistics. Corrected detail: anon and authenticated hold SELECT and INSERT only (no UPDATE or DELETE), and `dsp_companies` carries contact names and emails. The second fix is written and tested locally in `docs/operations/hscs-dpi-rls-fix/` (not applied; not yet branch-tested).
- `public.recovery_compliance_exceptions` is a **view** with full anon grants and no row security of its own. A view runs with its owner's rights, so it can bypass the protection on the tables beneath it. The `recovery_*` tables look empty, so exposure is probably nil today, but it should be checked and switched to `security_invoker`.
- The public intake tables (`contact_submissions`, `assessment_results`, `hscs_assessment_requests` and similar) carry over-broad grants (anon holds SELECT/UPDATE/DELETE) but each has only an INSERT policy with row security on, so anonymous callers can add rows and cannot read or change them. That is the intended behaviour. The excess grants are untidy, not exploitable as far as the policy metadata shows.


## 2. Current database and authentication boundaries

- **HL-BOS Core** is one Postgres database and one `auth.users` table (3 users) shared by about 20 schemas: Fleet, BarberOS, ATS, JobScout, review/gallery media, Venture Studio, SceneFlow and others. Tenancy is `platform.tenants` plus `identity.memberships`.
- Fleet's boundary today is a **workspace row inside that shared database**, not a database boundary. A Fleet customer and a Recruitment user would share one login table, one project and one set of service-role keys if Recruitment were added there.
- **That cannot satisfy "separate database ownership, authentication, roles and customer records."** Recruitment must not be built in HL-BOS Core.
- The legacy project's own notes record open security findings and CLAUDE.md puts it out of scope. I read table names and row counts only, and touched nothing.

## 3. Technical risks found

1. **Fleet migrations are live but not version-controlled** in the repository I can read. If the database is lost or branched, Fleet cannot be rebuilt from source, and I cannot verify its RLS from code. The pgTAP suite under `supabase/tests` has no Fleet test file.
2. **Migration history has drifted.** The applied list reuses numbers the repo uses for different content (for example, `0049` is `playtime_tracker` in the database and `highlightai_football` in the repo; `0055` is applied three times under different names). Treat the database as the source of truth for Fleet and do not run `supabase db push` from this repo against HL-BOS Core.
3. **Live advisor findings on HL-BOS Core** (not caused by this audit): `jobscout.tailorings` had RLS disabled in an earlier listing, though the later security advisor no longer reports it; 3 security-definer functions are callable by `anon` (`barberos_published_site`, `barberos_published_sitemap`, `submit_business_transformation_intake`, which look intended to be public but should be confirmed); `pgtap` and `pg_net` are installed in `public`; leaked-password protection is off. None of the 29 "RLS enabled, no policy" tables are in the `fleet` schema.
4. **FMCSA data sourcing is unverified.** This container cannot reach `data.transportation.gov` (proxy returned 403), so I could not confirm dataset IDs, field names, update cadence or terms. Nothing in this plan states a field name as fact.
5. **Commercial email law.** CAN-SPAM needs a physical address, a working opt-out honoured within 10 business days, and accurate headers. Pulling contact emails from FMCSA census records needs a legal review before any send. Phone outreach is a separate question (TCPA / DNC).

## 4. Product boundary

Two products. Nothing is shared at runtime.

| | Driver Recruitment | Fleet Management |
| --- | --- | --- |
| Customer | Carriers who hire; CDL drivers who apply | Fleet operators |
| Data | Carrier prospects, contacts, job openings, candidates, applications, documents, outreach | Units, maintenance, inspections, assignments, fuel, driver records |
| Supabase project | **New, dedicated** | HL-BOS Core `fleet` schema today (see decision D2) |
| Auth | Own Supabase Auth and own roles | Own roles in `fleet.members` |
| Deploy | Own app, own env vars, own keys | Own deploy |
| Storage | Own private buckets | `hlg-fleet-documents`, `hlg-driver-medical-cards` |

Hard rules, to be enforced in review:

- No foreign keys, views, RPCs, webhooks or queues between the two.
- No dashboard that reads both. No "placed driver" handoff. A hired driver is entered into Fleet by the operator, if at all, as a new record.
- A shared library is allowed only if it is pure code with no data and no credentials (for example, a file-type validator). Each one gets an entry in `docs/` naming both consumers. **None is proposed now.**
- Recruitment's role ends at placement. It does not store fleet, maintenance or post-hire records.

## 5. Recruitment architecture

**Home.** A new repository `hscs-driver-recruitment` and a new Supabase project of its own. It does not live in this monorepo, because this monorepo's CI, migrations and control-center are wired to HL-BOS Core.

**Roles.** `owner`, `recruiter`, `employer` (a carrier user), `candidate`. Carrier users see only their own company's openings and the candidates submitted to them. Candidates see only their own record.

**Core tables (all RLS, all tenant-keyed).**

| Area | Tables |
| --- | --- |
| Prospecting | `carriers` (unique on USDOT number), `carrier_snapshots` (source, import date, verified date, reported power units), `carrier_contacts`, `import_runs` |
| Outreach | `outreach_drafts`, `campaigns`, `campaign_recipients`, `suppressions`, `consents`, `outreach_events`. A draft cannot become a send without an `approvals` row. |
| Hiring | `hiring_requests`, `jobs`, `job_endorsements` |
| Candidates | `candidates`, `candidate_endorsements`, `applications`, `submissions`, `onboarding_steps`, `status_history`, `consents` |
| Documents | `documents` (metadata only), `document_grants` (candidate to employer, with purpose, expiry and revocation) |
| Audit | `audit_events`, append-only |

**Documents.** Private bucket, no public URL, path starts with the candidate's id. Reads go through short-lived signed URLs issued only if a live `document_grants` row exists. Every issue and every grant is written to `audit_events`. Sensitive fields (licence number, DOB) are never put in `jobs` or in a list view.

**FMCSA prospecting.** Bulk dataset import on a schedule into `carrier_snapshots`; the active filter and the power-unit threshold are settings (default 20). Every figure is labelled "reported power units". SAFER snapshots are used only to verify a carrier a human is looking at, never in a loop. The importer is written against a documented, tested field map only after the dataset has been inspected (blocker B3).

**Outreach.** Drafts only. Sending is off in code, not just in the UI, until the owner has approved: copy, recipient rule, sender identity and schedule. The send path checks `suppressions` immediately before every send, and every message carries the opt-out and the physical address. No LinkedIn scraping or automation.

**Job board.** Public pages for search, filters and job detail; one candidate profile that is matched against openings by endorsements, location, equipment and experience. Matching is an explainable filter, not a score that hides the reason.

## 6. Phased checklist

Status: ⬜ not started · 🟦 blocked on a decision · ✅ done and verified.

**Phase 0 — Audit and boundary** (this document)
- ✅ Inventory of repos, projects, buckets, functions
- ✅ Confirm nothing recruitment-related exists
- ⬜ Bring the five Fleet migrations into version control (read them from the database; no change to the database)
- ⬜ Add a Fleet RLS test file

**Phase 1 — Foundation** 🟦 D1
- ⬜ Create repo and Supabase project
- ⬜ Schema: auth roles, carriers, contacts, suppressions, audit. Migrations written and tested locally; **not applied without approval**
- ⬜ RLS tests that fail when a policy is removed

**Phase 2 — FMCSA prospect database** 🟦 B3
- ⬜ Inspect the bulk dataset; write the field map from real rows
- ⬜ Importer with dedupe on USDOT number, source, import date and freshness
- ⬜ Prospect list with filters and the "reported power units" label

**Phase 3 — Candidates and documents**
- ⬜ Candidate profile, endorsements, consent
- ⬜ Private upload for licence and medical card; grants and signed URLs; audit
- ⬜ Employer submission flow

**Phase 4 — Job board and hiring requests**
- ⬜ Carrier hiring-request form; job pages; search and filters; one-profile matching

**Phase 5 — Outreach (draft only)**
- ⬜ Drafts, campaigns, approval record, suppression check, opt-out endpoint
- ⬜ Sending switched on only after owner approval of all four items

**Phase 6 — Fleet hardening** (independent of the above)
- ⬜ Resolve D2; fix the registry entry; confirm the live advisor findings

## 7. Implemented in this session

- This document: `hl-bos-platform/docs/products/hscs-driver-recruitment/01-audit-and-plan.md`.
- **No code, migrations, buckets, functions or deployments were created or changed.** Nothing described above as a plan exists yet.

## 8. Blockers and decisions for the owner

| # | Needed | Why |
| --- | --- | --- |
| D1 | Approve creating a **new Supabase project** and a **new GitHub repository** for Driver Recruitment | Separate database and auth cannot be met inside HL-BOS Core. A Supabase project may carry a monthly cost. I cannot create the repository from this session's scope. |
| D2 | Where Fleet Management should live long term: stay in HL-BOS Core, or move to its own project | Today its customers share a login table with every other HL-BOS product. Moving it is a data migration and needs your approval. |
| B3 | Network access to `data.transportation.gov` for this environment | Needed to inspect the real FMCSA dataset. I will ask through the environment-settings approval when Phase 2 starts. |
| B4 | Read-only access to `herman-supply-chain` (and `HSCS-GLP`, whose attach was denied) | To confirm they hold no recruiting or carrier-prospect work before Phase 1. I have only seen `herman-supply-chain` in a screenshot. |
| B5 | Where the Fleet front-end lives | I found only its database. If it is in a repository I cannot see, I need access to audit it. |
| B6 | Legal sign-off on commercial email from FMCSA-sourced contacts, plus the sender identity and physical address | Required before any outreach is enabled. |

## Not audited

- `herman-supply-chain` (seen only in a screenshot), `HSCS-GLP` (private; attach denied), `5star-sports-media`, `characterstudio` and the other listed repositories: not opened.
- The Venuewise Platform project was listed, not inspected. Its tables are HomeHuddle youth sports.
- No SAFER or FMCSA site was reached.
