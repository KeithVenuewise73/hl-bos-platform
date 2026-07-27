# Phase 1 · Deliverable 3 (CP6) — Herman Legacy Service Catalog Specification

**Date:** 2026-07-27 · **Checkpoint:** 6 · Data-driven, versioned, availability-gated. **No approved prices created.**

`discovery.service_catalog` is the single, reusable catalog of Herman Legacy services the Blueprint Engine can recommend. It is configuration data (readable by any authenticated context, written only by a platform administrator via `discovery.register_service`), not code.

## 1. Schema

| Column                                      | Meaning                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `key`                                       | Stable service identifier (snake_case)                               |
| `public_name`                               | Customer-facing name (provisional — see CEO decisions)               |
| `internal_name`                             | Internal name                                                        |
| `description`                               | What the service is                                                  |
| `category`                                  | Service category (see list below)                                    |
| `delivery_type`                             | `one_time` \| `recurring` \| `hybrid`                                |
| `is_recurring`                              | Convenience flag                                                     |
| `eligible_business_types`                   | JSON list of business types this suits                               |
| `required_evidence`                         | Evidence keys that justify recommending it (traceability)            |
| `relevant_dimensions`                       | Maturity/health dimensions it improves                               |
| `prerequisites`                             | Other service keys required first                                    |
| `dependencies`                              | Other service keys it depends on                                     |
| `default_priority`                          | `critical`…`future`                                                  |
| `availability`                              | `available` \| `coming_soon` \| `unavailable` \| `deprecated`        |
| `requires_human_review`                     | Whether a human must review before it is offered                     |
| `pricing_ref`                               | **Reference/placeholder only** (`pending-ceo:<key>`) — never a price |
| `version`, `effective_from`, `effective_to` | Versioning + validity window                                         |

## 2. Availability gates recommendations

`discovery.recommend` refuses to attach a service whose `availability` is `unavailable` or `deprecated` (proven by `25_blueprint_engine.sql :: t_inactive_service_excluded`). A `coming_soon` service can be recommended (so the roadmap can plan for it) but is clearly not yet deliverable.

## 3. Categories seeded

Business Discovery · Website Creation · Website Modernization · Search Visibility · Local Visibility · Content · Social Presence · Lead Generation · Reputation Management · Communications · Customer Experience · Automation · Analytics · AI Enablement · Software Implementation · Managed Services · Hosting and Support.

## 4. Seeded services (provisional; 25 rows)

`business_discovery`, `website_creation`, `website_modernization`, `search_visibility`, `local_visibility`, `content_creation`, `social_presence`, `lead_capture`, `crm_setup`, `ai_receptionist`, `appointment_scheduling`, `review_management`, `reputation_recovery`, `communications`, `missed_call_recovery`, `customer_follow_up`, `payments`, `dashboards`, `reporting`, `workflow_automation`, `document_management`, `vertical_os`, `custom_software`, `managed_services`, `hosting_support`.

Each carries `pricing_ref = 'pending-ceo:<key>'`. Availability reflects current delivery capability (e.g. `website_creation` = `available`; `ai_receptionist`, `content_creation` = `coming_soon`).

## 5. What requires a CEO decision (surfaced, not blocking)

Final public service names, availability per service, pricing models, setup fees, and recurring prices are **CEO decisions**. The catalog uses provisional names and `pending-ceo:` pricing references so the engine is fully functional locally without inventing a single price. See the [CEO Decision Report](42-checkpoint6-ceo-decision-report.md).
