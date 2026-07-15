# HL-BOS Core v1 — Current State Audit

**Document:** `docs/architecture/current-state-audit.md`
**Date:** 2026-07-15
**Author:** Principal architect (AI), Herman Legacy Software Ventures
**Status:** Phase 0 — Discovery. No production changes made.

---

## 0. Executive summary

**The brief's stated premise is materially inaccurate, and this changes the plan.**

The brief describes the current infrastructure as a repository containing "an initial README and Node .gitignore" and a newly created Supabase project. The Supabase project `Herman Legacy Business Platform` in fact contains:

- **52 applied migrations**, the most recent applied **today (2026-07-15)**
- **156 application-owned tables** across **4 non-system schemas**
- **9 deployed, ACTIVE Edge Functions**
- **At least 5 distinct product codebases** already in production: HLVS Venture Studio, HSCS Government Logistics Platform, AI Asset Recovery (RecoveryWise), a Brand Resurrection Engine, and a DSP delivery/survey app
- **Two independent, incompatible multi-tenancy models** already in production

This is a **brownfield platform consolidation**, not a greenfield build. Building HL-BOS Core v1 as specified would create a _third_ tenancy model alongside the two that already exist — which directly violates the brief's own NO-DUPLICATION RULE. Resolving this requires an owner decision before Phase 1 (see §7).

Additionally, **I have no access to GitHub.** Every operating rule that routes work through the repository first is currently unexecutable. This is the primary blocker.

---

## 1. Access actually verified

| Resource                                                                    | Access                | Evidence                                                                  |
| --------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| Supabase org `Herman Supply Chain Solutions` (`wllpdyhkidqzwzaslpgp`)       | ✅ Read               | `list_organizations`                                                      |
| Supabase project `Herman Legacy Business Platform` (`bkfsjhhclbqrhaolvhmz`) | ✅ Read + DDL capable | `list_projects`, `execute_sql`                                            |
| Postgres schema, policies, functions                                        | ✅ Read               | `execute_sql` against catalogs                                            |
| Supabase advisors (security/performance)                                    | ✅ Read               | `get_advisors`                                                            |
| Edge Function **metadata**                                                  | ✅ Read               | `list_edge_functions`                                                     |
| Edge Function **source code**                                               | ❌                    | Not retrievable; not in any repo I can reach                              |
| GitHub repo `hl-bos-platform`                                               | ❌ **No access**      | No GitHub connector exists in the MCP registry; no local clone is mounted |
| Supabase ↔ GitHub link status                                               | ❌ Unverifiable       | Requires GitHub or dashboard access                                       |
| Supabase secret names                                                       | ❌ Not enumerated     | No MCP tool exposes secret names on this connector                        |
| Local filesystem / working copy                                             | ❌                    | No folder connected to this session                                       |

**Note on org naming:** The brief refers to "Herman Legacy Software Ventures," but the Supabase organization is named **Herman Supply Chain Solutions**. Only one organization and one project exist under this account. There is no separate HLVS org. Flagging in case a second account holds other resources I cannot see.

---

## 2. Database inventory

### 2.1 Schemas

| Schema     | Tables | RLS enabled | Owner product                                   |
| ---------- | -----: | ----------: | ----------------------------------------------- |
| `hlvs`     |     59 |   59 (100%) | HLVS Venture Studio + Brand Resurrection Engine |
| `hscs_glp` |     74 |   74 (100%) | HSCS Government Logistics Platform              |
| `public`   |     19 |   19 (100%) | Marketing forms, KPI data, AI Asset Recovery    |
| `dpi`      |      4 |    4 (100%) | DSP delivery / driver / survey app              |
| `storage`  |      8 |           8 | Supabase-managed                                |
| `auth`     |     23 |          16 | Supabase-managed                                |

**Application-owned total: 156 tables. RLS is enabled on 156 of 156 (100%).**

This is a genuinely good baseline. The problem is **policy quality**, not RLS coverage.

### 2.2 Extensions installed

`pgcrypto` (1.3), `uuid-ossp` (1.1), `pg_stat_statements` (1.11), `supabase_vault` (0.3.1), `vector` (0.8.0), `plpgsql`.

**Relevant gaps for Core v1:** `pgtap` (not installed — needed for in-database RLS tests), `pg_cron` (not installed — needed for workflow scheduling), `pg_net` (not installed — needed for async webhook dispatch). `supabase_vault` **is** installed, which is the correct home for AI/provider credentials per §E of the brief.

### 2.3 Migration history — 52 applied

Range: `20260617023619` → `20260715143652` (today).

Applied migration families:

| Family                              | Count | Range                 |
| ----------------------------------- | ----: | --------------------- |
| Bootstrap KPI/LTR                   |     4 | `20260617…`           |
| Business platform forms             |     1 | `20260626…`           |
| HLVS core (`hlvs_0001`–`hlvs_0008`) |     8 | `20260705…`           |
| HLVS modules (`0009`–`0015`)        |     7 | `20260705`–`20260706` |
| RecoveryWise                        |     3 | `20260707…`           |
| Brand Resurrection Engine           |    12 | `20260709…`           |
| HSCS GLP (`hscs_glp_0001`–`0016`)   |    16 | `20260713`–`20260715` |
| `0017_api_request_budget`           |     1 | `20260715143652`      |

**Finding M-1 (High) — colliding migration counters.** Two independent sequences both use bare `0009`–`0017` prefixes. `0009_business_opportunities` (HLVS) and `hscs_glp_0009_rls_hardening` sort by timestamp, not by ordinal, so the ordinal prefixes are decorative and actively misleading. `0017_api_request_budget` has no product prefix at all and its ownership is unclear from the name.

**Finding M-2 (Critical) — migration drift is unknown and unverifiable.** 52 migrations are applied to production. I cannot confirm whether their SQL exists as files in any repository. The `brand_*` family shows six sequential corrective migrations in a 10-minute window (`brand_promote_to_pipeline_option_a` → `brand_promote_drop_old_stub` → `brand_promote_fix_source_id_fk` → `brand_promote_use_existing_bootstrap` → `brand_promote_enter_at_evaluation`), which is the signature of iterative fixes applied directly against production rather than reviewed migrations. **If these were applied via ad-hoc SQL/MCP rather than from version control, production is currently the source of truth** — a direct violation of operating rule 9.

Resolving M-2 is the single highest-value action available and requires GitHub access.

### 2.4 Edge Functions — 9 deployed, all ACTIVE

| Slug                  | Version | `verify_jwt` |
| --------------------- | ------: | ------------ |
| `brand-scan`          |       9 | ✅ true      |
| `sam-sync`            |       8 | ✅ true      |
| `generate-alerts`     |       2 | ✅ true      |
| `extract-document`    |       2 | ✅ true      |
| `analyze-opportunity` |       2 | ✅ true      |
| `daily-brief`         |       2 | ✅ true      |
| `score-opportunity`   |       2 | ✅ true      |
| `fleethuddle-handoff` |       2 | ✅ true      |
| `sam-probe`           |       1 | ✅ true      |

**Positive:** `verify_jwt = true` on all 9. No unauthenticated function surface.

**Finding E-1 (Medium):** `fleethuddle-handoff` is deployed, meaning FleetHuddle already has an integration point in production despite being listed in the brief as a future application. Scope needs confirmation.

**Finding E-2 (Medium):** Source code for all 9 functions is not inspectable from this session. `analyze-opportunity`, `score-opportunity`, `brand-scan`, `extract-document` and `daily-brief` almost certainly call AI providers directly with per-function credential handling — i.e. exactly the duplication that `core.ai` is meant to eliminate. Cannot confirm without source.

---

## 3. Critical finding: two competing tenancy models already exist

This is the central architectural problem.

### 3.1 Model A — `hlvs` (single-org-per-user)

```
hlvs.organizations
hlvs.profiles (id → auth.users, org_id, role)
```

Helpers (all `SECURITY DEFINER`, all with explicit `search_path`):

| Function                   | Signature             | Body                                                     |
| -------------------------- | --------------------- | -------------------------------------------------------- |
| `hlvs.current_org_id()`    | `() → uuid`           | `select org_id from hlvs.profiles where id = auth.uid()` |
| `hlvs.current_user_role()` | `() → hlvs.user_role` | `select role from hlvs.profiles where id = auth.uid()`   |
| `hlvs.is_admin()`          | `() → boolean`        | role in (`super_admin`,`executive`)                      |
| `hlvs.can_write()`         | `() → boolean`        | role <> `viewer`                                         |

**Shape:** one org per user, hard-coded via `profiles.org_id`. **No tenant switching is possible.** Roles: `super_admin`, `executive`, `viewer`, + others.

**Verdict:** Structurally incompatible with the HL-BOS requirement for tenant switching and multi-membership. This model is a dead end and cannot be extended to meet §A of the brief.

### 3.2 Model B — `hscs_glp` (multi-org, role-per-org)

```
hscs_glp.organizations
hscs_glp.organization_users (user_id, org_id, status)
hscs_glp.user_roles (user_id, org_id, role hscs_glp.glp_role)
```

Helpers (all `SECURITY DEFINER`, all with explicit `search_path`):

| Function                          | Body summary                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `is_member(p_org)`                | `exists(… organization_users where user_id = auth.uid() and org_id = p_org and status='active')` |
| `has_role(p_org, VARIADIC roles)` | `exists(… user_roles where user_id = auth.uid() and org_id = p_org and role = any(roles))`       |
| `my_org_ids()`                    | `select org_id from organization_users where user_id = auth.uid() and status='active'`           |
| `my_roles(p_org)`                 | array_agg of roles for `auth.uid()` in org                                                       |
| `is_internal(p_org)`              | member AND NOT `carrier_user`                                                                    |
| `can_read(p_org)`                 | `is_member(p_org)`                                                                               |
| `can_write(p_org)`                | `is_internal(p_org)` AND `has_role(p_org, …8 internal roles)`                                    |

Roles (`hscs_glp.glp_role`): `owner_ceo`, `contract_admin`, `opportunity_analyst`, `proposal_manager`, `operations_manager`, `compliance_manager`, `finance_manager`, `carrier_manager`, `carrier_user`.

**Verified safe — correcting a likely assumption.** The brief warns that security-definer functions must "never accept an arbitrary tenant ID as proof of access." I read every function body specifically to test this. **These functions are correct.** `p_org` is used only as a _filter_ alongside a mandatory `user_id = auth.uid()` predicate — it is never accepted as proof. Every function has an explicit `search_path`. The Supabase advisor flags these as "anon can execute SECURITY DEFINER," but for `anon`, `auth.uid()` is NULL, so they return `false`/empty. **This is a correctly-built, multi-tenant authorization core and it is the strongest existing asset in the project.**

**This is the model HL-BOS should generalize from, not replace.**

### 3.3 Consequence for the no-duplication rule

Building `platform.tenants` / `identity.memberships` as a greenfield third model, while `hlvs.organizations` and `hscs_glp.organizations` both hold production data, produces three tenancy systems. The brief forbids this. **§7 Decision 1 must be resolved before any Phase 2 work.**

### 3.4 Capabilities already duplicated per-vertical

Each of these already exists inside a vertical schema and is a direct target for extraction into a `core.*` module:

| HL-BOS module         | Existing duplicate implementations                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `core.audit`          | `hscs_glp.audit_events`                                                                                                              |
| `core.notifications`  | `hscs_glp.notifications`, `hlvs.alerts`, `hlvs.alert_rules`                                                                          |
| `core.ai`             | `hscs_glp.ai_action_logs`, `hlvs.research_runs`, `hlvs.innovation_research_jobs`, `0017_api_request_budget`                          |
| `core.storage`        | `hscs_glp.*_documents` (4 tables), `hlvs.documents`, `hlvs.attachments`                                                              |
| `core.reputation`     | `hscs_glp.recovery_cases`, `hscs_glp.customer_feedback`, `hscs_glp.corrective_actions`, `public.recovery_*`                          |
| `core.communications` | `hscs_glp.outreach_drafts`, `public.recovery_outreach`                                                                               |
| `core.workflows`      | `hscs_glp.bid_approvals`, `hscs_glp.bid_tasks`, `hlvs.implementation_queue`, `hlvs.decisions`                                        |
| `core.entitlements`   | **None. Genuinely greenfield.**                                                                                                      |
| `core.billing`        | **None. Genuinely greenfield.** (`hscs_glp.invoices` / `carrier_payables` are domain AR/AP, not platform billing — do not conflate.) |

**Note the naming collision hazard:** `hscs_glp.recovery_cases` (government service recovery) and `public.recovery_*` (AI Asset Recovery — asset repossession) are **entirely different domains sharing a prefix.** `core.reputation` recovery cases would be a third meaning of "recovery." This must be resolved in naming before Phase 5.

---

## 4. Security findings

Source: Supabase security advisors (**32 warnings, 0 errors**) + my own catalog inspection. Severity ratings are mine, not Supabase's — the advisor rates everything WARN.

### 4.1 🔴 SEC-1 (Critical) — Anonymous read/write on live business data

| Table                   |      Rows | Policy                                           |
| ----------------------- | --------: | ------------------------------------------------ |
| `public.ltr_data`       | **1,144** | `FOR ALL USING(true) WITH CHECK(true)` to PUBLIC |
| `public.kpi_spe_weekly` | **1,050** | `FOR ALL USING(true) WITH CHECK(true)` to PUBLIC |
| `public.kpi_sp_weekly`  |   **287** | `FOR ALL USING(true) WITH CHECK(true)` to PUBLIC |

Granted to `PUBLIC`, which **includes the `anon` role**. Anyone holding the publishable key — which is by definition shipped to browsers — can **read, modify, and delete all 2,481 rows.** These tables are exposed via PostgREST at `/rest/v1/ltr_data` etc.

This is the highest-severity live finding: real data, unauthenticated write, remotely reachable today. Introduced in migration `20260617023634_enable_rls_and_indexes` — RLS was switched on and then immediately neutralized with a permissive policy.

**Recommend remediation before Phase 1, ahead of all Core v1 work.**

### 4.2 🔴 SEC-2 (Critical, latent) — Cross-tenant access on AI Asset Recovery

`public.recovery_clients`, `recovery_assets`, `recovery_claims`, `recovery_documents`, `recovery_matches`, `recovery_outreach` each carry:

```sql
FOR ALL TO authenticated USING (true) WITH CHECK (true)
```

**Any authenticated user of any Herman Legacy product** — an HSCS carrier_user, a future Salon AI staff member — can read and write **every** asset-recovery client, claim and document.

Mitigating: **all six tables currently have 0 rows.** No data is exposed today.
Aggravating: this is the exact anti-pattern the brief prohibits ("Do not use overly broad policies such as unconditional authenticated access"), it sits in `public` rather than an owned schema, and it will hold sensitive financial/legal records the moment it is used.

**Recommend remediation before any data lands. Zero rows means zero-cost fix now, and an expensive one later.**

### 4.3 🟠 SEC-3 (High) — Trigger functions exposed as public RPC

`hscs_glp.enforce_los_legal_review()` and `hscs_glp.sync_bid_los_flags()` are `SECURITY DEFINER` **trigger** functions that are `EXECUTE`-able by `anon` and `authenticated` via `/rest/v1/rpc/…`. Trigger functions should never be directly callable. `enforce_los_legal_review` enforces a **legal review gate on government bids** — precisely a control that must not be invocable out of band.

Fix: `REVOKE EXECUTE … FROM anon, authenticated, PUBLIC`. Low risk, no behavior change.

### 4.4 🟡 SEC-4 (Medium) — Unauthenticated INSERT on intake tables

`dpi.deliveries`, `dpi.drivers`, `dpi.dsp_companies`, `dpi.surveys`, `public.contact_submissions`, `public.assessment_results` allow anon `INSERT … WITH CHECK(true)`.

For public web forms this is a **defensible design** and I am not calling it a defect. But it is an unrated, uncaptcha'd, unthrottled write surface. `dpi.drivers` and `dpi.dsp_companies` accepting anonymous inserts is harder to justify than a contact form. Recommend rate limiting + validation constraints, tracked as hardening, not blocking.

### 4.5 🟡 SEC-5 (Medium) — Mutable search_path

`hlvs.brand_compute_overall_score` has no explicit `search_path`. It is the **only** function in the project with this defect — every other SECURITY DEFINER function correctly pins its path. One-line fix.

### 4.6 🟡 SEC-6 (Medium) — Leaked password protection disabled

Supabase Auth is not checking passwords against HaveIBeenPwned. Dashboard toggle, no code change.

### 4.7 🟡 SEC-7 (Medium) — Unreviewed service_role grant

Migration `20260715050050_hscs_glp_0016_grant_service_role` was applied yesterday and grants privileges to `service_role`. I cannot review its SQL without repo access. Given the brief's emphasis that service-role access must never reach browser clients, **this migration needs an explicit read.**

### 4.8 ⚪ Advisor noise (no action)

The 10 advisor warnings for `hlvs.can_write/current_org_id/current_user_role/is_admin` and `hscs_glp.can_read/can_write/has_role/is_member/my_org_ids/my_roles/is_internal` being anon-executable are **not real vulnerabilities.** All return `false`/empty when `auth.uid()` is NULL. Documenting so they are not "fixed" pointlessly — though moving them out of API-exposed schemas in Core v1 would silence the advisor legitimately.

### 4.9 Security scorecard

| Control                                        | State                           |
| ---------------------------------------------- | ------------------------------- |
| RLS enabled on app tables                      | ✅ 156/156                      |
| Explicit `search_path` on SECURITY DEFINER fns | ✅ 15/16                        |
| Tenant helpers reject arbitrary tenant IDs     | ✅ Verified correct             |
| Edge Functions require JWT                     | ✅ 9/9                          |
| Vault available for secrets                    | ✅ Installed                    |
| **No unconditional-access policies**           | ❌ **15 tables**                |
| **No anon write to real data**                 | ❌ **3 tables, 2,481 rows**     |
| Leaked password protection                     | ❌ Disabled                     |
| Migrations verified in version control         | ❌ Unverifiable                 |
| Automated RLS / isolation tests                | ❌ None (`pgtap` not installed) |

---

## 5. Risk assessment

| ID   | Risk                                         | Sev      | Likelihood                 | Notes                               |
| ---- | -------------------------------------------- | -------- | -------------------------- | ----------------------------------- |
| R-1  | Anon read/write of 2,481 rows (SEC-1)        | Critical | **Active now**             | Exploitable today with a public key |
| R-2  | Cross-tenant recovery data (SEC-2)           | Critical | On first write             | Zero-cost to fix now                |
| R-3  | Production is source of truth, not git (M-2) | Critical | Likely                     | Blocks all controlled deployment    |
| R-4  | Third tenancy model created by Core v1       | High     | **Certain if unaddressed** | Violates the brief's own rule       |
| R-5  | No GitHub access                             | High     | Active                     | Blocks operating rules 7–10         |
| R-6  | Legal-review gate callable as RPC (SEC-3)    | High     | Low                        | Government bid integrity            |
| R-7  | Edge Functions hold per-function AI creds    | Med      | Likely                     | Unverifiable without source         |
| R-8  | Migration ordinal collisions (M-1)           | Med      | Active                     | Replay/rebuild hazard               |
| R-9  | `recovery` name means 3 different things     | Med      | Certain                    | Design-time fix only                |
| R-10 | Unthrottled anon intake (SEC-4)              | Med      | Moderate                   | Spam/cost                           |

---

## 6. Assumptions and limitations

**Explicitly assumed, not verified:**

1. The GitHub repo `hl-bos-platform` exists and is near-empty as described. **Unverified.** It is equally possible it contains the source for the 52 applied migrations and 9 Edge Functions.
2. Salon AI, Landscape AI, Plumber AI, Restaurant AI, Mechanic AI, Moving AI have not been started. No trace in the database.
3. `Herman Supply Chain Solutions` is the only relevant Supabase org. Only one is visible to this token.
4. `hlvs`, `hscs_glp`, `dpi` and `public.recovery_*` are all **live systems with real users** and must not be broken. Row counts suggest `hlvs`/`hscs_glp` are pre-launch (seed data), but I have not verified user counts. `auth.users` contains **1 user** — suggesting all four products are pre-production. **This materially lowers migration risk and should be confirmed.**

**Cannot be determined from this session:** repo contents, migration drift, Edge Function source, secret names, Supabase↔GitHub link, CI existence, deployed frontends.

---

## 7. Decisions required from the owner

### 🔒 Decision 1 — Where does HL-BOS live? _(blocks Phase 2)_

| Option                                      | Description                                                                                                                                                                                                   | Pros                                                                                              | Cons                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **A. New Supabase project**                 | Greenfield HL-BOS; existing project stays legacy                                                                                                                                                              | Clean; zero risk to live systems                                                                  | Two prod DBs; migration debt deferred, not removed; verticals stay duplicated |
| **B. Additive strangler-fig (recommended)** | Add `platform`/`identity`/etc. to the **same** project. Generalize `hscs_glp`'s proven model into core. Existing verticals keep working untouched; migrate onto core one at a time behind compatibility views | Never destructive; one DB; reuses the verified-correct auth core; honors no-duplication over time | Temporarily 2 tenancy models coexist (documented + time-boxed)                |
| **C. In-place refactor**                    | Rewrite `hlvs`/`hscs_glp` onto core now                                                                                                                                                                       | Most architecturally pure                                                                         | Highest risk; touches 133 live tables                                         |

**My recommendation: B.** It is the only option that is simultaneously non-destructive (principle 9), non-duplicative (principle 4), and reuses rather than discards the one component already verified correct. If §6 assumption 4 holds and there is genuinely only 1 user, **C becomes viable** and would be worth reconsidering — a rewrite is far cheaper with no production users.

### 🔒 Decision 2 — Remediate SEC-1 and SEC-2 before Phase 1? _(recommend yes)_

These are pre-existing defects, not Core v1 scope. But SEC-1 is live and remotely exploitable, and SEC-2 is free to fix today and expensive later. Building a "secure by default" platform on top of an active anon-write hole is not defensible.

Proposed, **pending approval** (all additive/restrictive, no data touched, each reversible):

1. Drop `Allow all on ltr_data|kpi_sp_weekly|kpi_spe_weekly`; replace with authenticated-read + service-role-write.
2. Replace the 6 `public.recovery_*` `USING(true)` policies with tenant-scoped policies.
3. `REVOKE EXECUTE` on the 2 trigger functions (SEC-3).
4. `SET search_path` on `hlvs.brand_compute_overall_score` (SEC-5).
5. Enable leaked-password protection (SEC-6, dashboard).

⚠️ **Impact note:** items 1–2 **will break any client currently relying on anonymous access** to those tables. I cannot see the frontends. This needs owner confirmation of what reads `ltr_data`/`kpi_*` before I proceed — that is exactly the impact report principle 9 requires.

### 🔒 Decision 3 — Resolve the GitHub blocker _(blocks Phase 1)_

Choose one:

- **(a)** Connect a GitHub MCP connector — _not currently in the registry; may not be available_
- **(b)** Clone `hl-bos-platform` locally and grant folder access — **recommended, known to work**
- **(c)** I scaffold Core v1 into this session's output folder; you commit it manually

**Recommendation: (b).** It satisfies operating rules 7–10 properly and lets me resolve M-2 (migration drift), the highest-value open question.

---

## 8. Statement of work performed

**Executed:** read-only catalog queries; `list_organizations`, `list_projects`, `list_tables`, `list_migrations`, `list_extensions`, `list_edge_functions`, `get_advisors(security)`; 3 read-only `execute_sql` catalog queries; MCP registry search for a GitHub connector.

**Not executed:** no DDL, no DML, no migrations, no Edge Function deploys, no repository writes, no configuration changes. **Nothing in production was modified.**

**Not claimed:** no tests were written or run. No code was built. Nothing was deployed.

---

## 9. Recommended next actions

| #   | Action                                                                           | Requires      |
| --- | -------------------------------------------------------------------------------- | ------------- |
| 1   | Owner resolves Decisions 1–3                                                     | Owner         |
| 2   | Confirm what clients read `ltr_data` / `kpi_*`                                   | Owner         |
| 3   | Remediate SEC-1/SEC-2/SEC-3/SEC-5/SEC-6                                          | Approval (D2) |
| 4   | Grant repo access; reconcile 52 applied migrations against version control (M-2) | Owner (D3)    |
| 5   | Review `hscs_glp_0016_grant_service_role` (SEC-7)                                | Repo access   |
| 6   | Confirm `auth.users` = 1 ⇒ pre-production ⇒ reconsider Decision 1 option C       | Owner         |
| 7   | **Then** begin Phase 1                                                           | D1 + D3       |

**Phase 1 has not been started.** It requires a repository target (Decision 3). Beginning it in a scratch folder would produce work that cannot be committed, reviewed, or CI-validated — which contradicts the brief's own operating rules.
