# 04 · Database Assessment

Verified live against _HL-BOS Core_ (`mvvtngiopdrgiedjmhfb`) and cross-checked against the 27 SQL migrations, 2026-07-29. All counts are from direct catalog queries.

---

## 1. Shape at a glance

| Measure                                              | Value                                           |
| ---------------------------------------------------- | ----------------------------------------------- |
| Migrations applied                                   | 27 (0001–0027), matching the repository exactly |
| Application schemas                                  | 17                                              |
| Application tables                                   | 124                                             |
| Tables with RLS enabled                              | 124 / 124 (100%)                                |
| SQL views / materialized views                       | 0 — "dashboards" are functions, not views       |
| Application functions (the API surface)              | ~200, overwhelmingly `SECURITY DEFINER`         |
| Tables exposed via the automatic REST API (`public`) | 0 tables (2 views)                              |
| Error-level security advisories                      | 0                                               |

**Growth since Phase 0 (2026-07-26):** 17 → 27 migrations, 49 → 124 tables, 10 → 17 schemas. The added schemas are `storage_meta`, `comms`, `discovery`, `sales`, `provisioning`, `hlvs`, `bti`.

## 2. Schemas and what they hold

| Schema         | Tables | Domain                                                                     | Class     |
| -------------- | ------ | -------------------------------------------------------------------------- | --------- |
| `platform`     | 1      | Tenants and lifecycle                                                      | Core      |
| `identity`     | 8      | Profiles, memberships, roles, permissions, invitations, platform admins    | Core      |
| `audit`        | 2      | Append-only audit + security events                                        | Core      |
| `events`       | 4      | Transactional outbox event bus + handlers                                  | Shared    |
| `entitlements` | 4      | Feature catalog, plan mapping, module activation                           | Shared    |
| `integrations` | 5      | Connector/connection/sync/webhook framework                                | Shared    |
| `ai`           | 7      | Provider/model/prompt registry, run ledger, budgets, guardrails            | Shared/AI |
| `workflows`    | 3      | Human-approval gate (instances, tasks, approvals)                          | Shared    |
| `visibility`   | 8      | VisibilityAI: sites, content, reviews, prospects, assessments              | Product   |
| `billing`      | 8      | Subscriptions, invoices, payments, plans/prices                            | Shared    |
| `storage_meta` | 1      | File registry, retention, access boundary                                  | Shared    |
| `comms`        | 7      | Email/SMS templates, consent, suppression, messages                        | Shared    |
| `discovery`    | 19     | Discovery engine (10) + website scan (1) + blueprint engine (8)            | BI        |
| `sales`        | 7      | Proposals, prices, agreements, billing setup                               | Shared    |
| `provisioning` | 7      | Requests, work orders, entitlement plan, factory authorizations, readiness | Shared    |
| `hlvs`         | 19     | The Software Factory (Product Intelligence Layer)                          | HLVS      |
| `bti`          | 14     | HL-BTI platform (13) + analysis snapshots (1)                              | Product   |

Full per-table listing is in the appendix of this report (§8).

## 3. The multi-tenancy model

**Shared-schema, tenant-scoped RLS.** Roughly **70 tables carry a `tenant_id`** foreign key to `platform.tenants(id)`, almost always `ON DELETE CASCADE`, so deactivating a tenant collapses its data. Isolation is enforced in row-level-security policies through two helper functions:

- `identity.is_member(tenant_id)` — is the current user a member of this tenant?
- `identity.has_permission(tenant_id, 'domain.resource.action')` — the single authoritative access check.

Two design choices make this robust:

1. **Policies test permissions, never role names.** Roles are data (rows in `role_permissions`), not code. Adding a role never means editing a policy.
2. **`p_tenant` is a filter, never proof.** Every check also pins `user_id = auth.uid()`. Passing an arbitrary tenant id gets you nothing — there is a specific test (`t_arbitrary_tenant_id_is_not_proof`) asserting this.

**Anonymous users have zero reach** — schema-level access is revoked from `anon` in migration 0001, and only `authenticated` gets minimal `usage`.

### Two intentional exceptions to tenant-scoping (worth understanding)

- **The `hlvs` factory (all 19 tables) has no `tenant_id` at all.** It is a _platform-internal_ facility operated by platform administrators; its single RLS policy is gated on the platform permission `hlvs.catalog.read`. This is correct — the software factory is not a customer-owned thing.
- **Global catalog/reference tables** (plans, features, service/module catalogs, AI providers, BTI domains, connectors, comms templates, agreements) have RLS enabled but permissive read (`using (true)`); their _writes_ are gated behind platform permissions via functions. "RLS enabled" here means "reads are open reference data, writes are locked," which is intended.

## 4. The API is functions, not tables

There are **no SQL views** and the application schemas are **not exposed through PostgREST** (the automatic API is limited to `public`, which holds no application tables). Instead, the entire read/write surface is a curated set of **`SECURITY DEFINER` functions** — roughly 200 of them (discovery 41, hlvs 34, sales 20, bti 18, and so on). This is a deliberate and strong pattern:

- The mutation surface is the function layer, not raw table policies — every write goes through a function that checks permission, enforces invariants, and emits audit + events.
- Most table policies are **SELECT-only**; you cannot `INSERT`/`UPDATE`/`DELETE` a sensitive table directly even as an authenticated user.
- The only browser-reachable functions are the five `public.bti_*` wrappers (the HL-BTI public API) — intentionally the sole exposed surface.

**One consequence to flag:** the security advisor flags those five `bti_*` functions as "signed-in users can execute a SECURITY DEFINER function." That is _by design_ — they are the public API and they enforce membership internally — but it should be an explicit, reviewed decision rather than an accident, and is noted in report 08.

## 5. Cross-domain relationships (the wiring)

- **`platform.tenants`** is the tenancy anchor (~70 inbound `tenant_id` FKs).
- **`auth.users`** is the identity anchor (`profiles.id`, `memberships.user_id`, and pervasive `created_by`/`updated_by`).
- **AI provenance:** generated content (`visibility.content_assets`, `discovery.evidence`, `discovery.blueprint_sections`) carries `ai_run_id → ai.runs`, tying any AI output to a metered, audited run.
- **The value chain:** `discovery.blueprints` → `sales.proposals.blueprint_id` → `provisioning.requests` → `provisioning.factory_authorizations`, which `hlvs.hlbos_intake.commercial_authorization_id` compares against.
- **Billing → entitlements:** `billing.reconcile_entitlements()` writes `entitlements.tenant_entitlements` and `module_activations` from subscriptions.
- **BTI reuses discovery:** `bti.assessments.discovery_assessment_id → discovery.assessments` — the product builds on the shared engine rather than forking it.
- **Events fabric:** many domains seed `events.subscriptions` + `events.handlers`; every worker consumes from `events.deliveries`.

## 6. Data honesty, enforced in the schema

The "never invent data" doctrine is not just prose — it is structural:

- `visibility.reviews`, `billing.invoices`, `billing.payments` have **no tenant write path** — a customer cannot fabricate a review or a payment; those only arrive through verified server-side functions (e.g. the billing webhook).
- Scores that have no evidence are stored as **`null`, never `0`** (the BTI and discovery scoring engines assert this).
- The audit log is **append-only and immutable** — an `audit.reject_mutation()` trigger blocks UPDATE/DELETE even for roles that bypass RLS.
- Approved blueprints and accepted reports are **frozen** by triggers; changing them requires a new version.

## 7. Security posture (database)

Verified with Supabase advisors on the canonical project:

- **0 error-level findings.**
- Warnings/info, all low-severity and understood: two tables with RLS-on-but-no-policy (deny-all, intentionally fail-closed: `ai.guardrails`, `integrations.webhook_events`); one function missing an explicit `search_path` (`hlvs.non_exceptionable_rules`); the test extension `pgtap` installed in `public`; the five intentional `bti_*` public functions; leaked-password protection disabled (a dashboard toggle, do before public signup).

This is a **materially cleaner posture than the legacy estate**, which carries two critical, documented findings (SEC-1: ~2,481 rows readable/writable by anonymous users; SEC-2: cross-tenant access on a recovery product). Those live only in the unreachable legacy project and are out of scope here — but the contrast is the point: the rebuild fixed them by construction.

## 8. Appendix — tables by schema

- **platform (1):** tenants
- **identity (8):** profiles, memberships, invitations, roles, permissions, role_permissions, membership_roles, platform_admins
- **audit (2):** events, security_events
- **events (4):** outbox, subscriptions, deliveries, handlers
- **entitlements (4):** features, plan_features, tenant_entitlements, module_activations
- **integrations (5):** connectors, connections, sync_runs, webhooks, webhook_events
- **ai (7):** providers, models, prompts, prompt_versions, runs, budgets, guardrails
- **workflows (3):** instances, tasks, approvals
- **visibility (8):** sites, content_assets, reviews, prospects, assessment_categories, assessments, assessment_scores, recommendations
- **billing (8):** providers, products, plans, plan_prices, subscriptions, invoices, payments, payment_methods
- **storage_meta (1):** files
- **comms (7):** providers, templates, template_versions, sender_identities, consent, suppression, messages
- **discovery (19):** collectors, interview_questions, score_dimensions, profiles, collections, evidence, assessments, profile_scores, blueprints, recommendations, website_scans, service_catalog, module_catalog, roadmap_phases, recommendation_rules, blueprint_sections, blueprint_findings, roadmap_items, impact_estimates
- **sales (7):** prices, proposals, proposal_line_items, customer_selections, agreements, agreement_acceptances, billing_setup_requests
- **provisioning (7):** workstream_catalog, requests, entitlement_plan, work_orders, work_order_tasks, factory_authorizations, readiness_exceptions
- **hlvs (19):** capabilities, modules, products, industry_templates, product_editions, extraction_candidates, duplicate_checks, product_blueprints, software_creation_orders, prompt_packages, development_runs, checkpoint_reports, build_completion_reports, conformance_results, conformance_exceptions, catalog_update_proposals, factory_build_packages, hlbos_intake, hlbos_feedback
- **bti (14):** intelligence_domains, domain_dimensions, industry_packs, businesses, engagements, assessments, dimension_ratings, domain_scores, executive_scores, projects, milestones, tasks, roi_metrics, analysis_snapshots
