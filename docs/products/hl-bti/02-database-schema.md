# HL-BTI — Database Schema (Deliverable 2)

**Migration:** `supabase/migrations/20260727090300_hlbos_0026_bti_platform.sql` (`bti` schema). Local development only — not applied to any live project.

## Schema posture

`bti` is `revoke all … from public/anon/authenticated`, `grant usage … to authenticated`, **not** exposed via PostgREST. Every table has RLS **enabled + FORCE**. Reads go through permission-checked `SELECT` policies; **writes have no policy** — they happen only inside `SECURITY DEFINER` RPCs owned by the migration role (BYPASSRLS in production), each of which checks `identity.has_permission` first. Every business table carries `platform.set_updated_at()` and `audit.emit()` triggers.

## Enums (new types — never ALTER an existing type)

`engagement_mode` (full_transformation | analysis_only) · `engagement_stage` (13 stages + declined/on_hold) · `assessment_status` (draft | scoring | in_review | completed) · `project_status` · `milestone_status` · `task_status` · `roi_status` (baseline | projected | realized).

## Tables

### Catalogs (config; readable by any authenticated context)

| Table                  | Purpose                                      | Key columns                                                              |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `intelligence_domains` | the 6 executive domains                      | `key` pk, `transformation_weight`, `display_order`                       |
| `domain_dimensions`    | scored dimensions per domain (extensible)    | pk `(domain_key, dimension_key)`, `weight`, `industry_pack` (null = all) |
| `industry_packs`       | industry configuration (extension mechanism) | `key` pk, `applicable_domains` jsonb, `default_services` jsonb           |

### Portfolio & lifecycle (tenant-scoped)

| Table         | Purpose                                 | Notable columns / FKs                                                                                                                   |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `businesses`  | portfolio registry (HSCS, Venuewise, …) | `tenant_id`, `key` (unique per tenant), `analysis_only`, `dashboard_visible`                                                            |
| `engagements` | the 13-stage transformation lifecycle   | `business_id`, `mode`, `stage`, `profile_id`→discovery, `blueprint_id`→discovery, `proposal_id`→sales, `workflow_instance_id`→workflows |

### Executive assessment & scoring

| Table               | Purpose                                          | Notable columns                                                                                                                |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `assessments`       | executive assessment over a discovery assessment | `engagement_id`, `discovery_assessment_id`, `status`, `workflow_instance_id`                                                   |
| `dimension_ratings` | raw 0–5 inputs                                   | unique `(assessment_id, domain_key, dimension_key)`, FK → `domain_dimensions`                                                  |
| `domain_scores`     | derived per-domain 0–100                         | unique `(assessment_id, domain_key)`                                                                                           |
| `executive_scores`  | the 7 scores (one row/assessment)                | `business_health, operations, growth, technology, ai_readiness, financial_opportunity, transformation` — all nullable (honest) |

### Delivery & ROI

| Table                               | Purpose                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `projects` → `milestones` → `tasks` | consulting implementation delivery (distinct from software provisioning) |
| `roi_metrics`                       | baseline → projected → realized ROI per engagement                       |

## RPC surface (all `SECURITY DEFINER`, `set search_path=''`, permission-gated)

- **Catalog:** `register_industry_pack` (platform)
- **Registry:** `register_business`
- **Lifecycle:** `open_engagement`, `link_profile`, `advance_stage`, `_stage_rank` (helper)
- **Assessment:** `start_assessment`, `rate_dimension`, `compute_scores`, `submit_assessment_for_review`, `complete_assessment`
- **Delivery:** `create_project`, `add_milestone`, `add_task`, `set_task_status`
- **ROI:** `record_roi_metric`, `realize_roi_metric`
- **Dashboard:** `ceo_dashboard()` (platform-permission gated, returns a table)

## Permissions

Tenant: `bti.{business,engagement,assessment,delivery,roi}.{read,manage}`. Platform: `bti.catalog.manage`, `bti.dashboard.read`. All registered into the existing `identity.permissions`/`role_permissions` model (12 keys) — no new authorization engine.

## Seeds

6 intelligence domains, 43 domain dimensions (matching the PCO's module lists), 10 industry packs (general, transportation, sports, salon, barbershop, restaurant, healthcare, professional_services, construction, manufacturing). No prices, no licensing, no tenant/business rows (those are created per real engagement via RPC — never seeded as fake data).

## Rollback

`DROP SCHEMA IF EXISTS bti CASCADE;` + delete `bti.%` permissions/role_permissions (documented in the migration header).
