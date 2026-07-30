# 02 · Enterprise Cross-Reference Matrix

For every HLVS recommendation, its status against the current implementation. Status vocabulary (from the directive): **Implemented · Partial · Exists-elsewhere · Duplicate · Commercially-ready · Needs-dev · Obsolete · Merged.** Implementation truth is taken from the Enterprise Catalog (Phase II) and the live schemas; where the catalog's own readiness flag disagrees with reality, the disagreement is called out.

## Headline reconciliation finding

**The commercial `module_catalog` under-reports what is built.** Several modules it flags _in development_ or _planned_ are in fact **live** in the database under HL-BOS or VisibilityAI. The vision's foundation is further along than HLVS's own catalog admits.

## A. Software modules (`discovery.module_catalog`, 23)

| Module              | Catalogued as  | Actual implementation                                                                            | Reconciled status                                        |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| identity            | ready          | `identity` schema, 8 tables, live                                                                | **Implemented**                                          |
| storage             | ready          | `storage_meta` schema, live                                                                      | **Implemented**                                          |
| billing             | in development | `billing` schema, 8 tables live; Stripe adapter stubbed                                          | **Partial** (DB done, adapter needs dev)                 |
| communications      | in development | `comms` schema, 7 tables live                                                                    | **Implemented** (catalog understates)                    |
| dashboards          | in development | `bti.ceo_dashboard()` + discovery scoring live                                                   | **Partial** (product dashboards exist; no shared module) |
| crm                 | in development | no `crm` schema; served by `visibility.prospects` + `bti.businesses`                             | **Exists-elsewhere**                                     |
| payments            | planned        | `billing.payments` live                                                                          | **Implemented** (under billing)                          |
| reviews             | planned        | `visibility.reviews` live                                                                        | **Exists-elsewhere** (VisibilityAI)                      |
| lead_capture        | planned        | `visibility.prospects` (prospect capture) live                                                   | **Exists-elsewhere** (VisibilityAI)                      |
| local_visibility    | planned        | `visibility` + `integrations` (google_business connector)                                        | **Partial**                                              |
| reputation_recovery | planned        | `visibility.reviews` foundation                                                                  | **Partial**                                              |
| seo                 | planned        | discovery website-scan scores SEO; `search_visibility` service available                         | **Partial**                                              |
| document_management | planned        | `storage_meta` foundation live; no doc-mgmt UI                                                   | **Partial**                                              |
| scheduling          | planned        | capability concept; no schema                                                                    | **Needs-dev**                                            |
| workflow_automation | planned        | `workflows` gate live; no general automation engine                                              | **Partial**                                              |
| website             | planned        | offered as a _service_ (website_creation), not a module                                          | **Needs-dev** (as module)                                |
| ai_receptionist     | planned        | capability concept; no engine                                                                    | **Needs-dev**                                            |
| analytics           | planned        | no reporting schema                                                                              | **Needs-dev**                                            |
| content_management  | planned        | none                                                                                             | **Needs-dev**                                            |
| customer_portal     | planned        | none (HL-BTI app is the nearest pattern)                                                         | **Needs-dev**                                            |
| lead_recovery       | planned        | none                                                                                             | **Needs-dev**                                            |
| staff_portal        | planned        | none                                                                                             | **Needs-dev**                                            |
| vertical_os         | planned        | the _composition_ concept (assemble a vertical) — enabled by the Factory but not itself a module | **Needs-dev** (composition, not a unit)                  |

**Module tally:** Implemented 4 · Partial 7 · Exists-elsewhere 3 · Needs-dev 9. **≈ 61% of recommended modules are fully or partly satisfied today.**

## B. Commercial services (`discovery.service_catalog`, 25)

| Status                                                         | Services                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Commercially-ready** (software or process exists to deliver) | business_discovery (discovery engine), communications, payments, dashboards, crm_setup, lead_capture, local_visibility, review_management, search_visibility, appointment_scheduling (scheduling capability), website_creation, website_modernization, hosting_support, managed_services |
| **Partial / Needs-dev**                                        | ai_receptionist, content_creation, custom_software (needs Factory runtime), customer_follow_up, document_management, missed_call_recovery, reporting, reputation_recovery, social_presence, vertical_os, workflow_automation                                                             |

**Service tally:** ≈ 14 of 25 are commercially deliverable now (software or human-delivered), 11 need development.

## C. Business/AI capabilities (`hlvs.capabilities`, 10)

| Capability          | Status                         | Where                                                         |
| ------------------- | ------------------------------ | ------------------------------------------------------------- |
| Tenant Identity     | **Implemented**                | `identity`/`platform`                                         |
| Communications      | **Implemented**                | `comms`                                                       |
| KPI Scoring         | **Implemented**                | deterministic scoring (bti/discovery)                         |
| Event Management    | **Partial / Exists-elsewhere** | legacy Venuewise (FacilityHuddle bookings); events infra live |
| Registration        | **Partial**                    | legacy Venuewise; identity/invitations live                   |
| Document Extraction | **Needs-dev**                  | storage foundation only                                       |
| Reputation Recovery | **Partial**                    | `visibility.reviews`                                          |
| Scheduling          | **Needs-dev**                  | concept only                                                  |
| Route Assessment    | **Needs-dev**                  | TransportationAI concept                                      |
| AI Receptionist     | **Needs-dev**                  | concept only                                                  |

## D. Products (codified 7 + strategic)

| Product                                                                                                                  | Status                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| HL-BTI                                                                                                                   | **Commercially-ready-soon** (built, tested; not deployed; no live customer)    |
| VisibilityAI                                                                                                             | **Partial** (DB + workflow; no UI/scanning)                                    |
| SalonAI, HomeHuddle, AthleteHuddle, TransportationAI, ReceptionAI, Review Management, Reputation Recovery                | **Needs-dev** (draft concepts; assemble from built spine)                      |
| Venuewise Core + Huddles (HomeHuddle/AthleteHuddle/CoachesHuddle/OrganizationHuddle/FacilityHuddle), 5-Star Sports Media | **Exists-elsewhere** (live in legacy Venuewise; convergence is a CEO decision) |
| HighlightAI, BroadcastAI                                                                                                 | **Needs-dev (greenfield)** — genuinely do not exist                            |
| HLVS Venture Studio, HSCS-GLP, RecoveryWise                                                                              | **Obsolete/legacy** (unreachable, out of scope; RecoveryWise has SEC-2)        |
| CoachAI, FleetHuddle, LandscapeAI                                                                                        | **Needs-dev** (planned, no code)                                               |

## E. Duplicates & merges

| Item                                                                                                       | Finding                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM (module_catalog `crm`) vs `visibility.prospects` vs `bti.businesses`                                   | **Duplicate risk** — three models of "a business we work with." Decide once whether to extract a shared `crm` (Rule of Three); do not build a 4th. |
| `discovery.module_catalog` vs `hlvs.modules`                                                               | **Not a duplicate** — commercial vs engineering registry, linked 1:1. Keep both.                                                                   |
| Venuewise Core tenancy vs HL-BOS `platform`/`identity`                                                     | **Duplicate (cross-platform)** — same problem solved twice. Engineering recommends **merge into HL-BOS** (convergence).                            |
| Legacy audit/notifications/AI-logs/documents (hlvs/hscs_glp) vs HL-BOS `audit`/`comms`/`ai`/`storage_meta` | **Duplicate (legacy)** — resolved by construction in the rebuild; legacy is out of scope.                                                          |

## Bottom line

- **Foundation:** ~61% of recommended modules and ~56% of services are already satisfied; the entire shared spine is live.
- **Products:** almost all are concepts to be _assembled_, not built from scratch — the reuse dividend is large.
- **Genuinely new work:** video-AI (HighlightAI/BroadcastAI), reporting/analytics, and a handful of net-new modules.
- **One strategic duplicate to resolve:** Venuewise Core vs HL-BOS (convergence).
