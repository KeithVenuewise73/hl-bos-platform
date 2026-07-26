# Deliverable 8 — VisibilityAI Reuse Matrix

**Audit:** VisibilityAI Phase 0
**Date:** 2026-07-26

Reuse decisions: **Reuse unchanged · Extend · Repair · Consolidate-first · New module · Defer · Executive decision · Cannot assess.**

For every VisibilityAI capability, mapped to the existing HL-BOS component with evidence.

| #   | VisibilityAI capability                 | Existing HL-BOS component                                      | Evidence           | Reuse decision                 | Required extension / new work                     | Dependencies             | Launch priority | Risks                            |
| --- | --------------------------------------- | -------------------------------------------------------------- | ------------------ | ------------------------------ | ------------------------------------------------- | ------------------------ | --------------- | -------------------------------- |
| 1   | Tenant/agency & client accounts         | `platform.tenants`, `identity`                                 | mig 0002/0007/0008 | **Reuse unchanged**            | Wire provisioning to UI                           | auth                     | P0              | none                             |
| 2   | Auth / login / invites                  | Supabase Auth + `identity.accept_invitation`                   | mig 0006           | **Reuse unchanged**            | Build sign-in UI; enable leaked-pw protection     | —                        | P0              | MFA absent                       |
| 3   | Roles / permissions                     | `identity` permission model                                    | mig 0003           | **Reuse + extend**             | `visibility.*` perms (done)                       | identity                 | P0              | none                             |
| 4   | Website intake (prospect capture)       | `visibility.create_prospect`                                   | mig 0017           | **Reuse + extend**             | Public/agency intake UI                           | tenancy                  | P0              | anon intake needs rate-limit     |
| 5   | Website scanning (fetch/crawl)          | **none**                                                       | —                  | **New module**                 | Scan worker (edge fn + queue) feeding assessments | events, integrations, ai | **P0**          | biggest net-new; abuse/SSRF risk |
| 6   | Technical analysis (PageSpeed etc.)     | `integrations.connectors` (pagespeed seeded)                   | mig 0011           | **Extend**                     | Implement PageSpeed connector                     | integrations             | P1              | API quotas/keys                  |
| 7   | Content / business analysis (AI)        | `ai-gateway` + `ai.prompts`                                    | mig 0012           | **Extend + deploy**            | Deploy gateway; add analysis prompts; grant key   | ai edge, Vault           | P0              | not deployed; no key             |
| 8   | Industry classification                 | `visibility.prospects.industry` + AI                           | mig 0017           | **Extend**                     | Classification prompt                             | ai                       | P1              | none                             |
| 9   | Competitor comparison                   | **none**                                                       | —                  | **New (within visibility)**    | Competitor tables + AI                            | ai, storage              | P2              | data sourcing                    |
| 10  | Local visibility / GBP analysis         | `integrations` (google_business seeded)                        | mig 0011           | **Extend**                     | Google Business connector                         | integrations             | P1              | OAuth                            |
| 11  | Reputation / review analysis            | `visibility.reviews` + `ingest_review`                         | mig 0014           | **Reuse + extend**             | Review connector (ingest path exists)             | integrations             | P1              | trusted-ingest only (by design)  |
| 12  | Module recommendations                  | `visibility.recommendations` (kind incl. `service`/`software`) | mig 0017           | **Reuse unchanged**            | Recommendation-generation logic                   | ai                       | P0              | none                             |
| 13  | Business Growth Score / ROI             | `visibility.complete_assessment` (weighted 0–100)              | mig 0017           | **Reuse unchanged**            | Auto-scoring from scan inputs (today manual)      | scan, ai                 | P0              | honest-scoring must hold         |
| 14  | Assessment / 16 categories              | `visibility.assessment_categories`(16) + workflow              | mig 0017           | **Reuse unchanged**            | UI to run/score                                   | —                        | P0              | none                             |
| 15  | Proposal generation                     | **none** (AI can draft; nowhere to store)                      | —                  | **New (visibility) + storage** | Proposal builder + `storage` for PDFs             | ai, storage, workflows   | **P0**          | needs storage module             |
| 16  | Agreements / e-sign                     | **none**                                                       | —                  | **New + storage**              | Signed-doc storage; e-sign integration            | storage, integrations    | P1              | legal/e-sign vendor              |
| 17  | Payments / conversion                   | `billing.*` + `set_prospect_stage('client')` emits event       | mig 0016/0017      | **Reuse + repair**             | Stripe adapter + deploy webhook                   | billing edge             | P1              | Stripe stub                      |
| 18  | Client onboarding / provisioning        | `platform.provision_tenant` + `converted_tenant_id`            | mig 0008/0017      | **Reuse unchanged**            | Orchestrate conversion→provision                  | tenancy                  | P1              | none                             |
| 19  | Implementation workflows / human review | `workflows.*` (request/decide/is_approved)                     | mig 0013           | **Reuse unchanged**            | Define workflow kinds                             | workflows                | P1              | none                             |
| 20  | Client dashboards                       | **none** (no reporting)                                        | —                  | **New (defer) + app**          | Dashboard UI over assessments                     | reporting                | P2              | reporting absent                 |
| 21  | Continuous monitoring / re-scan         | `events` + `assessments.period_label` (monthly)                | mig 0009/0017      | **Extend + deploy**            | Scheduler (pg_cron) + scan worker                 | events, scan             | P2              | pg_cron not installed            |
| 22  | Proposal/report delivery (email/SMS)    | **none**                                                       | —                  | **New module**                 | `communications` module                           | communications           | **P0**          | largest foundational gap         |
| 23  | Notifications                           | `events` bus (no channel)                                      | mig 0009           | **Extend**                     | Notification channel via communications           | communications           | P1              | depends on 22                    |
| 24  | Document/asset storage                  | **none**                                                       | —                  | **New module**                 | `storage` module                                  | storage                  | **P0**          | blocks proposals                 |
| 25  | Audit of all actions                    | `audit.emit` triggers                                          | mig 0004           | **Reuse unchanged**            | attach to new tables                              | audit                    | P0              | denial-logging gap               |
| 26  | AI cost control                         | `ai.budgets` + `within_budget`                                 | mig 0012           | **Reuse unchanged**            | set budgets per tenant                            | ai                       | P1              | none                             |
| 27  | White-label (later phase)               | `platform.tenants.branding` jsonb                              | mig 0002           | **Defer**                      | Theming layer                                     | app                      | P3              | out of launch scope              |

## Summary of decisions

| Decision                | Count | Capabilities                                                     |
| ----------------------- | ----: | ---------------------------------------------------------------- |
| Reuse unchanged         |     9 | 1,2,12,13,14,18,19,25,26                                         |
| Extend existing         |     8 | 3,4,6,8,10,11,21,23                                              |
| Extend + deploy/repair  |     3 | 7,17 (repair), 21                                                |
| New reusable module     |     3 | **communications (22)**, **storage (24)**, reporting (20, defer) |
| New within `visibility` |     4 | scanning (5), competitor (9), proposals (15), agreements (16)    |
| Defer                   |     2 | client dashboards (20), white-label (27)                         |

**The critical path for launch** is: deploy `ai-gateway` (7) + build `communications` (22) + build `storage` (24) + build the **website-scanning worker** (5) that feeds the already-built assessment/scoring/recommendation engine (12,13,14). Everything else is reuse or extension of what already exists.

## New-module justification (no-duplication test)

Each proposed new module passes the brief's test:

**`communications`** — (1) No existing component sends email/SMS; the `events` bus carries domain events, not messages. (2) Extending `events` is wrong: consent, templates, opt-out, delivery status, and provider adapters are a distinct concern. (3) Stays reusable: every vertical needs missed-call text-back, proposals, notifications. (4) Depends on: integrations (Twilio/email providers), events, audit, workflows (send-gate). (5) Owns a new `communications` schema. (6) **Required for launch.**

**`storage`** — (1) No file storage exists; `content_assets` holds text. (2) Extending visibility is wrong — files (proposals, agreements, screenshots, brand assets) are cross-vertical. (3) Reusable by all products. (4) Depends on: Supabase Storage, identity (tenant-scoped access), audit, retention rules. (5) Owns `storage` buckets + a `storage_meta` schema. (6) **Required for launch** (proposals/agreements).

**Website-scanning worker** — (1) No scan pipeline exists; assessments are scored by hand. (2) It belongs _within_ `visibility` (it feeds assessments) but runs as a background worker. (3) Reusable pattern (emit event → dispatch → worker) already exists in `events`. (4) Depends on: events, integrations (PageSpeed/GBP), ai (analysis), storage (screenshots). (5) Extends the `visibility` schema (scan-result tables). (6) **Required for launch.**
