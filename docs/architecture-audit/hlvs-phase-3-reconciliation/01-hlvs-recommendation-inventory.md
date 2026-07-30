# 01 · HLVS Recommendation Inventory

Every recommendation, opportunity, and concept HLVS contains, organized by the categories in the directive. Sourced from the live catalogs (`discovery.service_catalog`, `discovery.module_catalog`, `hlvs.capabilities/products/industry_templates/extraction_candidates`) and the strategic docs (Checkpoint 8B, 67–74). Counts are from the live database (2026-07-29).

> **What "HLVS knowledge" turned out to be:** it is not a loose pile of notes — most of it is already _codified_ as catalog rows (services, modules, capabilities, products, templates) plus the Checkpoint-8B legacy-discovery record. That is the corpus reconciled in reports 02–08.

## A. Software opportunities — the module catalog (23)

The `discovery.module_catalog` is HLVS's software-recommendation list, each with a self-declared readiness flag.

| Readiness (as catalogued) | Modules                                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ready                     | identity, storage                                                                                                                                                                                                                                     |
| In development            | billing, communications, crm, dashboards                                                                                                                                                                                                              |
| Planned                   | ai_receptionist, analytics, content_management, customer_portal, document_management, lead_capture, lead_recovery, local_visibility, payments, reputation_recovery, reviews, scheduling, seo, staff_portal, vertical_os, website, workflow_automation |

_(Report 02 shows these flags lag reality — several "planned/in-development" modules are actually live.)_

## B. Business opportunities & revenue opportunities — the service catalog (25)

The `discovery.service_catalog` is HLVS's commercial service menu (some software-delivered, some human-delivered), each a revenue line.

| Availability              | Services                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Available (offerable now) | appointment_scheduling, business_discovery, communications (Email & SMS), crm_setup, dashboards, hosting_support, lead_capture, local_visibility, managed_services, payments, review_management, search_visibility (SEO), website_creation, website_modernization |
| Coming soon               | ai_receptionist, content_creation, custom_software, customer_follow_up, document_management, missed_call_recovery, reporting, reputation_recovery, social_presence, vertical_os, workflow_automation                                                              |

## C. AI capabilities & automation concepts — the capability registry (10)

`hlvs.capabilities` — the business/technical abilities Herman Legacy owns:
**AI Receptionist, Communications, Document Extraction, Event Management, KPI Scoring, Registration, Reputation Recovery, Route Assessment, Scheduling, Tenant Identity.**

Automation concepts additionally named in the catalogs: **Workflow Automation, Missed-Call Recovery, Customer Follow-Up, Lead Recovery, AI Receptionist** (the deterministic-first / advisory-AI pattern applies to all).

## D. Industry recommendations — industry templates (7)

`hlvs.industry_templates` (all lifecycle = draft): **Salon, Barbershop, Transportation, Sports Organization, Home Services, Consulting, School District.** Each is a recommended module composition for its vertical.

## E. Platform concepts & business-transformation ideas — products (7 draft) + strategic concepts

**Codified draft products (`hlvs.products`, all draft, no code):** SalonAI, HomeHuddle, AthleteHuddle, ReceptionAI, TransportationAI, Review Management, Reputation Recovery.

**Strategic product/platform concepts (from Checkpoint 8B & the registry):**

| Concept                                                          | What it is                                                                                     | Documented status                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Venuewise Core                                                   | A real multi-tenant coordination platform powering the Huddle products (live at venuewise.net) | **Live** — parallel to HL-BOS; convergence is a CEO decision                       |
| HomeHuddle                                                       | Family/athlete community hub (flagship Huddle)                                                 | Live in legacy Venuewise; in HL-BOS a billing catalog example only                 |
| AthleteHuddle                                                    | Athlete persona/path within Venuewise                                                          | Live path (not a standalone app)                                                   |
| CoachesHuddle                                                    | Coach-facing community                                                                         | Live path                                                                          |
| OrganizationHuddle                                               | Org/club community                                                                             | Live path                                                                          |
| FacilityHuddle                                                   | Facility booking (real live booking tables)                                                    | Live path                                                                          |
| 5-Star Sports Media                                              | Sports-media site + Academy + Podcast                                                          | Live static site                                                                   |
| HighlightAI                                                      | Video-AI highlight-clip engine                                                                 | **Does not exist** — no engine, only a YouTube-embed gallery. Genuinely greenfield |
| BroadcastAI                                                      | Live broadcast/streaming AI                                                                    | **Does not exist** — no code, no design. Genuinely greenfield                      |
| HL-BTI                                                           | Business Transformation Intelligence                                                           | **Built** (first Factory product)                                                  |
| VisibilityAI                                                     | Discovery→assessment→proposal front door                                                       | **Prototype** (DB + workflow; no UI/scanning)                                      |
| HSCS Government Logistics (HSCS-GLP)                             | Government logistics platform (74 tables)                                                      | Legacy, unreachable, out of scope                                                  |
| HLVS Venture Studio                                              | Legacy studio product                                                                          | Legacy, unreachable, out of scope                                                  |
| RecoveryWise / AI Asset Recovery                                 | AI asset recovery                                                                              | Legacy, unreachable, open security finding (SEC-2)                                 |
| CoachAI, FleetHuddle, SalonAI, LandscapeAI, Venuewise (registry) | Named verticals                                                                                | Planned — no code                                                                  |

## F. Market research & feature requests (legacy IP sources)

`hlvs.extraction_candidates` records **12 legacy systems** as reuse sources (all still at status = _candidate_, none extracted): **5-Star Sports Media, AthleteHuddle, CoachesHuddle, FleetHuddle, HL-BOS core, HomeHuddle, HSCS, HSCS Government, SalonAI, TransportationAI, Venuewise, VisibilityAI** — each with an observed capability (media publishing, roster+KPI, coaching workflows, fleet management, home-services scheduling, case management, route assessment, event management+registration, website assessment, …).

Feature-level requests that appear only as **assessment categories VisibilityAI scores prospects on** (not products): Reputation Management, Marketing Automation, AI Receptionist, SEO, Review recovery, Missed-call text-back, Executive Dashboard, Relationship Intelligence.

## Inventory totals

| Corpus                                    | Count                              |
| ----------------------------------------- | ---------------------------------- |
| Software modules recommended              | 23                                 |
| Commercial services / revenue lines       | 25                                 |
| Business/AI capabilities                  | 10                                 |
| Industry templates                        | 7                                  |
| Draft products (codified)                 | 7                                  |
| Strategic product/platform concepts       | ~15 (incl. Huddles, media, legacy) |
| Legacy IP sources (extraction candidates) | 12                                 |

This is the reconciled input set. Report 02 cross-references every item against the current implementation.
