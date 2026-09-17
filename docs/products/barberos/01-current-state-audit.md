# BarberOS — Current-State Audit

> ## ⚠ CORRECTED 2026-09-17 — read `02-production-drift-map.md` first
>
> **The headline finding below is wrong about the product.** This audit searched the repository and concluded that
> BarberOS does not exist. For the repository that is still true. But BarberOS **is installed and running in canonical
> production** — eleven migrations (`hlbos_0048_barberos_capability_catalog` … `hlbos_0058_barberos_client_crm`), a
> `barberos` schema of 14 tables, a `transform_audit` schema of 10, and 17 public RPCs — none of which are in source
> control. A client-interval/overdue engine (`barberos.client_rhythm`, `barberos.clients_due`) and an owned-website
> builder with a publish lifecycle both exist and are listed as MISSING below.
>
> The error came from auditing source control before reading the live database. In this platform production has been
> written to out of band for months, so source control is not the whole truth.
>
> **Still accurate below:** every statement about what is in this repository; the platform-foundation inventory (§3);
> the mock/placeholder inventory (§5); the drift blocker (§6); the reuse map (§10); and the verified test run
> (860 passed, 1 skipped).
>
> **Superseded below:** §0, §7.1 (the operational model does exist in production), §8 (revised: 1 EXISTS / 12 PARTIAL
> / 7 MISSING, ≈35% not 20–25%), and §15's action list from action 3 onward.

**Date:** 2026-09-16 · **Type:** Read-only audit. No code, migrations, deployments or deletions were made.
**Auditor:** Claude (AI engineer) · **Branch:** `claude/barberos-current-state-audit-xz3psp`

**Verification standard:** every conclusion below cites a file, table, migration or command output. Where something was
not run, it says so.

---

## 0. The headline finding — read this before anything else

**BarberOS does not exist in this repository.** There is no BarberOS application, package, schema, migration, route,
test or design document.

This was verified, not assumed:

```
$ grep -ril "barber" . --exclude-dir=.git --exclude-dir=node_modules
packages/catalog/src/portfolio.ts          # "Salons and barbershops" — target market string
packages/catalog/src/capabilities.ts       # industries: ["salon","barbershop",...] — taxonomy label
packages/catalog/src/registry.ts:931       # industry("barbershop","Barbershop","Composition for barbershops.")
packages/bti-engine/src/catalog.ts:161     # industry pack key "barbershop"
packages/bti-engine/src/consulting/industry.ts:57  # consulting lens for barbershops
supabase/migrations/…0025_hlvs_factory.sql # seeded industry_templates row
supabase/migrations/…0026_bti_platform.sql # seeded industry_packs row
+ 4 documentation files
```

Every one of those is a **taxonomy label** — a string naming barbershops as an addressable industry. None is
functionality. The repository's own portfolio-truth file agrees:

> `apps/control-center/src/lib/registry.ts:79-81` — `name: "SalonAI", status: "Planned as the first HL-BOS vertical. No code yet."`

SalonAI is the nearest existing concept to BarberOS, and the repo states plainly that it has no code.

**Therefore the audit question must be restated honestly.** The correct question is not "what has BarberOS built?"
but:

> _What does HL-BOS already provide that BarberOS can be assembled from, and what must be built that does not exist
> anywhere?_

That is the question this document answers. The instruction **ASSEMBLE, DO NOT REBUILD** is exactly right — there is a
large, genuinely-built, genuinely-tested substrate here. It is just not a barbershop system yet.

---

## 1. Executive summary

### What this repository actually is

**HL-BOS** is a multi-tenant SaaS _platform foundation_ plus a **B2B consulting-intelligence engine**. It was built to
let Herman Legacy analyze and sell transformation services **to** small businesses. It is not, and has never been, a
system that **operates** a small business.

That distinction is the single most important finding in this audit, and it recurs in every phase below.

|                            | HL-BOS today                                                                       | BarberOS as specified                       |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| Who is the "customer"?     | The **business** Herman Legacy sells to (`bti.businesses`, `visibility.prospects`) | The **consumer** who gets a haircut         |
| What is the unit of work?  | An **engagement** (`bti.engagements`)                                              | An **appointment**                          |
| Where does data come from? | A consultant's ratings + a website scan                                            | A booking platform, a POS, a Google profile |
| What does it produce?      | A consulting report + proposal                                                     | Bookings, campaigns, recovered revenue      |
| Does it act?               | No — it recommends, a human executes                                               | Yes — it must send, book, publish, recover  |

### Stage

HL-BOS is at **"foundation complete, ignition not started."** The platform primitives are built to a high standard and
are test-covered. Almost nothing is _connected to the outside world_: every real provider (Twilio, email, Stripe,
Anthropic, Google) is seeded `is_active = false` and every adapter throws a typed not-configured error. No edge
function is deployed.

### Honest percentage

Against the ~30-phase BarberOS vision in the brief:

| Layer                                                                                                  |     Complete | Notes                                                                                             |
| ------------------------------------------------------------------------------------------------------ | -----------: | ------------------------------------------------------------------------------------------------- |
| Platform foundation (tenancy, RLS, audit, events, entitlements, workflows)                             |     **~85%** | Genuinely strong. Reuse it all.                                                                   |
| Diagnostic / analysis engine                                                                           |     **~35%** | Real engine, real rubric — but website-only, single-page, no GBP/reviews/social/competitor input. |
| Business health report                                                                                 |     **~40%** | Report _generator_ is real and good. Report _inputs_ mostly do not exist.                         |
| B2B CRM (businesses as customers)                                                                      |     **~30%** | Exists as prospect/business records. Not a consumer CRM.                                          |
| **Barbershop operating layer** (customers, appointments, staff, services, locations, households)       |       **0%** | No table, no code, no test.                                                                       |
| **Retention automation** (rebooking, capacity, cancellation recovery, reviews, referrals, memberships) |       **0%** | Depends entirely on the layer above.                                                              |
| Marketing execution + attribution                                                                      |     **~10%** | Message/consent/suppression plumbing exists; no campaign engine, no attribution.                  |
| SEO engine                                                                                             |      **~8%** | 5 on-page SEO checks in the scan rubric. No keywords, rankings, citations, GBP.                   |
| AI business advisor                                                                                    |      **~5%** | Metering, prompts, budgets, guardrails exist. No live provider, no data-grounded querying.        |
| Action engine                                                                                          |     **~15%** | `workflows` approval gate is real and enforced. Nothing to approve _doing_ yet.                   |
| **Weighted overall vs. the BarberOS brief**                                                            | **≈ 20–25%** | And the missing 75% is concentrated in the operational core.                                      |

### Where the largest gaps are

1. **There is no operational data model.** No `customers`, `appointments`, `services`, `staff`, `locations`,
   `households`, `transactions`. Verified by grepping every `CREATE TABLE` in all 48 migrations. **Phases 6–15 and
   19–27 of the brief are all downstream of this single gap.** Nothing about revenue leakage, rebooking, empty chairs,
   cancellation recovery, LTV or ROI can be built — or even faked honestly — until it exists.
2. **Nothing is connected to the outside world.** No booking platform, no POS, no Google Business Profile, no Meta, no
   SMS, no email. The connector _framework_ is real; the connectors are not.
3. **Nothing is deployed.** Every edge function is inert by design and says so in its own header comment.
4. **Production has drifted from the repository** (`.hlbos/milestone.json`, blocker #4) — ~40 unknown migrations live
   in the production database, and the safe one-click migration path is blocked until that is reconciled.

---

## 2. Current architecture (verified)

| Layer             | What it is                                                                                                                    | Evidence                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Monorepo**      | pnpm workspaces + Turborepo; TypeScript pinned 6.0.3                                                                          | `pnpm-workspace.yaml`, `turbo.json`, `scripts/check-typescript-pin.sh` |
| **Frontend**      | Next.js (App Router) + React, 8 apps                                                                                          | `apps/*/package.json`                                                  |
| **Backend**       | PostgreSQL functions-as-API (`SECURITY DEFINER` RPCs) + Supabase Edge Functions (Deno)                                        | `supabase/migrations/`, `supabase/functions/`                          |
| **Database**      | Supabase Postgres — **48 migrations**, 22 schemas, ~180 tables                                                                | `supabase/migrations/` (0001–0048)                                     |
| **Auth**          | Supabase Auth + `identity` schema (profiles, memberships, roles, permissions, platform admins)                                | migrations 0002, 0003                                                  |
| **Authorization** | RLS `ENABLE` **and** `FORCE` on every tenant table; `identity.has_permission()` in every policy                               | e.g. `…0014_visibility_core.sql:84-106`                                |
| **Audit**         | `audit.events` + `audit.security_events`, `audit.emit()` trigger on tenant tables                                             | migration 0004                                                         |
| **Events**        | `events.outbox` / `subscriptions` / `deliveries` / `handlers`; claim with `FOR UPDATE SKIP LOCKED`, retry/backoff/dead-letter | migrations 0009, 0021                                                  |
| **Workflows**     | `workflows.instances` / `tasks` / `approvals` — a real, enforced human gate                                                   | migration 0013                                                         |
| **Entitlements**  | features, plan_features, tenant_entitlements, module_activations                                                              | migration 0010                                                         |
| **AI**            | `ai` schema: providers, models, prompts, prompt_versions, runs, budgets, guardrails                                           | migration 0012                                                         |
| **Integrations**  | `integrations` schema: connectors, connections, sync_runs, webhooks, webhook_events                                           | migration 0011                                                         |
| **Hosting**       | Not deployed. Control Center runs locally (`scripts/control-center.bat`). Coolify referenced by hl-bti.                       | `apps/hl-bti/src/app/page.tsx:20`                                      |
| **CI**            | GitHub Actions: Validate, Secret scan (Gitleaks), pgTAP, Migration checks, Deno edge tests                                    | `.github/workflows/ci.yml`                                             |

### Test health — verified by running it

```
$ pnpm vitest run
 Test Files  77 passed | 1 skipped (78)
      Tests  860 passed | 1 skipped (861)
   Duration  7.13s
```

This is real and it passes. **The pgTAP database suite (44 files in `supabase/tests/`) was NOT run in this audit** —
it needs a live Postgres/Supabase stack. The milestone file claims 909 assertions passing in CI; I did not verify that
independently and am not asserting it.

Note: `CLAUDE.md` says "migrations (0001–0006), 77 tests". That is stale — there are 48 migrations and 44 pgTAP files.

---

## 3. What already exists and is genuinely reusable

These are built, test-covered, and should **not** be rebuilt for BarberOS.

| #   | System                                    | Location                                                                                | Why it matters to BarberOS                                                                                                                                                                                                                                                |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Identity, tenancy, roles, permissions** | migrations 0002–0008; `identity.*`                                                      | Each barbershop = a tenant. Owner/manager/barber = roles. Already multi-tenant.                                                                                                                                                                                           |
| R2  | **RLS + FORCE discipline**                | every migration                                                                         | Tenant isolation is already the house pattern. Copy it.                                                                                                                                                                                                                   |
| R3  | **Audit trail**                           | migration 0004, `audit.emit()`                                                          | Free audit logging on any new table.                                                                                                                                                                                                                                      |
| R4  | **Event bus + worker dispatch**           | migrations 0009/0021                                                                    | The backbone for rebooking, capacity, cancellation-recovery jobs.                                                                                                                                                                                                         |
| R5  | **Workflow approval gate**                | migration 0013                                                                          | "Owner approves before it sends" is already enforced infrastructure.                                                                                                                                                                                                      |
| R6  | **Entitlements**                          | migration 0010                                                                          | SaaS plan/feature gating already exists.                                                                                                                                                                                                                                  |
| R7  | **Communications**                        | migration 0019; `comms.*`                                                               | `messages`, `templates`/`template_versions`, **`consent`**, **`suppression`**, `sender_identities`, idempotency, approval linkage. This is the correct spine for SMS/email retention automation, and consent/suppression is exactly the compliance layer TCPA work needs. |
| R8  | **Billing**                               | migrations 0015/0016                                                                    | products, plans, prices, subscriptions, invoices, payments, payment_methods — **the membership/subscription engine's data model largely already exists.**                                                                                                                 |
| R9  | **Website scan core**                     | `supabase/functions/_shared/discovery/scan.ts` + `rubric.ts` (771 lines, tested)        | Real, deterministic, SSRF-safe, prompt-injection-fenced website analysis.                                                                                                                                                                                                 |
| R10 | **Consulting intelligence engine**        | `packages/bti-engine/src/consulting/*`                                                  | Findings → severity → priority → root cause → impact → recommended action → solutions → roadmap → financial → narrative. Deterministic, evidence-gated, refuses to fabricate. **This is the "Business Health Report" engine, and it is good.**                            |
| R11 | **BTI platform schema**                   | migration 0026                                                                          | businesses, engagements, assessments, dimension_ratings, domain_scores, **projects, tasks, milestones, roi_metrics**. Transformation project management (Phase 25) and ROI (Phase 27) have a real starting schema.                                                        |
| R12 | **Discovery schema**                      | migrations 0020/0022/0023                                                               | profiles, evidence, assessments, score_dimensions, recommendations, website_scans, **recommendation_rules, service_catalog, impact_estimates, roadmap_phases/items**. A rules-driven recommendation engine already exists.                                                |
| R13 | **Two scoring frameworks**                | migration 0017 + `docs/visibilityai/phase-1-enablement/15-business-health-framework.md` | Digital Maturity **and** Business Health (8 weighted dimensions incl. operational health, customer engagement, revenue readiness, competitive position). Already designed to separate "digitally mature" from "healthy".                                                  |
| R14 | **Integrations framework**                | migration 0011                                                                          | connectors/connections/sync_runs/webhooks/webhook_events + a Vault-reference secret pattern. Add connectors, don't build a framework.                                                                                                                                     |
| R15 | **AI gateway**                            | migration 0012 + `supabase/functions/ai-gateway/`                                       | Metered, budgeted, guardrailed, versioned prompts, cost-tracked runs.                                                                                                                                                                                                     |
| R16 | **Social publishing spine**               | migration 0046/0047 + `_shared/social/`                                                 | accounts, credentials (Vault refs only), posts, post_targets, publish_attempts (append-only), media_assets, human approval gate, `SKIP LOCKED` claiming. **Phase 18's publishing half is built.**                                                                         |
| R17 | **Control Center**                        | `apps/control-center`                                                                   | The CEO's no-terminal console — the delivery surface BarberOS work must plug into.                                                                                                                                                                                        |
| R18 | **Transformation intake**                 | migration 0031 + `apps/herman-legacy-digital/api/business-transformation-intake`        | A working, validated, rate-limited, server-side intake front door with a DB duplicate guard.                                                                                                                                                                              |

---

## 4. What is partially built

| Capability                            | State                        | Exactly what is incomplete                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Website diagnostic**                | PARTIAL                      | `runScan` is real and tested, but: single page only (no crawl of service/location pages), **no PageSpeed** (connector seeded, unused), no mobile-render check, no booking-flow friction analysis, no conversion-path tracing. The rubric has **14 checks** across security/SEO/mobile/accessibility/conversion/local/analytics (`rubric.ts:111-231`). Good, but a fraction of Phase 4.                          |
| **Business health report**            | PARTIAL                      | Engine (R10) produces executive summary, findings, root cause, impact, risk, roadmap buckets, financial lines, solution ranking. **But the inputs are consultant-entered dimension ratings** (`AssessmentInput`), not measured business data. Sections the brief wants — retention, booking performance, staff productivity, location performance, revenue leakage, competitive analysis — have no data source. |
| **Financial / ROI**                   | PARTIAL, and honest about it | `consulting/financial.ts` returns `null` + _"Additional financial information required."_ wherever an input is missing. It **refuses to invent ROI**. Correct behaviour — but it means today almost every line is null for a barbershop.                                                                                                                                                                        |
| **Transformation project management** | PARTIAL                      | `bti.projects/tasks/milestones/roi_metrics` exist in schema. The working UI (`apps/hl-bti-alpha/src/screens/Implementation.tsx`) persists to **browser localStorage**, not the database (`apps/hl-bti-alpha/src/lib/store.ts:5-8`).                                                                                                                                                                             |
| **B2B CRM**                           | PARTIAL                      | `visibility.prospects` (business_name, contact_name, email, phone, industry, city, website_url, stage) and `bti.businesses`. These are **records of businesses**, not consumers.                                                                                                                                                                                                                                |
| **Comms**                             | PARTIAL                      | Schema, consent, suppression, templates, idempotency: real. **Sending: not implemented.** Twilio and email adapters resolve the Vault secret to prove wiring, then `throw new Error("twilio_not_configured")` (`_shared/comms/twilio.ts:24-26`, `email.ts:22-24`).                                                                                                                                              |
| **Billing**                           | PARTIAL                      | Full DB lifecycle. Stripe adapter is a stub; `billing-webhook/index.ts:32` returns **501**.                                                                                                                                                                                                                                                                                                                     |
| **AI**                                | PARTIAL                      | Gateway + Anthropic provider class exist; `ai.providers` seeds `anthropic` with `is_active = false` and only `mock` active (`…0012_ai_gateway.sql:202-205`).                                                                                                                                                                                                                                                    |
| **Social publishing**                 | PARTIAL                      | Schema + workers + adapters built and tested. **No channel connected, functions not deployed** (milestone, blocker #3). LinkedIn refresh and TikTok Direct Post deliberately not implemented.                                                                                                                                                                                                                   |

---

## 5. What is fake / mock / placeholder — explicitly

To this repository's credit, **almost everything of this kind is labelled in its own source.** The platform's Principle
10 discipline is real and visible. But for clarity:

| Item                                           | Location                                                 | Nature                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Every executive-portal intelligence screen** | `apps/executive-portal/src/lib/intelligence-data.ts:5-9` | "The engine is real; the INPUT is a clearly-labelled illustrative sample (`sample: true`), never a real customer." **Real engine, sample data.**                                                                                                           |
| **Executive portal generally**                 | `apps/executive-portal/src/lib/portal-data.ts:1-7`       | Reads the in-code catalog/registry, **not the database**. 0 of its pages import live tenant data. It is a view over version-controlled TypeScript constants.                                                                                               |
| **"Rivertown Logistics"**                      | `packages/bti-engine/src/analyst/sample.ts`              | Demonstration business + hand-written HTML. Labelled.                                                                                                                                                                                                      |
| **`mock` AI provider / `mock-model`**          | migration 0012                                           | The only _active_ AI provider.                                                                                                                                                                                                                             |
| **`mock_email` / `mock_sms`**                  | migration 0019:368-373                                   | The only _active_ comms providers.                                                                                                                                                                                                                         |
| **`mock` connector**                           | migration 0011:176                                       | Test connector.                                                                                                                                                                                                                                            |
| **`appointment_reminder` SMS template**        | migration 0019:378                                       | A seeded template for module `salonai` — **a template for a product that does not exist**, with no sender, no schedule, no recipient list and no code that reads it. This is the closest thing in the entire repo to a barbershop feature. It is a string. |
| **`hl-bti-alpha` workspace**                   | `apps/hl-bti-alpha/src/lib/store.ts`                     | localStorage prototype. Venuewise seeded as a labelled DEMONSTRATION.                                                                                                                                                                                      |
| **Every edge worker**                          | e.g. `discovery-website-worker/index.ts:3-5, 160-168`    | "STATUS: STRUCTURAL SCAFFOLDING, not deployed." Returns `{processed: 0, note: "inert: egress not wired"}`.                                                                                                                                                 |

**Assessment:** I found **no dishonest screens** — nothing presents fabricated business data as real. That is unusual
and valuable. The risk for BarberOS is different: the _quantity_ of labelled-sample surfaces could create a false
impression of operational readiness for anyone skimming.

---

## 6. What is broken

Genuinely broken (as opposed to deliberately inert):

| #   | Issue                                                                                                                                                                                                                                                                              | Root cause                                                    | Evidence                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| B1  | **Production database has drifted from the repository.** ~40 migrations exist in production that are not in this repo (`dma_*`, `disco_*`, `jobscout_*` naming schemes); ~14 repo migrations applied under different version stamps; the lineage registry still says migration 28. | Historical out-of-band applies against the canonical project. | `.hlbos/milestone.json` blockers[3]              |
| B2  | **The protected one-click migration workflow cannot be used safely.** Its drift check fails; forcing past it would re-run ~20 already-applied migrations including two data backfills.                                                                                             | Consequence of B1.                                            | same                                             |
| B3  | **`CLAUDE.md` is factually stale.** Says "migrations (0001–0006)" and "77 tests"; reality is 48 migrations and 44 pgTAP files / 78 vitest files.                                                                                                                                   | Not updated as work landed.                                   | `CLAUDE.md` vs `ls supabase/migrations \| wc -l` |
| B4  | **`billing-webhook` returns 501.**                                                                                                                                                                                                                                                 | Stripe adapter `verifyAndNormalize` is a stub.                | `supabase/functions/billing-webhook/index.ts:32` |
| B5  | **4 unresolved CEO-gated blockers**, incl. GitHub/Supabase tokens not connected.                                                                                                                                                                                                   | Awaiting access decisions.                                    | `.hlbos/milestone.json` blockers                 |

**B1/B2 are the most serious items in this audit** and are independent of BarberOS. Any BarberOS migration will land
into a database whose true state is unknown. This should be reconciled before BarberOS schema work begins.

---

## 7. What is missing — by subsystem

### 7.1 The operational core (nothing exists)

Verified absent from all 48 migrations:

`customers` · `appointments` · `bookings` · `services` (as a _shop's_ services) · `staff` / `barbers` · `locations` ·
`households` · `transactions` / `tickets` · `chairs` / `resources` · `schedules` / `shifts` / `availability` ·
`customer_tags` · `customer_notes` · `service_history` · `no_shows` · `cancellations`

> `discovery.service_catalog` exists but is **Herman Legacy's own service offerings** (what HL sells to clients),
> not a barbershop's haircut menu. `identity.memberships` is tenant-user membership, **not** a customer subscription.

### 7.2 Retention & revenue (nothing exists)

Rebooking engine · service-interval learning · overdue detection · capacity/utilization calculation · empty-chair
detection · cancellation recovery · review request workflow · satisfaction gating (positive→Google / negative→internal)
· referral codes & attribution · membership plans & usage tracking · churn/LTV computation · segmentation engine

### 7.3 Marketing (near-nothing)

Campaign entity · audience builder · send scheduling · A/B testing · **attribution chain (campaign → customer →
booking → revenue)** · birthday/seasonal triggers · channel performance · CAC/ROAS

### 7.4 Diagnostic inputs (mostly missing)

Google Business Profile ingestion · review ingestion from a real source (`visibility.reviews` exists but the only
insert path is `visibility.ingest_review`, platform-admin only, and **no connector calls it**) · local rank tracking ·
keyword research · citation/NAP monitoring · competitor discovery & tracking · social account analysis · booking-flow
friction analysis · PageSpeed (connector seeded, never invoked)

### 7.5 Website transformation (near-nothing)

Page generation (location/service/barber pages) · content generation with owner approval · deploy/export path ·
conversion-optimization recommendations tied to generated changes

### 7.6 AI advisor (architecture missing)

There is **no data-access layer an AI could query**. `ai.runs` meters calls; it does not ground them. For "Why was
revenue down last week?" to be answerable there must first be revenue data, then a governed, tenant-scoped,
read-only query surface over it. Neither exists.

### 7.7 SaaS hardening

Self-serve signup · per-tenant billing activation (Stripe stub) · usage metering for pricing · customer data
export/deletion (GDPR/CCPA) · rate limiting at the API edge (only a best-effort in-process limiter on one intake
route) · **PII handling policy for consumer data** — HL-BOS has never stored end-consumer PII at scale, and a
barbershop's customer list is exactly that.

---

## 8. Full BarberOS transformation workflow — stage by stage

| #   | Stage                     | Status            | Basis                                                                                                                                                                   |
| --- | ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lead / business discovery | **PARTIAL**       | `visibility.prospects`, `discovery.profiles`, intake route. No automated local-business discovery.                                                                      |
| 2   | Onboarding                | **MISSING**       | See §9. Business shell exists; everything operational does not.                                                                                                         |
| 3   | Diagnostic                | **PARTIAL**       | Website scan real (14 checks, 1 page). No GBP/reviews/social/competitor/booking/ops/financial inputs.                                                                   |
| 4   | Business health report    | **PARTIAL**       | Generator real and strong; most report sections have no data source.                                                                                                    |
| 5   | Revenue leakage           | **MISSING**       | Requires appointments + customers + capacity. None exist.                                                                                                               |
| 6   | Transformation plan       | **PARTIAL**       | `buildRoadmap()` produces Immediate/Short/Medium/Long buckets with justifications — a genuine 90-day-plan basis. Not barbershop-specific, not persisted from live data. |
| 7   | Owner approval            | **EXISTS**        | `workflows` gate is real and enforced (e.g. content cannot publish without it).                                                                                         |
| 8   | Implementation            | **PARTIAL**       | `bti.projects/tasks/milestones` schema real; working UI is localStorage-only.                                                                                           |
| 9   | CRM                       | **MISSING**       | B2B business records ≠ consumer CRM.                                                                                                                                    |
| 10  | Marketing                 | **MISSING**       | Comms plumbing exists; no campaign engine, no attribution.                                                                                                              |
| 11  | Retention                 | **MISSING**       | —                                                                                                                                                                       |
| 12  | Review engine             | **MISSING**       | `visibility.reviews` table + anti-fabrication guard exist; no request workflow, no ingestion connector.                                                                 |
| 13  | Rebooking                 | **MISSING**       | —                                                                                                                                                                       |
| 14  | Capacity recovery         | **MISSING**       | —                                                                                                                                                                       |
| 15  | SEO                       | **PARTIAL (~8%)** | 5 on-page checks. No keywords/rankings/citations/GBP.                                                                                                                   |
| 16  | Website                   | **PARTIAL**       | Analysis yes; generation/deployment no.                                                                                                                                 |
| 17  | Analytics                 | **MISSING**       | No metrics warehouse, no dashboards over live data.                                                                                                                     |
| 18  | ROI                       | **PARTIAL**       | `bti.roi_metrics` table + honest financial framework. No before/after measurement loop.                                                                                 |
| 19  | AI recommendations        | **PARTIAL**       | Deterministic rules-based recommendations are real (`recommendations.ts`, `solutions.ts`, `discovery.recommendation_rules`). **LLM-grounded advisory: missing.**        |
| 20  | Continuous optimization   | **MISSING**       | Requires 5, 11, 17, 18.                                                                                                                                                 |

**Score: 1 EXISTS · 9 PARTIAL · 10 MISSING.** And the single `EXISTS` is the approval gate.

---

## 9. Phase 3 — can BarberOS onboard a barbershop today? No.

| Onboarding step              | Exists?                      | Nearest existing asset                                                              |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Create barbershop            | **PARTIAL**                  | `platform.tenants` + `platform.provision_tenant()` (migration 0006)                 |
| Business profile             | **PARTIAL**                  | `discovery.profiles` (business_name, industry, summary jsonb) / `bti.businesses`    |
| **Locations**                | **MISSING**                  | none — `visibility.prospects.city` is a single text field                           |
| **Barbers / staff**          | **MISSING**                  | `identity.memberships` is platform users, not staff with schedules/specialties/comp |
| **Services & pricing**       | **MISSING**                  | `billing.products/plans/plan_prices` could model this but is built for SaaS billing |
| **Hours**                    | **MISSING**                  | none                                                                                |
| **Booking provider**         | **MISSING**                  | `integrations.connectors` framework ready; zero booking connectors seeded           |
| Website                      | **PARTIAL**                  | `visibility.sites` (url, verified)                                                  |
| **Google Business Profile**  | **MISSING (framework only)** | `google_business` connector **seeded but never implemented** (migration 0011:173)   |
| **Social accounts**          | **PARTIAL**                  | `social.accounts` + credentials exist; nothing connected                            |
| **Review platforms**         | **MISSING (framework only)** | `review_source` connector seeded, unimplemented                                     |
| **Customer database import** | **MISSING**                  | no customer table to import into                                                    |
| **Historical transactions**  | **MISSING**                  | no transaction table                                                                |
| Marketing accounts           | **MISSING**                  | no Meta/Google Ads connector                                                        |
| Business goals               | **PARTIAL**                  | `intake.transformation_submissions`, `bti.engagements`                              |

**Verdict: 3 of 16 steps partially supported. The barbershop onboarding flow does not exist.**

---

## 10. Reuse map — what backs each future capability

| Future BarberOS capability   | Reuse (do not rebuild)                                                          | Must be built                                                 |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Multi-tenant shops           | `platform.tenants`, `identity.*`, RLS+FORCE pattern                             | location/staff hierarchy under the tenant                     |
| Roles (owner/manager/barber) | `identity.roles`, `role_permissions`, `has_permission()`                        | barbershop-specific permission keys                           |
| Customer CRM                 | RLS pattern, `audit.emit()`, `comms.consent`                                    | `shop.customers`, `households`, segmentation                  |
| Appointments                 | `events` bus for lifecycle events                                               | `shop.appointments`, availability engine                      |
| Rebooking                    | `events` + `comms.messages` + `consent`/`suppression` + `workflows`             | interval learning, overdue detection, scheduler               |
| Empty chair / capacity       | `events` + worker `SKIP LOCKED` pattern                                         | utilization math, slot model, candidate matching              |
| Cancellation recovery        | same                                                                            | trigger + targeting                                           |
| Review engine                | `visibility.reviews` + anti-fabrication guard; `comms`                          | request workflow, satisfaction gate, GBP connector            |
| Referrals                    | `audit`, `comms`                                                                | code generation, attribution, fraud guards                    |
| Memberships                  | **`billing.*` (products/plans/prices/subscriptions/invoices/payments)**         | usage tracking, Stripe adapter (B4)                           |
| Campaigns                    | `comms.templates/messages/consent/suppression`, `workflows` approval            | campaign entity, audience builder, scheduler, **attribution** |
| Business health report       | **`packages/bti-engine/src/consulting/*` (whole engine)**                       | barbershop dimensions + real data inputs                      |
| Revenue leakage              | `discovery.recommendation_rules`, `impact_estimates`, `consulting/financial.ts` | the leakage detectors themselves                              |
| 90-day plan                  | **`consulting/roadmap.ts`**                                                     | persistence + barbershop content                              |
| Transformation PM            | `bti.projects/tasks/milestones`, `workflows`                                    | move `hl-bti-alpha` off localStorage onto the RPCs            |
| ROI                          | `bti.roi_metrics`, `consulting/financial.ts`                                    | before/after measurement loop                                 |
| Website analysis             | **`_shared/discovery/scan.ts` + `rubric.ts`**                                   | multi-page crawl, PageSpeed, booking-flow checks              |
| Content generation           | `ai` gateway, `visibility.content_assets` + publish gate, **`social.*`**        | barbershop prompts, image→caption                             |
| SEO                          | scan rubric's SEO checks                                                        | keywords, rankings, citations, GBP, schema                    |
| AI advisor                   | `ai.runs/budgets/guardrails/prompt_versions`                                    | **a governed query layer over business data**                 |
| Action engine                | **`workflows.instances/approvals`** — already enforced                          | action registry + executors                                   |
| Integrations                 | `integrations.connectors/connections/sync_runs/webhooks` + Vault refs           | the actual connectors                                         |

---

## 11. Gap analysis (no time estimates — deliberately)

| Capability                           | Why needed                         | Reuse                                                      | Backend                                         | Frontend              | Data                                         | Integration                     | Complexity | Depends on                          |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | --------------------- | -------------------------------------------- | ------------------------------- | ---------- | ----------------------------------- |
| **Shop domain schema**               | Everything else is downstream      | RLS/audit/tenancy patterns                                 | new `shop` schema + RPCs                        | admin CRUD            | locations, staff, services, hours, resources | —                               | **M**      | B1 reconciled                       |
| **Customer + household CRM**         | Segmentation, retention, LTV       | RLS, audit, `comms.consent`                                | `shop.customers`, `households`, tags, notes     | customer list/profile | consumer PII                                 | —                               | **M**      | shop schema                         |
| **Appointments + transactions**      | Revenue, utilization, intervals    | events bus                                                 | `shop.appointments`, `transactions`             | calendar              | bookings, tickets                            | booking connector               | **L**      | customers, staff                    |
| **Booking connector (one)**          | Real data, or the system is empty  | `integrations.*`, `sync_runs`                              | sync worker + normalizer                        | connection UI         | external appointments                        | **Square/Booksy/Vagaro**        | **L**      | appointments                        |
| **Capacity engine**                  | Empty-chair, utilization           | events, workers                                            | availability + utilization functions            | capacity view         | hours, schedules, appointments               | —                               | **M**      | appointments, staff                 |
| **Interval + overdue engine**        | Rebooking, reactivation            | —                                                          | per-customer interval stats                     | customers-due view    | appointment history                          | —                               | **M**      | appointments                        |
| **Campaign + attribution engine**    | Every automation and ROI claim     | `comms.*`, `workflows`                                     | campaigns, audiences, sends, attribution chain  | campaign builder      | messages↔bookings↔revenue                    | SMS/email provider              | **L**      | customers, appointments, comms live |
| **SMS/email activation**             | Nothing can send today             | `comms` adapters                                           | implement Twilio/email `send()`                 | —                     | —                                            | **Twilio + Resend/SES**         | **S–M**    | CEO keys, deploy                    |
| **Review engine**                    | Reputation + acquisition           | `visibility.reviews`, comms                                | request workflow + satisfaction gate            | reviews dashboard     | review + request data                        | **GBP API**                     | **M**      | appointments, comms live            |
| **GBP connector**                    | Diagnostic + reviews + posting     | `integrations.*`, `social.*`                               | connector + sync                                | connect UI            | profile, reviews, posts                      | **Google Business Profile API** | **L**      | —                                   |
| **Revenue leakage engine**           | The core product promise           | `recommendation_rules`, `impact_estimates`, `financial.ts` | detectors + impact estimation                   | opportunities view    | all operational data                         | —                               | **L**      | capacity, intervals, transactions   |
| **Action engine**                    | Insight→action                     | **`workflows` gate**                                       | action registry + executors + outcome recording | action buttons        | action + outcome log                         | per-action                      | **M**      | leakage, campaigns                  |
| **AI advisor**                       | "Why is Clarence underperforming?" | `ai.*` gateway                                             | governed read-only query layer + tool surface   | chat                  | all of the above                             | **Anthropic key**               | **L**      | everything above                    |
| **Membership engine**                | Recurring revenue                  | **`billing.*`**                                            | usage tracking, entitlement per visit           | plan mgmt             | subscriptions, usage                         | **Stripe (B4)**                 | **M**      | customers, appointments             |
| **Multi-page site scan + PageSpeed** | Real diagnostic                    | `scan.ts`, `rubric.ts`                                     | crawl + PageSpeed call                          | report                | scan evidence                                | **PageSpeed API**               | **M**      | egress + deploy                     |
| **Runtime ignition**                 | Nothing runs today                 | all workers built                                          | deploy functions, enable scheduler, wire egress | —                     | —                                            | —                               | **M**      | **CEO keys**                        |
| **Production drift reconciliation**  | Blocks all schema work             | lineage scripts                                            | reconcile registry vs live DB                   | console report        | —                                            | —                               | **M**      | **CEO go-ahead**                    |

---

## 12. Recommended build order

**PHASE A — FOUNDATION (unblock everything)**
A1. Reconcile production drift (B1/B2). A2. Runtime ignition: deploy edge functions + scheduler. A3. Activate one SMS and one email provider (Twilio + Resend/SES) — real sends, honest failures. A4. `shop` schema: locations, staff, services, hours, resources — RLS+FORCE, pgTAP first.

**PHASE B — THE DATA THAT MAKES EVERYTHING ELSE POSSIBLE**
B1. `shop.customers` + `households` + tags/notes. B2. `shop.appointments` + `transactions`. B3. **One booking connector end-to-end** (recommend Square: booking + POS in one). B4. CSV import path for historical customers and transactions.

**PHASE C — DIAGNOSTIC**
C1. Extend the scan to multi-page + PageSpeed. C2. GBP connector (profile, reviews, posts). C3. Barbershop dimension pack for the health framework. C4. Wire measured operational data into `AssessmentInput` so the report stops being consultant-entered.

**PHASE D — CRM / CUSTOMER INTELLIGENCE**
D1. Interval learning + overdue detection. D2. Segmentation engine. D3. LTV / churn risk / rebooking rate. D4. Household grouping + combined-booking detection.

**PHASE E — RETENTION AUTOMATION**
E1. Rebooking engine (21/28/35/45-day ladder) on events + comms + consent. E2. Capacity/utilization engine. E3. Empty-chair targeting. E4. Cancellation recovery. E5. Review engine with satisfaction gate.

**PHASE F — MARKETING / SEO**
F1. Campaign engine + audience builder. F2. **Attribution chain** (campaign→customer→booking→revenue). F3. Local SEO: keywords, rankings, citations, schema. F4. Content engine on `ai` + `social.*` + the approval gate. F5. Referrals. F6. Memberships on `billing.*` + Stripe.

**PHASE G — REVENUE LEAKAGE + TRANSFORMATION MANAGEMENT**
G1. Leakage detectors with evidence-gated impact. G2. Move transformation PM off localStorage onto `bti.*` RPCs. G3. 90-day plan generation from real diagnostics. G4. ROI before/after loop on `bti.roi_metrics`.

**PHASE H — AI ADVISOR + ACTION ENGINE**
H1. Governed read-only query layer over shop data. H2. Grounded advisor on the `ai` gateway. H3. Action registry + executors behind `workflows`. H4. Owner Command Center.

**PHASE I — SaaS HARDENING**
I1. Self-serve signup + Stripe. I2. Consumer PII policy, retention, export, deletion. I3. Edge rate limiting. I4. Usage metering. I5. Competitor intelligence. I6. Multi-location rollup.

_Rationale: A and B are non-negotiable and strictly sequential. C can run parallel to B. E is where the product first
pays for itself, and it is worthless before B._

---

## 13. MVP — the smallest sellable BarberOS

Target: a two-location traditional barbershop.

### MUST HAVE for the first paying customer

1. Onboard a shop: locations, staff, services, prices, hours.
2. Customers + appointments in the system — via **one booking connector** and a CSV import.
3. A business health report built on **that shop's real data**, not a questionnaire.
4. Revenue leakage in three specific forms: **overdue customers**, **open capacity**, **weak rebooking** — each with a named cause and an evidence-backed estimate.
5. **Rebooking automation that actually sends** (SMS, consent-checked, suppression-respected, owner-approved).
6. **Review requests that actually send**, with the positive/negative gate.
7. Measurement: rebooking rate, bookings generated, revenue attributed — before and after.
8. An owner dashboard answering: what happened, what needs attention, what should I do today.

**Justification:** items 4–7 are the only ones a barbershop owner will pay for. Everything before them is
prerequisite; everything after is expansion. Notably, **this MVP does not require an LLM** — the diagnostic and
recommendation engines are already deterministic and evidence-gated.

### SHOULD HAVE soon after

Cancellation recovery · empty-chair campaigns · GBP integration + posting · household CRM · staff performance ·
referrals · location comparison · memberships

### LONGER TERM

AI business advisor · website generation/deployment · full local SEO · competitor intelligence · content engine ·
multi-channel ads attribution · self-serve SaaS signup

---

## 14. Demo vs real — screens that look more finished than they are

| Screen                                                                                                      | Looks like                    | Actually                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executive Portal — **25 routes** incl. `/intelligence`, `/marketing`, `/operations`, `/readiness`, `/graph` | A running enterprise platform | Read-only views over **in-code TypeScript constants**; intelligence screens run a **real engine on a labelled sample** (`intelligence-data.ts:5-9`). 0 pages read live tenant data. |
| HL-BTI Alpha — CeoDashboard, RoiDashboard, CommandCenter, Implementation, Scorecard                         | A working consulting platform | **browser localStorage** (`store.ts:5-8`). Nothing persists beyond the browser.                                                                                                     |
| HLVS / Venture Studio — 20 routes, 62,250 opportunity records                                               | A live intelligence product   | This one is **genuinely data-backed** in production, but it is about _Herman Legacy's_ opportunity portfolio, not barbershops.                                                      |
| `/visibility-assessment`, `/book`                                                                           | Assessment and booking        | **Intake forms only.** `/book` collects a consultation request; there is no booking engine behind it.                                                                               |
| `appointment_reminder` SMS template                                                                         | Appointment reminders exist   | A seeded **string** for a non-existent product. No sender, no schedule, no recipients, no code path.                                                                                |
| All edge workers                                                                                            | Background automation         | Every one is inert and says so in its header.                                                                                                                                       |

---

## 15. Top 10 next actions, in dependency order

> These are development actions, not a request that anyone run commands. Each lands as a merge-ready PR through the
> Control Center.

1. **Reconcile production drift (B1/B2).** Produce a truthful map of what is actually in the canonical database vs the
   repo, and a console report of the difference. _Nothing schema-related is safe until this is done._ Needs a CEO
   go-ahead to act on the result.
2. **Correct `CLAUDE.md`** (48 migrations, 44 pgTAP files) and record in `.hlbos/milestone.json` that BarberOS is
   net-new with no code — so no future session mistakes taxonomy labels for a product.
3. **Write the BarberOS product definition** naming the reuse contract explicitly: which of R1–R18 back which
   capability, so nothing is rebuilt. (Model it on `04-salonai-gap-register.md`, which already does this well.)
4. **Design and test the `shop` schema** — locations, staff, services, service_prices, hours, resources. pgTAP first:
   tenant isolation, RLS+FORCE, no anon write. Written and CI-verified, **unapplied** pending approval.
5. **Design and test the customer schema** — `shop.customers`, `households`, `household_members`, tags, notes, linked
   to `comms.consent` from day one so no message can be sent without consent.
6. **Design and test appointments + transactions** — the tables that make every downstream engine possible, with the
   `events` bus wired for lifecycle events.
7. **Choose and build one booking connector end-to-end** (recommend **Square** — booking and POS in one API, so items
   6 and the revenue data arrive together). Connector + sync worker + normalizer on the existing
   `integrations.connectors` framework. _Requires a CEO decision on the vendor and credentials._
8. **Activate the communications path for real** — implement `TwilioProvider.send()` and one email provider, deploy
   the comms worker, prove a real message with a real provider reference in `comms.messages`. _Requires CEO-granted
   keys._
9. **Build the interval + overdue engine** on real appointment data, and surface "customers due" as the first
   evidence-backed leakage finding.
10. **Build the rebooking engine** — the first automation that closes the loop: detects overdue, drafts the message,
    requires owner approval through `workflows`, sends via `comms`, attributes the resulting booking, and reports the
    revenue. This is the first thing a barbershop would pay for.

**Actions 1, 7 and 8 need a decision from Keith** (drift go-ahead, booking vendor, provider keys). Actions 2–6, 9 and
10 are engineering and need nothing from him.

---

## 16. File / code evidence index

| Conclusion                       | Evidence                                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BarberOS does not exist          | `grep -ril barber` → 5 source files, all taxonomy strings; `apps/control-center/src/lib/registry.ts:79-81`                                                                                                                          |
| 48 migrations, 22 schemas        | `supabase/migrations/`                                                                                                                                                                                                              |
| No operational tables            | `grep -rhoiE "create table.*(customer\|appointment\|booking\|staff\|location\|household)" supabase/migrations/` → only `sales.customer_selections`, `vstudio.portfolio_members`, `identity.memberships`, `provisioning.work_orders` |
| 860 unit tests pass              | `pnpm vitest run` (executed 2026-09-16)                                                                                                                                                                                             |
| pgTAP not run here               | 44 files in `supabase/tests/`; requires a live stack                                                                                                                                                                                |
| RLS enforced                     | `…0014_visibility_core.sql:84-106` and equivalents in every migration                                                                                                                                                               |
| Workflow gate real               | `visibility.publish_content()` raises unless `workflows.is_approved()`                                                                                                                                                              |
| Reviews cannot be fabricated     | `…0014:72` comment + no INSERT policy; `visibility.ingest_review` is platform-admin only                                                                                                                                            |
| Website scan real                | `_shared/discovery/scan.ts` (163 lines), `rubric.ts` (233 lines, 14 checks), `tests/discovery_website.test.ts`                                                                                                                      |
| Consulting engine real           | `packages/bti-engine/src/consulting/` — findings, priority, solutions, roadmap, financial, narrative                                                                                                                                |
| Financial refuses to invent      | `consulting/financial.ts:8` — `"Additional financial information required."`                                                                                                                                                        |
| Only mock providers active       | `…0012:202-205` (ai), `…0019:368-373` (comms), `…0011:172-177` (connectors)                                                                                                                                                         |
| Comms adapters inert             | `_shared/comms/twilio.ts:24-26`, `email.ts:22-24`                                                                                                                                                                                   |
| Stripe 501                       | `supabase/functions/billing-webhook/index.ts:32`                                                                                                                                                                                    |
| Workers inert                    | `discovery-website-worker/index.ts:3-5, 160-168`                                                                                                                                                                                    |
| Executive portal is in-code data | `portal-data.ts:1-7`, `intelligence-data.ts:5-9`                                                                                                                                                                                    |
| HL-BTI Alpha is localStorage     | `apps/hl-bti-alpha/src/lib/store.ts:5-8`                                                                                                                                                                                            |
| Production drift                 | `.hlbos/milestone.json` blockers[3]                                                                                                                                                                                                 |
| Business health framework        | `docs/visibilityai/phase-1-enablement/15-business-health-framework.md`                                                                                                                                                              |
| Reuse precedent                  | `docs/architecture-audit/hlvs-phase-5-closeout/04-salonai-gap-register.md`                                                                                                                                                          |

---

## 17. The one thing worth saying plainly

The instinct behind this audit — _verify before building, assemble rather than rebuild_ — is correct, and it has
already paid off: it prevented a build on top of a product that does not exist.

The good news is that the substrate is real and unusually disciplined. Tenancy, RLS, audit, events, approvals,
entitlements, consent, billing and a genuinely good consulting-report engine are built and tested. BarberOS does not
need a platform; it needs a **domain** and a **connection to the outside world**.

The hard news is that the missing 75% is not spread evenly — it is concentrated in exactly the part that makes
BarberOS what the brief describes: appointments, customers, capacity and money. Until a real barbershop's appointment
history is in a real table, every one of Phases 6–15 and 19–27 can only be mocked, and this platform's operating
contract forbids mocking it.

So the shortest honest path to a sellable BarberOS runs through actions 4–10: **one shop, one booking connector, one
customer list, one automation that sends and can prove it worked.**
