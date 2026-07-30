# 03 · Platform Gap Analysis

What is genuinely missing to complete the platform and satisfy the HLVS vision. "Missing" here means _not built_ — distinct from _built-but-not-deployed_ (which is an ignition step, covered in the Phase I roadmap). Reuse before rebuild: most categories are nearly full.

## Summary

| Category               | State                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Shared services        | **Nearly complete** — 1 genuinely missing (reporting/analytics)                                          |
| AI modules             | **Governed core complete; capability engines missing** (video-AI, guardrail enforcement, embeddings/RAG) |
| Reusable components    | **Strong** — a few net-new modules (scheduling, content, portals)                                        |
| Workflows              | **Complete** for the platform; product-specific flows to add                                             |
| APIs                   | **Complete pattern**; per-product public APIs to add as products ship                                    |
| Databases              | **Complete** for what's built; new domain schemas per new product                                        |
| Executive capabilities | **Strong** (Control Center + Enterprise Catalog); reporting is the gap                                   |
| Commercialization      | **Partial** — pricing/licensing unset; Stripe adapter stubbed                                            |

## 1. Missing shared services

| Service                                                                                                                                                                       | Status                | Note                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporting / analytics                                                                                                                                                         | **Missing**           | No `reporting` schema; catalog `analytics`/`reporting` = planned. Deliberately deferred in Phase I; seed from `assessments`/`audit`/`ai.runs`. **The one true shared-service gap.** |
| CRM (shared)                                                                                                                                                                  | **Deferred decision** | Served today by `visibility.prospects` + `bti.businesses`; extract only at Rule-of-Three.                                                                                           |
| Everything else (identity, tenancy, permissions, audit, events, entitlements, integrations, ai-gateway, workflows, billing, storage, comms, discovery, commerce/provisioning) | **Built**             | 14 shared domains live.                                                                                                                                                             |

## 2. Missing AI modules

| AI capability                                                                                                                           | Status                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AI gateway, prompt-injection fence, deterministic scoring, conformance & readiness engines, recommendation engine, duplicate-risk check | **Built**                                                                                                                         |
| Guardrail-enforcement engine (`ai.guardrails` has the table, no logic)                                                                  | **Missing**                                                                                                                       |
| Embeddings / RAG / semantic search                                                                                                      | **Missing**                                                                                                                       |
| Multi-provider adapters (OpenAI, Gemini)                                                                                                | **Missing** (Anthropic adapter built, keyless)                                                                                    |
| **Video-AI (HighlightAI) & broadcast-AI (BroadcastAI)**                                                                                 | **Missing — genuinely greenfield.** No ingest/transcode (FFmpeg), no CV inference, no clip rendering; no live streaming pipeline. |
| AI Receptionist engine, Document Extraction engine                                                                                      | **Missing** (capabilities catalogued, no engine)                                                                                  |

## 3. Missing reusable components (modules)

Net-new modules the vision needs that have no foundation yet: **scheduling, content_management, customer_portal, staff_portal, lead_recovery, ai_receptionist, analytics, website (as a module).** Modules with a foundation to extend rather than build: **document_management** (storage exists), **local_visibility/seo/reputation_recovery/reviews** (visibility exists), **workflow_automation** (workflows gate exists).

## 4. Missing workflows

The reusable workflow spine is complete (human-approval gate, factory lifecycle, blueprint lifecycle, engagement lifecycle, provisioning readiness, conformance review, catalog governance). Missing are **product-specific flows** that arrive with each product: booking/scheduling flow (FacilityHuddle), media publishing/approval flow (5-Star/HighlightAI), community moderation flow (Huddles), route-planning flow (TransportationAI).

## 5. Missing APIs

The API _pattern_ is complete (SECURITY DEFINER RPCs per domain; the BTI public API as the exemplar). Missing are **per-product public API surfaces** that ship with each product — e.g. a VisibilityAI public API, a Venuewise/community API — each a thin, membership-enforced wrapper like `public.bti_*`. No new API _infrastructure_ is needed.

## 6. Missing databases (schemas)

For what's built, nothing is missing (17 schemas, 124 tables, 100% RLS). New **domain schemas** arrive with new products: a `media` schema (HighlightAI/BroadcastAI), a `community` schema (Huddles), a `reporting` schema (analytics), a `scheduling` schema (if not folded into an existing domain). These are additive, not gaps in the foundation.

## 7. Missing executive capabilities

| Capability                                                                           | Status                                                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| CEO Control Center (build/test/merge/approve, honest portfolio)                      | **Built**                                                                                   |
| Enterprise Catalog (browse, search, relationships, completeness, reuse intelligence) | **Built** (Phase II)                                                                        |
| Cross-product executive reporting / revenue dashboards                               | **Missing** — depends on the reporting service and live product data                        |
| Product Readiness view in the console                                                | **Partial** — this assessment (report 04) provides it; a live console panel could render it |

## 8. Missing commercialization features

| Feature                                                                                   | Status                                                                                         |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Sales → provisioning pipeline (proposals, agreements, work orders, factory authorization) | **Built** (DB)                                                                                 |
| Billing engine (subscriptions, invoices, payments)                                        | **Built** (DB)                                                                                 |
| **Stripe adapter + live payment webhook**                                                 | **Missing** (stubbed — needed before charging)                                                 |
| **Pricing**                                                                               | **Missing** — every `pricing_ref = 'pending-ceo:<key>'`; no prices set anywhere (CEO decision) |
| **Licensing & editions**                                                                  | **Missing** — `hlvs.product_editions` = 0 rows; licensing eligibility fields unset             |
| **Module ownership** (internal vs sellable)                                               | **Missing** (CEO decision)                                                                     |
| Public sign-up / customer onboarding surface / hosting choice                             | **Missing** (CEO decision)                                                                     |

## The five real gaps, ranked

1. **Commercialization inputs** — pricing, licensing, module ownership (business decisions) + the Stripe adapter (engineering). Nothing sells until these exist.
2. **Reporting / analytics service** — the one missing shared service; unlocks the executive revenue view.
3. **Runtime not switched on** — the built spine is inert (Phase I roadmap Stage 1). Not "missing," but blocking demonstration.
4. **Video-AI / broadcast-AI** — the only genuinely greenfield product capability; real, large investment.
5. **Empty engineering module registry** (`hlvs.modules` = 0 rows) — a governance gap; register the real modules.

Everything else is assembly on top of a foundation that already exists.
