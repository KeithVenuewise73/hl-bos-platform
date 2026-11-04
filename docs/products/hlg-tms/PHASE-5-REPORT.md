# HLG TRANSPORTATION MANAGEMENT SYSTEM — RECOVERY & DEVELOPMENT RESULTS

Phase 5 · Herman Supply Chain Solutions · prepared 2026-11-04 by Claude (AI engineer)
Labels: **[V]** VERIFIED (run or read directly) · **[D]** DOCUMENTED (stated in a file, not re-checked) · **[NV]** NOT VERIFIED · **[A]** ASSUMPTION.
No passwords, keys, connection strings or customer data appear in this report.

## 1. Executive Summary

- **A working Release 1 prototype exists and was proven in a real browser.** It covers vehicles, drivers, Digital DVIR on a phone, the defect and repair queue, maintenance records, a live fleet status board and module licensing. 40 of 40 end-to-end checks pass for Workflows A–D, including the refusals. [V]
- **It runs on synthetic data held in memory.** It is local only, not connected to any database, and not deployed. It is **not** a commercially operational system. [V]
- **The biggest find: HLG already owns a real transportation backend in production.** On 2026-10-17, seven migrations created `fleet` (DVIR, units, assignments, work orders, service records, documents, medical cards) and `scorecard` (configurable driver/company KPIs) on HL-BOS Core. They were applied **from outside source control**: no repository contained them. The backend is unused (0 vehicles, 0 inspections). [V]
- **That source was recovered byte for byte** (md5 matches the database) and runs unchanged in an isolated local PostgreSQL. 14 backend scenarios pass against it. The prototype's in-memory backend is a port of it and is held to the same 14 scenarios. [V]
- **The original ChatGPT-hosted prototypes could not be reached** from this environment, and **no source for them was recovered**. [V]
- **Release 2–3 modules are not built.** Dispatch, routes, the KPI UI, profitability, customer portal and notifications are not built, and none of them is presented as built. [V]

## 2. Original Goetz Energy Prototype Findings

| Prototype                                                                   | Reachable?                                                               | Source recovered?   | What is known                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HLG Universal Digital DVIR (`hlg-universal-dvir.tenderriver8.chatgpt.site`) | **No**: the host does not resolve from this session's network policy [V] | **No** [V]          | Nothing observed. No feature can be confirmed or denied. [NV]                                                                                                                                                                                                                                |
| Goetz Energy Fleet Demo (`goetz-fleet-demo.tenderriver8.chatgpt.site`)      | **No**: same reason [V]                                                  | **No** [V]          | The "nine passing scenario tests" were not observed. [NV]                                                                                                                                                                                                                                    |
| Fleet Command v10                                                           | No repository, Coolify app, DigitalOcean app or edge function found [V]  | Frontend **No**     | [A] The production `fleet` schema is very likely its backend. It has fuel-delivery tank checklists and phases ("Pre-trip / En-route / End-of-day") matching the Goetz case, and a workspace named "HSCS Fleet Management". This is inference; nothing in the database names "Fleet Command". |
| HSCS Scorecards v3                                                          | No frontend found [V]                                                    | Backend **Yes** [V] | Production `scorecard` schema: companies, versioned definitions (weighted categories, targets, zero-points, weights must total 100%), runs of 1–5,000 records, immutable history. 0 definitions, 0 runs. [V]                                                                                 |

To examine the two ChatGPT sites, the hosts must be allowed in this environment's network settings, or the files exported from ChatGPT. Viewing a rendered page would **not** count as source recovery.

## 3. Existing HLG Transportation Infrastructure

| Asset                                                     | Where                                                  | State                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet` schema, 15 tables, RLS on every table             | HL-BOS Core `mvvtngiopdrgiedjmhfb`                     | Live and unused. 1 workspace (not initialized), 1 member, 0 everything else. [V]                                                                                                                                                                                                                                                                                                                      |
| `fleet.api` / `public.hlg_fleet_rpc`                      | same                                                   | One SECURITY DEFINER function. Ops: workspaces, claim_owner, snapshot, save_fleet, submit_inspection / action / service / document / event, team, save_member. Only `authenticated` may execute. [V]                                                                                                                                                                                                  |
| `fleet.medical_api` / `public.hlg_fleet_medical_rpc`      | same                                                   | Driver medical-card upload, list and download, audited. Private bucket, JPEG, 8 MB. [V]                                                                                                                                                                                                                                                                                                               |
| `scorecard.api`, `scorecard.account_api` + RPC wrappers   | same                                                   | Configurable KPI scorecards (see §2). [V]                                                                                                                                                                                                                                                                                                                                                             |
| Buckets `hlg-fleet-documents`, `hlg-driver-medical-cards` | same                                                   | Private, 10 MB / 8 MB. [V]                                                                                                                                                                                                                                                                                                                                                                            |
| Tenancy                                                   | `fleet.member_role` joins `platform.tenants`           | **A fleet company is an HL-BOS tenant.** Suspended tenants are refused. [V]                                                                                                                                                                                                                                                                                                                           |
| HL-BOS entitlements, billing, communications, audit       | repo migrations 0010, 0015–0016, 0019, 0004            | Exist. No TMS module is registered, and nothing in `fleet` calls them. [V]                                                                                                                                                                                                                                                                                                                            |
| HSCS-GLP → FleetHuddle handoff contract                   | `HSCS-GLP/src/integrations/fleethuddle/contract.ts`    | A versioned route/stop/carrier payload schema with a **mock** transport only. Reusable for dispatch/routes. [V]                                                                                                                                                                                                                                                                                       |
| Lowe's KPI dashboard, DPI dashboard                       | `herman-supply-chain/Lowes-KPI.html`, `dashboard.html` | Client-side React-in-HTML that reads uploaded spreadsheets. **Both write to the legacy Supabase project `bkfsjhhclbqrhaolvhmz`** (tables `kpi_sp_weekly`, `kpi_spe_weekly`, `ltr_data`, …) with its public anon key, and `dashboard.html` issues a delete-all request. Whether that project's RLS permits this was **not checked**: the legacy project is out of scope. [V for code, NV for exposure] |
| DispatchOS Match branches                                 | —                                                      | Not found in any repository this session can reach. [V]                                                                                                                                                                                                                                                                                                                                               |
| Deployments                                               | Coolify (11 apps), DigitalOcean (0 apps)               | No TMS, fleet or DVIR application is deployed anywhere. [V]                                                                                                                                                                                                                                                                                                                                           |

**Phase 4 source-control status:** the fleet/scorecard migrations were **not** in source control before this branch. Production also carries **111 migrations against the repo's 54**. 48 are shared by name, 63 exist only in production, 6 exist only in the repo, and several ordinals in the 0048–0055 range name two different migrations. [V] I treated this as a **blocker for any production migration**. No parallel migration sequence was created: the recovered files sit in `supabase/recovered/`, never in `supabase/migrations/`.

## 4. Recovered and Reusable Source Code

| Recovered                            | Evidence                                                                                                                                    | Reuse                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 7 production migrations (103 KB SQL) | md5 of each file equals the database's `md5(statements[1])`. Secret scan clean. Applies cleanly to local PG on top of HL-BOS 0001–0008. [V] | **Reuse as the TMS backend.** It is the most complete transportation code HLG owns.  |
| HSCS-GLP FleetHuddle contract        | read [V]                                                                                                                                    | Shape for dispatch/route handoff (Release 2).                                        |
| Lowe's KPI / DPI dashboards          | read [V]                                                                                                                                    | KPI definitions and layouts as input to Module 7; **do not reuse** the storage path. |

The production DVIR rules are substantive [V]:

- 11 base checklist items, plus 5 tank items for tankers.
- Every defect needs a severity (1–4) and a description.
- Severity 2 or higher marks the unit Out of service; severity 3 or higher refuses "Repair unnecessary".
- Every inspection and action is signed (typed name plus consent) and append-only.
- A driver can only inspect assigned units.
- Before the next pre-trip, a driver must acknowledge a certified repair.
- A photo must be uploaded by the same user to a fixed path.
- Duplicate submissions are idempotent.

## 5. Complete TMS Module Architecture

```
  Browser / phone ──► apps/tms (Next.js, server-checked pages + /api/fleet)
                          │  canOpen / canCall / save_fleet section guard   (packages/tms)
                          ▼
                   FleetBackend boundary
           ┌──────────────┴───────────────┐
   MemoryFleetBackend (today:       SupabaseFleetBackend (next: rpc
   port of fleet.api, synthetic)    'hlg_fleet_rpc' with user's JWT)
                                          │
                     HL-BOS Core: fleet.api ── platform.tenants, auth, storage
                                  scorecard.api, fleet.medical_api
                                  (entitlements / billing / communications: to wire)
```

Twelve modules are defined in `packages/tms/src/modules.ts`, each with release, internal capabilities, commercial dependencies and an evidence-backed status. Eleven internal capabilities are **never billed**: tenant identity, module entitlements, vehicle registry, driver registry, unit assignments, signed records, documents, cost ledger, audit, notifications and billing.

Recommended app structure: **one Next.js app (`apps/tms`) with role-shaped surfaces**, not six apps.

- Owner portal: `/modules`, `/setup`
- Operations dashboard: `/dashboard`
- Dispatcher console: `/dispatch`, Release 2
- Maintenance interface: `/defects`, `/maintenance`
- Driver PWA: `/driver`, phone-first
- Customer portal: a separate app later, because it serves a different identity (customer parties)

## 6. Modular Licensing and Dependencies

| Module                 | Rel. | Commercial dependency                  | Gets internally (not billed)                                                      |
| ---------------------- | ---- | -------------------------------------- | --------------------------------------------------------------------------------- |
| 1 Fleet Management     | 1    | none                                   | identity, vehicle registry, assignments, audit                                    |
| 2 Driver Management    | 1    | none                                   | identity, driver registry, assignments, documents                                 |
| 3 Digital DVIR         | 1    | none                                   | identity, **vehicle + driver registries**, assignments, signed records, documents |
| 4 Dispatch             | 2    | none                                   | registries, assignments, notifications                                            |
| 5 Routes               | 2    | none (enhanced by Dispatch)            | registries                                                                        |
| 6 Driver App           | 2    | one of DVIR / Dispatch / Routes        | driver registry, notifications                                                    |
| 7 Driver KPIs          | 2    | none (fed by DVIR / Dispatch / Routes) | driver registry                                                                   |
| 8 Truck Profitability  | 3    | none                                   | vehicle registry, cost ledger                                                     |
| 9 Maintenance          | 1    | none                                   | vehicle registry, cost ledger, documents                                          |
| 10 Executive Dashboard | 3    | any operational module                 | identity                                                                          |
| 11 Customer Portal     | 3    | Dispatch or Routes                     | identity, documents                                                               |
| 12 Notifications       | 2    | any operational module                 | notifications                                                                     |

How licensing is enforced today [V]:

- **Every page and API call is checked on the server.** Navigation only hides links.
- **Company setup is included with any module.** It covers the basic vehicle list, people and assignments, so a DVIR-only company can register trucks without buying Fleet Management.
- **A `save_fleet` section guard** stops a company without Maintenance from creating work orders through the vehicle-registry call, and one without Driver Management from creating driver profiles.
- **Modules that are not built cannot be switched on**, by the server as well as the UI.
- **The server always uses the signed-in user's own company.** A request naming another company still returns only your own data.

**Gap:** production `fleet.api` itself does not check entitlements. Before launch, licensing must be enforced in the database too (§12).

## 7. Development Work Completed

Branch `feat/hscs-tms-fleet-operations-v1`, code commit `1be4afe7a6d0980b1b0471d302cd7b0804b4cc75`. [V]

- `supabase/recovered/production-2026-10-17/`: the 7 recovered files, plus a README with provenance and checksums.
- `scripts/local-test/tms-fleet-db.sh` + `tms-fleet-shim.sql`: builds the isolated database.
- `packages/tms`: module catalog, entitlement resolver, DVIR rules, live fleet status, `MemoryFleetBackend` (a port of fleet.api), and the parity test suite.
- `apps/tms`: the Release 1 prototype (port 4610, `127.0.0.1` only).
- `scripts/local-test/verify-tms.cjs`: 40 browser checks.
- Registered in the enterprise catalog and the Control Center product registry; milestone updated.

## 8. Screens and Workflows Implemented

Screens:

- Sign-in (demo)
- Home
- Fleet status board
- Vehicles list and detail (profile, edit, maintenance status, inspection history)
- Drivers list and detail (CDL and medical expiry with warnings)
- **Driver inspection (mobile)**
- Defect queue
- Printable inspection report with JSON download
- Maintenance (service records with cost, work orders)
- Company setup
- Modules
- "Not available" explanation page

| Workflow                 | Result                                                                                                                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** Vehicle inspection | Driver signs in on a phone and sees only assigned vehicles → picks a tanker → 16-item checklist → records a severity-3 tire defect with a photo → signs → submits. The unit turns Out of service. **[V]**                                                                                           |
| **B** Defect management  | Maintenance acknowledges → assesses → "Repair unnecessary" is **refused** on the safety hold → certifies "Repaired" → records a $412.50 service. The board shows the unit back in service. The driver's next pre-trip **requires** acknowledging the repair. **[V]**                                |
| **C** Fleet visibility   | Manager sees available / out-of-service counts, inspected-today completion (1 of 4 · 25%), outstanding defects, and per-vehicle status computed from records. **[V]**                                                                                                                               |
| **D** Module licensing   | DVIR-only company: inspections, defects and setup work. It can add a vehicle to the shared registry. Fleet, vehicle detail, dashboard, drivers and maintenance are refused as not licensed, in the browser and in the API. Turning Maintenance on opens it; turning it off closes it again. **[V]** |

## 9. Tests Executed and Results

All of these were run, and the output was seen: [V]

| Suite                                                                                          | Result                                                                        |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `@hl-bos/tms` with the recovered production SQL on local PG (`TMS_PG_DB=tms_fleet`)            | **43 / 43 pass** (14 scenarios × 2 backends + 15 catalog / entitlement tests) |
| `@hl-bos/tms` without a database (as CI runs it)                                               | 29 pass, 1 labelled skip                                                      |
| Mutation: removed the "acknowledge repair" rule from the SQL                                   | the PostgreSQL half **failed**, as it should; restored → 43 / 43              |
| `@hl-bos/tms-app` unit tests                                                                   | 3 / 3                                                                         |
| Browser end-to-end (`verify-tms.cjs`, Chromium, iPhone 13 + Pixel 7 + desktop)                 | **40 / 40**                                                                   |
| Whole repository `pnpm test`                                                                   | 2,359 pass, 3 skipped, 0 fail (182 files)                                     |
| `pnpm lint`, `pnpm typecheck` (32 tasks), `format:check`, lineage, migration and secret checks | all pass                                                                      |
| `next build` of `apps/tms`                                                                     | succeeds                                                                      |

**Bugs found by testing and fixed:**

1. Sign-in never completed. Next.js rewrote the redirect to `localhost` while the app ran on `127.0.0.1`, and the page's own CSP blocked the hop.
2. Every backend refusal reached the browser as a blank error. `instanceof` failed across two bundled copies of the error class.
3. My first licensing design let a DVIR-only company create work orders through the shared vehicle-registry call. The section guard closes this.
4. **Production finding F-3:** `fleet.api` does not refresh a manager's stored vehicle status. A manager would see a truck with a severity-4 brake defect as "Available". The TMS computes status from the records instead, and a test pins the production behaviour.

## 10. Repository, Branch, and Commit References

- Repository: `KeithVenuewise73/hl-bos-platform`
- Branch: `feat/hscs-tms-fleet-operations-v1`
- Code commit: `1be4afe7a6d0980b1b0471d302cd7b0804b4cc75` (this report is in the following commit)
- Run locally: `pnpm install`, then `pnpm --filter @hl-bos/tms-app build && pnpm --filter @hl-bos/tms-app start` → http://127.0.0.1:4610
- Tests: `node scripts/local-test/verify-tms.cjs` and `bash scripts/local-test/tms-fleet-db.sh && TMS_PG_DB=tms_fleet pnpm --filter @hl-bos/tms test`

## 11. Missing Components and Limitations

- **No persistence and no real sign-in in the prototype.** Data is synthetic, in memory, and lost on restart.
- **Not connected to Supabase.** The `SupabaseFleetBackend` adapter is not written.
- **Two membership models:** `fleet.members` and HL-BOS `identity.memberships`. Fleet roles are not mapped to HL-BOS permissions.
- **The checklist is fixed in SQL** (power unit plus tanker). There are no trailer, reefer, bus or jurisdiction-specific presets.
- **No drawn signature** (production stores a typed name) **and no server-generated PDF** (the browser prints to PDF).
- **Whole-document saves:** `save_fleet` rewrites the whole fleet document, so the last writer wins. Work orders can only be created by owners and managers.
- **Not built in this branch:** medical-card UI, invitations, preventive-maintenance schedules, fuel entry, document upload and void events. The backend for all of these exists.
- **Not built at all:** Release 2–3 modules.
- **No offline mode** for drivers.
- **"Mark unanswered as Pass"** is convenient but invites skipped inspections. Review before launch.
- **Local test divergences:** PG 16 versus production 17; emulated `auth` and `storage`.

## 12. Security and Compliance Requirements

1. **Enforce licences in the database.** Add a check against `entitlements.module_activations` in the `hlg_fleet_rpc` path. Today any HL-BOS member of a fleet company can call any fleet op directly.
2. **Bring the fleet SQL under source control** through an approved reconciliation, before any further change to it.
3. **Unify membership** (`fleet.members` ↔ `identity.memberships`) so offboarding a person removes fleet access.
4. **Legacy project exposure.** The KPI dashboards use the anon key against `bkfsjhhclbqrhaolvhmz`, and one issues a delete-all request. This needs an approved plan to inspect RLS. [NV]
5. **DOT/FMCSA.** 49 CFR 396.11 / 396.13 (DVIR content, repair certification, the driver's review, retention), and 391.41–391.45 for medical cards. Validate per vehicle category and state with a qualified reviewer **before any compliance claim**. The product currently makes none.
6. **Privacy.** Medical cards are health information: access logging exists, but retention and deletion policy is undefined. Driver KPI data is personal data.
7. **Retention.** DVIRs are append-only, which is good. A records-retention policy is still needed.

## 13. Remaining Development Roadmap

Estimates are in engineer-days [A], ±50%.

**Release 1 remaining: 30–50 days**

| Work                                                   | Days |
| ------------------------------------------------------ | ---- |
| Supabase adapter + HL-BOS sign-in                      | 4–6  |
| DB-level licence enforcement + tests                   | 3–5  |
| Lineage reconciliation of fleet SQL (needs a decision) | 2–4  |
| Membership unification                                 | 3–5  |
| Configurable equipment checklists                      | 5–8  |
| Drawn signature + server PDF                           | 3–4  |
| Medical-card + invitation UI                           | 4–5  |
| Offline-capable driver PWA                             | 5–10 |
| Staging deploy                                         | 2–3  |

**Release 2: 50–80 days**

| Work                                                                             | Days  |
| -------------------------------------------------------------------------------- | ----- |
| Dispatch                                                                         | 15–25 |
| Routes (reuse the GLP contract shape)                                            | 10–20 |
| Driver status and notifications (HL-BOS communications; no SMS without approval) | 8–12  |
| KPI scorecards UI on the existing `scorecard` schema                             | 8–12  |
| Automation rules                                                                 | 8–12  |

**Release 3: 50–80 days**

| Work                                           | Days  |
| ---------------------------------------------- | ----- |
| Profitability (revenue model, labour, mileage) | 10–15 |
| Executive dashboard                            | 8–12  |
| Customer portal (new customer-party identity)  | 15–25 |
| Route-optimization integration                 | 8–15  |
| AI recommendations                             | 10+   |

Sequencing holds: Release 1 first, because every later module reads its registries. KPIs can move earlier because the backend already exists.

## 14. Proposed Commercial Pricing

**All figures below are PROPOSALS [A].** No market research or operating-cost analysis has been done. Validate them before quoting.

| Package                          | Problem solved                                    | Dependencies | Implementation                  | Monthly                     | Usage costs              |
| -------------------------------- | ------------------------------------------------- | ------------ | ------------------------------- | --------------------------- | ------------------------ |
| Digital DVIR                     | Paper DVIRs, missed defects, no repair trail      | none         | $0 self-serve / $1,500 assisted | $8 per vehicle, $49 minimum | photo storage            |
| Fleet Management                 | Where is each truck, is it legal, is it available | none         | $500–1,500                      | $6 per vehicle              | —                        |
| Maintenance                      | Defects to repairs to cost                        | none         | $1,000                          | $6 per vehicle              | documents                |
| Fleet Ops Essentials (1 + 3 + 9) | The small-fleet bundle                            | —            | $1,500                          | $15 per vehicle             | —                        |
| Driver KPI Scorecards            | Fair, configurable driver performance             | data source  | $2,500 (KPI mapping)            | $5 per driver               | —                        |
| Dispatch                         | Daily assignment and exceptions                   | registries   | $3,000–7,500                    | $15 per vehicle             | SMS pass-through         |
| Routes                           | Plan versus actual, mileage                       | registries   | $3,000                          | $10 per vehicle             | mapping API pass-through |
| Truck Profitability              | Margin per truck and route                        | cost data    | $3,000–5,000                    | $8 per vehicle              | —                        |
| Complete TMS                     | One system                                        | —            | $10,000–25,000                  | $35–45 per vehicle          | pass-through             |

Fit by segment:

- **Small fleets:** DVIR or Essentials.
- **Final-mile operations:** Essentials + Dispatch + Routes + KPIs. The existing Lowe's KPI work is the proof point.
- **Fuel delivery (Goetz-style):** Essentials + Driver Management. The tanker checklist and medical cards already fit.
- **Regional and multi-location fleets:** Complete TMS.

Support assumption: email support, plus onboarding included in the implementation fee. Differentiation: owner-operated HSCS service plus software, and modular purchase.

## 15. Deployment Preparation

Prepared only; nothing was executed.

1. **Database (needs approval).** Reconcile the fleet SQL into the repo lineage. Then write a migration that registers `tms.*` features in `entitlements.features`, checks licences in the RPC path, and optionally fixes stored status (F-3). Test it on a Supabase preview branch first. Production fleet tables are empty, so data risk is minimal. [V]
2. **Environment.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable) only. **No service-role key** in the app.
3. **Hosting.** Existing Coolify, with a staging app first. DNS proposal: `tms.hermansupplychainsolutions.com` [A].
4. **Monitoring.** Coolify health check, Supabase logs and advisors, and an error page that reports plain English.
5. **Backups.** Supabase backups. Point-in-time recovery status was **not verified**.
6. **Rollback.** Redeploy the previous image. Database changes are forward-only, each with written rollback SQL. There are no destructive changes to fleet tables.

## 16. Decisions Requiring Owner Approval

1. **Adopt the production `fleet` backend as the TMS foundation** rather than rebuilding it. _Recommended._
2. **Approve reconciling the 7 recovered migrations into the repository's migration history**, or assign it to the Phase 4 initiative. Nothing changes in production.
3. **Allow the two `chatgpt.site` hosts** in this environment's network settings, or export those ChatGPT projects, so the original prototypes can be examined.
4. **Approve a read-only plan to check the legacy project's RLS** behind the KPI dashboards.
5. **Engage a DOT/FMCSA compliance reviewer** before any compliance claim.
6. **Commission market research** to test the pricing proposals.

## 17. ChatGPT Independent Review Summary

Please challenge:

- (a) whether adopting the unversioned production fleet backend is sounder than a rebuild;
- (b) the module dependency choices in §6, especially including vehicle and driver registries with DVIR;
- (c) the pricing assumptions;
- (d) the DOT/FMCSA gaps in §12;
- (e) whether Release 2 should start with KPIs, since that backend already exists.

Facts marked [V] were run or read directly in this session. Everything about the ChatGPT-hosted prototypes is [NV].

### Final table

| Component                                     | Existing before                 | Reused        | Built now           | Tested                   | Production ready            | Next action                         |
| --------------------------------------------- | ------------------------------- | ------------- | ------------------- | ------------------------ | --------------------------- | ----------------------------------- |
| Fleet/DVIR backend (`fleet.api`)              | Yes, in production, unversioned | Yes           | Recovered to source | 14 scenarios on local PG | No (licence check, lineage) | Decision 1 and 2                    |
| Scorecard backend                             | Yes, in production              | Not yet       | Recovered           | Applies cleanly only     | No                          | KPI UI (Release 2)                  |
| Medical cards backend                         | Yes, in production              | Not yet       | Recovered           | Applies cleanly only     | No                          | UI, retention policy                |
| Module catalog + entitlements                 | HL-BOS entitlements tables only | Partly        | Yes                 | 15 unit + browser        | No (app-layer only)         | DB enforcement                      |
| Vehicles / Fleet Management UI                | No                              | —             | Yes                 | Browser                  | No                          | Supabase adapter                    |
| Driver Management UI                          | No                              | —             | Yes                 | Browser (read)           | No                          | Credentials model                   |
| Digital DVIR (mobile)                         | Backend only                    | Backend rules | Yes                 | Workflow A               | No                          | Presets, offline, compliance review |
| Defect / repair queue                         | Backend only                    | Backend rules | Yes                 | Workflow B               | No                          | Notifications                       |
| Maintenance                                   | Backend only                    | Backend rules | Yes                 | Workflow B               | No                          | Preventive maintenance, documents   |
| Fleet status board                            | No                              | —             | Yes                 | Workflow C               | No                          | Fix F-3 in the database             |
| Dispatch / Routes                             | Contract shape (GLP)            | Not yet       | No                  | —                        | No                          | Release 2                           |
| KPI / Lowe's dashboards                       | HTML on legacy DB               | Not yet       | No                  | —                        | No                          | Decision 4                          |
| Profitability, Customer portal, Notifications | No                              | —             | No                  | —                        | No                          | Release 2–3                         |
| ChatGPT prototypes                            | Unknown                         | No            | No                  | —                        | —                           | Decision 3                          |
