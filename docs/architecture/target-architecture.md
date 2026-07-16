# HL-BOS Core v1 — Target Architecture, Impact Report, Migration & Security Plan

**Companion to:** `current-state-audit.md`
**Date:** 2026-07-15
**Status:** Proposal. Nothing herein is implemented. Awaiting Decisions 1–3.

> This document assumes **Decision 1 = Option B (additive strangler-fig)**. If the owner selects A or C, §2–§4 change substantially and this document is superseded.

---

## 1. Target architecture

### 1.1 Guiding correction to the brief

The brief's suggested schema list (`platform`, `identity`, `billing`, `ai`, …) assumes an empty database. It isn't empty. The target below **generalizes the verified-correct `hscs_glp` authorization model into core** rather than inventing a third one.

Concretely: `hscs_glp.is_member(p_org)` becomes `identity.is_member(p_org)`. Same proven shape — `user_id = auth.uid()` always present, `p_org` only ever a filter, explicit `search_path` — promoted from vertical to platform. This is reuse, not rewrite.

### 1.2 Schema layout

| Schema           | Contents                                                                                                              | Status                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `platform`       | tenants, tenant_status, branding, modules, tenant_modules, settings                                                   | **New**                                                                          |
| `identity`       | profiles, memberships, roles, permissions, role_permissions, invitations                                              | **New** — generalized from `hscs_glp`                                            |
| `entitlements`   | products, plans, plan_versions, features, plan_features, limits, subscriptions, overrides, usage_counters             | **New** — genuinely greenfield                                                   |
| `billing`        | customers, subscriptions, items, invoices, payments, events, webhook_events                                           | **New** — genuinely greenfield                                                   |
| `ai`             | providers, models, tenant_provider_config, prompt_templates, prompt_versions, requests, responses, usage, budgets     | **New** — absorbs `0017_api_request_budget`                                      |
| `communications` | channels, templates, template_versions, consent, preferences, suppression, messages, deliveries, sender_identities    | **New**                                                                          |
| `workflow`       | definitions, versions, triggers, steps, runs, step_runs, approvals, tasks                                             | **New**                                                                          |
| `reputation`     | feedback_requests, feedback_responses, review_requests, review_destinations, recovery_cases, recovery_tasks, outcomes | **New**                                                                          |
| `audit`          | events, security_events, job_runs, error_log                                                                          | **New**                                                                          |
| `storage_meta`   | files, buckets, access_grants, retention                                                                              | **New**                                                                          |
| `salon`          | customers, staff, appointments                                                                                        | **New** — reference vertical                                                     |
| `hlvs`           | 59 tables                                                                                                             | **Untouched.** Legacy. Migrate later.                                            |
| `hscs_glp`       | 74 tables                                                                                                             | **Untouched.** Legacy → first migration candidate after Core v1.                 |
| `dpi`            | 4 tables                                                                                                              | **Untouched.** Legacy.                                                           |
| `public`         | 19 tables                                                                                                             | **Untouched** except SEC-1/SEC-2 remediation. No new HL-BOS objects in `public`. |

### 1.3 Naming resolution (per Audit §3.4)

`recovery` is currently overloaded three ways. Binding decisions for Core v1:

| Concept                                             | Name                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Service recovery (unhappy customer → make it right) | `reputation.recovery_cases`                                         |
| Government service recovery                         | stays `hscs_glp.recovery_cases` (legacy)                            |
| Asset repossession/recovery                         | **rename domain to `asset_recovery`** when it migrates off `public` |

### 1.4 Tenant identity

`platform.tenants(id uuid pk)`. **Every** tenant-owned table carries `tenant_id uuid not null references platform.tenants(id)`. No exceptions, no nullable tenant columns, no "global" rows in tenant tables.

During strangler-fig coexistence, `hscs_glp.organizations.id` and `hlvs.organizations.id` are **not** the same identifier space as `platform.tenants.id`. A `platform.tenant_legacy_map(tenant_id, legacy_schema, legacy_org_id)` table records the correspondence when verticals migrate. **No FK between core and legacy schemas until a vertical formally migrates.**

### 1.5 Authorization core

```
identity.is_member(p_tenant uuid) → boolean
identity.has_permission(p_tenant uuid, p_permission text) → boolean
identity.my_tenant_ids() → setof uuid
identity.is_platform_admin() → boolean
entitlements.has_feature(p_tenant uuid, p_feature text) → boolean
entitlements.within_limit(p_tenant uuid, p_feature text) → boolean
platform.module_active(p_tenant uuid, p_module text) → boolean
```

Rules, inherited from what `hscs_glp` already does correctly:

- Every function body contains `user_id = auth.uid()`. `p_tenant` is a filter, never proof.
- `SECURITY DEFINER` + `SET search_path` explicit, always.
- Live in **non-API-exposed schemas** so PostgREST does not publish them as RPC (fixes the advisor noise class properly).
- `EXECUTE` granted to `authenticated` only. Never `anon`, never `PUBLIC`.

**Permission model, not role-name checks.** Roles map to permissions via `identity.role_permissions`; policies test `has_permission(tenant, 'appointments.write')`, never `role = 'manager'`. This is the extension point the brief asks for.

### 1.6 Package ↔ schema ↔ module map

| Package                                 | Schema           | Module key                                  |
| --------------------------------------- | ---------------- | ------------------------------------------- |
| `@hl-bos/tenants`                       | `platform`       | `core.tenancy`                              |
| `@hl-bos/auth`                          | `identity`       | `core.identity`                             |
| `@hl-bos/entitlements`                  | `entitlements`   | `core.entitlements`                         |
| `@hl-bos/billing`                       | `billing`        | `core.billing`                              |
| `@hl-bos/ai`                            | `ai`             | `core.ai`                                   |
| `@hl-bos/communications`                | `communications` | `core.communications`, `core.notifications` |
| `@hl-bos/workflows`                     | `workflow`       | `core.workflows`                            |
| `@hl-bos/reputation`                    | `reputation`     | `core.reputation`                           |
| `@hl-bos/audit`                         | `audit`          | `core.audit`                                |
| `@hl-bos/storage`                       | `storage_meta`   | `core.storage`                              |
| `@hl-bos/database`                      | —                | (types, client factories)                   |
| `@hl-bos/ui`, `config`, `observability` | —                | —                                           |

**Deviation from the brief, flagged:** the brief lists `core.reporting` as an initial module and `packages/observability`. I propose **deferring `core.reporting` out of Core v1** — there is no reporting requirement in the Core v1 functional scope (§A–§M) it would serve, and registering an empty module violates "Do not create empty packages merely to make the repository look complete." Requesting approval to drop it from the v1 registry.

### 1.7 Secrets

`supabase_vault` is already installed and is the correct home for AI/SMS/email/payment provider credentials. `ai.tenant_provider_config` stores a **vault key reference**, never a ciphertext or plaintext. No provider credential ever appears in a table readable by `authenticated`.

---

## 2. Architecture Impact Report

### 2.1 Impact on existing systems

| System                             | Impact                                               | Justification                                                                             |
| ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `hscs_glp` (74 tables)             | **None in Core v1**                                  | Additive-only. New schemas do not touch it.                                               |
| `hlvs` (59 tables)                 | **None in Core v1**                                  | Additive-only.                                                                            |
| `dpi` (4 tables)                   | **None**                                             | Additive-only.                                                                            |
| `public.ltr_data`, `kpi_*`         | **Breaking, if D2 approved**                         | Anon access removed. **Unknown client impact — see §2.3.**                                |
| `public.recovery_*`                | **Breaking, if D2 approved**                         | Policies replaced. 0 rows, so no data risk. Any client relying on `USING(true)` breaks.   |
| `hlvs.brand_compute_overall_score` | Non-breaking                                         | `search_path` added; behavior unchanged.                                                  |
| 2 `hscs_glp` trigger functions     | Non-breaking **unless** something calls them via RPC | They are trigger functions; direct calls are already a defect. **Low but non-zero risk.** |
| 9 Edge Functions                   | **None in Core v1**                                  | Not modified. Migration onto `core.ai` is post-v1.                                        |
| `auth` schema                      | **None**                                             | No second password system. Supabase Auth is the only identity provider.                   |

### 2.2 Net new footprint

~11 new schemas, ~90–110 new tables, ~7 helper functions, ~200+ RLS policies. **Zero existing objects dropped, renamed or truncated.** The only destructive operations proposed anywhere are the **policy replacements in D2**, and those are explicitly gated on owner approval.

### 2.3 ⚠️ Unresolved impact — I cannot assess this myself

**I cannot see any frontend.** `public.ltr_data` (1,144 rows), `kpi_sp_weekly` (287) and `kpi_spe_weekly` (1,050) are currently anon-readable. Something is probably reading them — a dashboard, a public site, a report. **Removing anon access will break that thing, and I have no way to know what it is.**

Per principle 9, I will not touch these until the owner confirms what consumes them. This is the single piece of information I most need and cannot obtain.

### 2.4 Reversibility

| Change                   | Rollback                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| New schemas/tables       | `DROP SCHEMA … CASCADE` — no legacy dependency exists                                      |
| SEC-1/SEC-2 policy swaps | Prior policy DDL captured verbatim in the migration's `-- rollback:` block before dropping |
| `REVOKE EXECUTE`         | `GRANT` restores                                                                           |
| `search_path` fix        | Prior definition captured                                                                  |
| Vault entries            | Deletable                                                                                  |

Every migration in the set carries a `-- rollback:` block. No migration in Core v1 drops or alters a table containing data.

---

## 3. Migration plan

### 3.1 Numbering — fixing M-1

The existing project has two colliding `0009`–`0017` sequences. All HL-BOS migrations use a **mandatory `hlbos_` product prefix**:

```
<supabase_timestamp>_hlbos_<ordinal>_<description>.sql
e.g. 20260716090000_hlbos_0001_extensions_and_schemas.sql
```

Timestamp governs order (as Postgres/Supabase actually behaves); the ordinal is for humans. The prefix guarantees no future collision with `hlvs_*`, `hscs_glp_*`, or bare-numbered migrations. **Retroactively renaming the 52 applied migrations is not proposed** — it would be destructive to migration history for cosmetic gain.

### 3.2 Proposed set

**Pre-flight — remediation (gated on Decision 2, separate from Core v1):**

| #     | Migration                                         | Risk                              |
| ----- | ------------------------------------------------- | --------------------------------- |
| `R01` | `hlbos_r01_fix_public_anon_write` (SEC-1)         | ⚠️ **Breaking — blocked on §2.3** |
| `R02` | `hlbos_r02_fix_recovery_tenant_isolation` (SEC-2) | Low (0 rows)                      |
| `R03` | `hlbos_r03_revoke_trigger_fn_execute` (SEC-3)     | Low                               |
| `R04` | `hlbos_r04_fix_search_path` (SEC-5)               | None                              |

**Core v1:**

| #      | Migration                    | Notes                                                                                               |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `0001` | `extensions_and_schemas`     | Adds `pgtap` (RLS tests), `pg_cron` (workflow scheduling), `pg_net` (webhooks). Creates 11 schemas. |
| `0002` | `identity_and_tenancy`       | `platform.tenants`, `identity.profiles`, `identity.memberships`                                     |
| `0003` | `roles_and_permissions`      | Permission model + helper functions                                                                 |
| `0004` | `module_registry`            | Modules, dependencies, tenant activation                                                            |
| `0005` | `features_and_entitlements`  | Products, plans, features, limits, subscriptions, usage                                             |
| `0006` | `billing`                    | Provider-neutral billing domain + webhook idempotency                                               |
| `0007` | `ai_gateway`                 | Providers, prompts, requests, budgets, vault references                                             |
| `0008` | `communications`             | Templates, consent, queue, deliveries, suppression                                                  |
| `0009` | `workflow_engine`            | Definitions, runs, step_runs, approval gates                                                        |
| `0010` | `reputation_and_recovery`    | Feedback, review requests, recovery cases + ethics constraints                                      |
| `0011` | `audit_and_observability`    | Append-only audit, security events, job runs                                                        |
| `0012` | `storage_metadata`           | File metadata, access classification, retention                                                     |
| `0013` | `salon_reference_vertical`   | Minimal customers/staff/appointments                                                                |
| `0014` | `rls_and_security_hardening` | All policies; deny-by-default sweep                                                                 |
| `0015` | `seed_and_reference_data`    | Modules, roles, permissions, plans, mock providers                                                  |

**Deviation flagged:** the brief implies RLS lands in `0014`. I propose **RLS policies ship in the same migration as their tables** (`0002`–`0013`), with `0014` reserved for the cross-cutting hardening sweep and a `verify_rls_coverage()` assertion that **fails the migration** if any tenant table lacks a policy. Shipping tables in `0002` and policies in `0014` leaves twelve migrations' worth of unprotected tables in between — unacceptable for a "secure by default" platform.

### 3.3 Standards

Idempotent (`IF NOT EXISTS`), single transaction each, `-- rollback:` block mandatory, no secrets, `uuid` PKs, `timestamptz`, `created_at`/`updated_at` + trigger, `created_by`/`updated_by` where useful. Each accompanied by pgTAP tests.

### 3.4 Deployment gating

Migrations are authored **in the repo** and applied to a **Supabase preview branch** first. Production apply requires a protected GitHub Actions workflow with a manual approval gate. **No auto-apply to production on merge to `main`** — per the brief and non-negotiable given M-2.

⚠️ Supabase branching on this project has not been verified as available. If it isn't, add a second Supabase project as a staging environment before any production apply.

---

## 4. Security & RLS plan

### 4.1 Default posture

Every tenant table: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, zero permissive default, `REVOKE ALL FROM anon` on every core schema. `anon` has **no** access to any HL-BOS object in Core v1.

### 4.2 Policy shape

```sql
-- read
USING (identity.is_member(tenant_id))
-- write
USING (identity.has_permission(tenant_id, 'salon.appointments.write'))
WITH CHECK (identity.has_permission(tenant_id, 'salon.appointments.write')
            AND platform.module_active(tenant_id, 'vertical.salon')
            AND entitlements.has_feature(tenant_id, 'salon.appointments'))
```

Feature and module gating are enforced **in the policy**, server-side — never only in UI. That is what §C of the brief demands and it is the part most commonly faked.

### 4.3 `0014` assertion

```sql
-- fails the migration if any table in a core schema
-- lacks RLS or has zero policies
select verify_rls_coverage();
```

### 4.4 Required isolation tests (pgTAP + integration)

Tenant A cannot read/modify Tenant B · staff cannot perform owner actions · viewer cannot write · platform admin only where explicitly granted · anon blocked everywhere · SECURITY DEFINER functions do not bypass tenancy · storage objects tenant-isolated · **`has_permission(other_tenant_id, …)` returns false even with a valid session** (the arbitrary-tenant-ID test) · opt-out blocks send · duplicate webhook is idempotent · AI fallback on provider failure · audit row written on sensitive action · **review link issuance is independent of sentiment** (ethics).

### 4.5 Threat model coverage

| Threat                     | Control                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| Cross-tenant leakage       | RLS + `FORCE` + pgTAP + `verify_rls_coverage()`                      |
| Privilege escalation       | Permission model; `auth.uid()` in every helper                       |
| Service-role exposure      | Server-only env; never `NEXT_PUBLIC_`; secret scanning in CI         |
| Webhook forgery            | Signature verification                                               |
| Duplicate webhooks         | `billing.webhook_events` unique provider event id                    |
| Prompt injection           | Untrusted content fenced; structured outputs; approval gates on send |
| AI data leakage            | Content minimization; tenant-scoped logs; budgets                    |
| Malicious uploads          | MIME allowlist, size caps, scan-status gate before serving           |
| SMS/email abuse            | Consent required; quiet hours; suppression; rate limits              |
| Subscription manipulation  | Entitlement writes are service-role only                             |
| Audit tampering            | Append-only; no UPDATE/DELETE policy for any role                    |
| Public review manipulation | Ethics constraints in-schema (§4.6)                                  |
| Workflow replay            | Idempotency keys on step_runs                                        |

### 4.6 Reputation ethics — enforced in the database, not just policy prose

The brief makes ethical reputation management mandatory. Prose in a doc is not enforcement. Proposed **schema-level** controls:

- `reputation.review_requests` has **no** `sentiment` / `rating` / `predicted_satisfaction` column. **Review-gating is made structurally impossible: the table cannot express the discriminator.** This is the strongest available control and I recommend it over a check constraint.
- Public-response rows require `approved_by uuid not null` + `approved_at` before `posted_at` may be set — enforced by trigger, not application code.
- Feedback rows are append-only; no DELETE policy exists for any role. Negative feedback cannot be suppressed.
- Opt-out is checked in the **send path**, inside `communications`, not in the caller.

---

## 5. Proposed phase breakdown

| Phase   | Scope                                                                           | Gate                               |
| ------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| **0**   | Discovery & audit                                                               | ✅ **Complete** (this + audit doc) |
| **0.5** | 🔒 Owner decisions 1–3 + §2.3 answer                                            | **Blocking**                       |
| **0.6** | Remediation R01–R04                                                             | Decision 2                         |
| **1**   | Monorepo, TS, pnpm, lint, vitest, GH Actions, `.env.example`, docs, `supabase/` | Decision 3                         |
| **2**   | Identity, tenancy, permissions, RLS foundation, audit                           | Phase 1                            |
| **3**   | Modules, features, entitlements, billing abstraction                            | Phase 2                            |
| **4**   | AI gateway, communications, workflows, mock providers                           | Phase 3                            |
| **5**   | Reputation & recovery + ethics enforcement                                      | Phase 4                            |
| **6**   | Admin app + portal shell                                                        | Phase 2 (parallel w/ 4–5)          |
| **7**   | Salon AI reference vertical                                                     | Phases 3–6                         |
| **8**   | Hardening, RLS suite, release                                                   | All                                |

Phases 1 and 2 are the critical path. Phase 6 can run parallel to 4–5 once Phase 2 lands.

---

## 6. Actions requiring owner approval

| #   | Action                                     | Why approval is needed                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------ |
| 1   | **Decision 1** — where HL-BOS lives        | Architectural, irreversible in practice                      |
| 2   | **Decision 2** — remediate SEC-1/SEC-2     | **Destructive to existing policies; breaks unknown clients** |
| 3   | **Decision 3** — repo access route         | Blocks Phase 1                                               |
| 4   | Confirm consumers of `ltr_data` / `kpi_*`  | I cannot determine this (§2.3)                               |
| 5   | Apply **any** migration to production      | Principle 9 + operating rule 6                               |
| 6   | Install `pgtap`, `pg_cron`, `pg_net`       | Production extension change                                  |
| 7   | Enable leaked-password protection          | Auth config change                                           |
| 8   | Drop `core.reporting` from the v1 registry | Deviation from the brief (§1.6)                              |
| 9   | Ship RLS with tables rather than in `0014` | Deviation from the brief (§3.2)                              |
| 10  | Confirm `auth.users = 1` ⇒ pre-production  | May reopen Decision 1 option C                               |

---

## 7. Honest status

**Implemented: nothing. Deployed: nothing. Tested: nothing.** No code written, no migrations applied, no tests run, no production object modified. This document and the audit are proposals only.
