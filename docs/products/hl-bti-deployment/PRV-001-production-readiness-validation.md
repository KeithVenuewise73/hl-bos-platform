# PRV-001 — HL-BTI Production Readiness Validation

**Scope:** every change introduced for the HL-BTI deployment — `apps/hl-bti`, migration `0027`, the `public.bti_*` API, persistence, authentication, tenant handling, permissions, and the Coolify/Docker/env deployment configuration — plus the full set of pending migrations `0018`–`0027` that a production apply would carry.
**Nature:** validation only. No code, migrations, or features were changed to produce this report.
**Assumption honored:** every production migration is treated as permanent until proven reversible.

---

## 0 · Verdict at a glance

**Would I approve deploying this into the production HL-BOS platform today? → NO — not yet.**

Not because the work is unsafe or unfinished. The engineering is production-quality: **627/627 database tests pass**, every change is additive and backward-compatible with the applied baseline (one operational caveat), the security model is sound and tested, and the app reuses HL-BOS identity/tenancy correctly. The **NO is about verification and scope, and both gaps are small and closable:**

1. **The live seam has never been exercised.** I proved the database layer against real PostgreSQL and the UI against a mocked Supabase — but the deployed app talking to **real Supabase Auth + PostgREST + the public API** has not been run end-to-end even once. Production go-live should not be the first time.
2. **Promoting `0027` promotes 8 other subsystems.** Production holds `0001`–`0017`; a `supabase db push` applies **all** pending migrations `0018`–`0027` (storage, comms, discovery, blueprint, commerce, provisioning, HLVS factory, BTI). That blast radius must be consciously accepted and validated on a preview branch first.
3. **One migration locks a live table.** `0021` rewrites `events.deliveries` under an exclusive lock during apply.

The path from NO to YES is short and is spelled out in §10–§11.

---

## 1 · Test evidence

Fresh PostgreSQL, shim (Supabase roles + `auth` + `auth.uid()`), **all 27 migrations applied in order**, then the entire pgTAP suite:

```
01_tenant_isolation 12 · 02_audit_and_access 17 · 03_provisioning 9 · 04_invitations 13
05_bootstrap_and_coverage 14 · 06_atomicity 3 · 07_privilege_escalation 8 · 08_tenant_class 10
10_events 9 · 11_entitlements 7 · 12_integrations 7 · 13_ai_gateway 6 · 14_workflows_gate 7
15_visibility_core 10 · 16_billing_core 9 · 17_billing_subscriptions 14 · 18_visibility_assessments 11
19_ai_runtime_smoke 24 · 20_storage 20 · 21_communications 31 · 22_discovery 34 · 23_events_handlers 13
24_website_scan 27 · 25_blueprint_engine 65 · 26_commerce_provisioning 90 · 27_hlvs_factory 90
28_bti_platform 47 · 29_bti_public_api 20
TOTAL: 627 ok, 0 failed — ALL GREEN
```

Adding the HL-BTI layer (`0026`, `0027` + test `29`) does **not** regress any earlier subsystem. Test `29` specifically asserts: anon cannot call the API, an owner resolves exactly their tenant, intake fields persist verbatim, an analysis saves and reloads, a read-only viewer cannot save, and a cross-tenant caller is denied.

**Caveat on the harness:** these ran on embedded PostgreSQL 16 with a Supabase shim, not the production PostgreSQL 17 stack via `supabase test db`. It is a close proxy and the identical SQL; it is not the governed CI path, which has not run these because the production environment is unarmed.

---

## 2 · Database impact analysis — migrations 0018–0027

Legend: **Δexisting** = touches an object from an earlier migration. **Risk** is production-apply risk.

| #                              | Purpose                                          | New schema              | Tables +                 | Cols + (existing)                                         | Fns + (all SEC DEFINER unless noted)         | Triggers + | Policies + (all FORCE RLS) | Perms added                            | Δ 0001–0017?                  | Rollback          | Risk       |
| ------------------------------ | ------------------------------------------------ | ----------------------- | ------------------------ | --------------------------------------------------------- | -------------------------------------------- | ---------- | -------------------------- | -------------------------------------- | ----------------------------- | ----------------- | ---------- |
| **0018** storage_meta          | Tenant-aware metadata over Supabase Storage      | `storage_meta`          | 1 (`files`)              | —                                                         | 6 (5 definer)                                | 2          | 1                          | `storage.file.*` (4)                   | No                            | Yes               | **LOW**    |
| **0019** communications        | Reusable email/SMS platform                      | `comms`                 | 7                        | —                                                         | 7                                            | 5          | 7                          | `comms.*` (5)                          | No                            | Yes               | **LOW**    |
| **0020** discovery             | Business Discovery Engine                        | `discovery`             | 10                       | —                                                         | 12                                           | 7          | 10                         | `discovery.*` (8)                      | No                            | Yes               | **LOW**    |
| **0021** events_handlers       | At-least-once handler dispatch                   | — (extends `events`)    | 1 (`handlers`)           | **4 on `events.deliveries` (0009)**                       | 3 (service_role only)                        | 0          | 1                          | none (reuses)                          | **YES — `events.deliveries`** | Yes               | **MEDIUM** |
| **0022** website_assessment    | Website-scan lifecycle                           | — (extends `discovery`) | 1 (`website_scans`)      | — (data seeds only)                                       | 6                                            | 2          | 1                          | none (reuses)                          | No (0020/0009 data seeds)     | Yes               | **LOW**    |
| **0023** blueprint_engine      | Blueprint generation/governance over 0020        | — (extends `discovery`) | 8                        | +11 on `blueprints`, +24 on `recommendations` (both 0020) | 23                                           | 10         | 8                          | `discovery.blueprint.*`, `catalog` (4) | No (0020 additive)            | Yes (destructive) | **LOW**    |
| **0024** commerce_provisioning | Proposal→provisioning handoff (stops at `ready`) | `sales`, `provisioning` | 14                       | —                                                         | 30                                           | 15         | 14                         | `sales.*`, `provisioning.*` (8)        | No                            | Yes (destructive) | **LOW**    |
| **0025** hlvs_factory          | Governed software-factory loop (inert package)   | `hlvs`                  | 19                       | —                                                         | ~34                                          | 29         | 19                         | `hlvs.*` (8, platform)                 | No                            | Yes (destructive) | **LOW**    |
| **0026** bti_platform          | HL-BTI orchestration (bti schema)                | `bti`                   | 13                       | —                                                         | 18 (authenticated-only, **not** in `public`) | 11         | 13                         | `bti.*` (12)                           | No                            | Yes               | **LOW**    |
| **0027** bti_intake_public_api | Intake fields + browser-reachable API            | — (extends `bti`)       | 1 (`analysis_snapshots`) | +6 on `bti.businesses` (0026)                             | 5 (**in `public`**, authenticated-only)      | 0          | 1                          | none (reuses `bti.*`)                  | No (0026 additive)            | Yes               | **LOW**    |

### Backward compatibility — the key question

**Only one migration modifies an object already in production (`0001`–`0017`):**

- **`0021` → `events.deliveries`** (created in `0009`). Adds 4 columns `IF NOT EXISTS` + 1 partial index. Purely additive — no column/type/constraint dropped, RLS unchanged, existing `events` code keeps working. **Operational caveat:** two of the columns are `NOT NULL` with volatile defaults (`next_attempt_at default now()`, `correlation_id default gen_random_uuid()`), which forces a **full table rewrite under `ACCESS EXCLUSIVE` lock** to backfill existing rows. Trivial if the table is small; a lock/latency event if it already holds many delivery rows in production.

Everything else against pre-existing schemas is **additive `ADD COLUMN IF NOT EXISTS`** (0023 on 0020's tables) or **idempotent data seeds** (`identity.permissions`/`role_permissions`, `events.subscriptions`/`handlers`, `discovery.collectors` — all `on conflict do nothing`). **No migration drops or destructively alters any table, column, function, view, policy, type, or constraint from `0001`–`0017`.** `0026` and `0027` are fully additive isolated-schema changes.

**Reversibility:** every migration carries a `-- rollback:` block. `0023`–`0025` mark theirs "destructive; requires approval" (they DROP schemas/columns). Forward-only apply is the intended path; rollback exists but loses the new schema's data.

---

## 3 · HL-BOS impact analysis — existing capabilities

| Capability                                               | Status                           | Why                                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity** (`auth.users`, `identity.profiles`)         | **Unaffected**                   | Reused as-is; no new user store, no schema change.                                                                                                       |
| **Tenancy** (`platform.tenants`, `identity.memberships`) | **Unaffected**                   | Reused for workspace resolution; no change.                                                                                                              |
| **Permissions** (`identity.has_permission`, roles)       | **Extended (additive)**          | `0026` seeds `bti.*` permissions and maps them to existing roles; `0027` adds no new permission (reuses `bti.*`). No role/permission removed or altered. |
| **Audit** (`audit.emit`, immutability)                   | **Extended (additive)**          | New tables get standard audit triggers; `0023` newly audits two 0020 tables. No audit behavior removed.                                                  |
| **Events bus** (`events.*`)                              | **Extended — one schema change** | `0021` adds columns to `events.deliveries` (see §2 caveat). Backward-compatible; the one live-object change in the whole set.                            |
| **Business records** (`bti.businesses`)                  | **Extended**                     | `0027` adds intake columns; additive.                                                                                                                    |
| **Discovery Engine** (`discovery.*`)                     | **Extended (additive)**          | `0022`/`0023` add tables/columns; 0020 RPCs unchanged.                                                                                                   |
| **Blueprint Generator** (`discovery` blueprint fns)      | **Extended (additive)**          | New generation/governance functions; existing unchanged.                                                                                                 |
| **Proposal / Commerce** (`sales.*`, `provisioning.*`)    | **New (additive)**               | New isolated schemas; inert (no live billing/provisioning).                                                                                              |
| **VisibilityAI / AI Gateway** (`visibility.*`, `ai.*`)   | **Unaffected**                   | Referenced by FK only; not modified. The HL-BTI app does not call the AI gateway (deterministic engine).                                                 |
| **HLVS Factory** (`hlvs.*`)                              | **New (additive)**               | Isolated platform-internal schema; inert.                                                                                                                |
| **CRM**                                                  | **Unaffected**                   | Not touched.                                                                                                                                             |

**Nothing is "Modified (breaking)" or "Potentially Breaking."** Every affected capability is Unaffected or Extended additively — with the single operational caveat on the `events.deliveries` rewrite.

### Architectural-consistency finding (not a security defect — flagged for the record)

The deployed app persists a completed analysis via `bti_save_analysis` into the new `bti.analysis_snapshots` store. That path does **not** go through `0026`'s human-review approval gate (`bti.submit_assessment_for_review` → `workflows.request_approval('tenant_admin')` → `bti.complete_assessment`, which refuses to complete without an approved review). In other words, the product as shipped saves findings/blueprint/proposal as a **snapshot artifact** rather than as a governed `bti.assessment` that a `tenant_admin` must approve. For a single-operator MVP this is a reasonable, honest choice — but it means the "human review before completion" control that `0026` enforces for assessments is not exercised by the app. If HL-BTI later needs that governance, the snapshot path should be reconciled with the assessment/review workflow.

---

## 4 · Security validation — SECURITY DEFINER functions

The HL-BTI change adds **5** `SECURITY DEFINER` functions (all in `0027`, all in `public`). The broader pending set adds many more, all following the same house pattern; the five new **public** ones are the only new internet-reachable surface and receive the closest review.

**Why `SECURITY DEFINER` is required:** the `bti.*` tables use `FORCE ROW LEVEL SECURITY` with **no tenant write policy** — the deliberate 0026 design is "read by permission; write only through definer RPCs." A caller's own role cannot insert; the function must run as the owner to write, then gate the write itself. This mirrors every 0026 write RPC.

For each of the 5 public functions:

| Property                            | How it is enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authorization**                   | Every function calls `identity.has_permission(tenant, '…')` **before** touching data and raises `insufficient_privilege` (42501) otherwise. Reads check `bti.business.read` / `bti.assessment.read`; writes check `bti.business.manage` / `bti.assessment.manage`. `bti_register_business` delegates the write to `bti.register_business`, which checks `bti.business.manage` before inserting.                                                                        |
| **Tenant isolation**                | The tenant is never trusted from the caller as proof. `bti_my_tenants`/`bti_list_businesses` filter by `identity.my_tenant_ids()` + `has_permission`. `bti_save_analysis`/`bti_latest_analysis` **resolve the tenant from the business row** (`select tenant_id from bti.businesses where id = p_business`) and then check permission on that tenant — so passing another tenant's business id fails the check (no IDOR). Verified by test `29`'s cross-tenant denial. |
| **Privilege escalation prevention** | Functions never `SET ROLE`, never grant, never accept a role/permission argument. `search_path = ''` with fully schema-qualified identifiers prevents search-path hijacking. `auth.uid()` is read from the JWT, not supplied.                                                                                                                                                                                                                                          |
| **Cross-tenant data exposure**      | Not possible: every return path is gated by `has_permission` for the specific tenant; a member of tenant A cannot read/write tenant B. Proven by tests (anon denied, viewer cannot save, cross-tenant denied).                                                                                                                                                                                                                                                         |
| **RLS still effective**             | The definer owner (`postgres`, `BYPASSRLS` in production) bypasses RLS **inside** these functions — so the `has_permission` check is the single load-bearing control, exactly as for all 0026 RPCs. Defense-in-depth remains: the tables keep `FORCE` RLS + `SELECT` policies for any non-definer path, and `anon` is stripped from every function.                                                                                                                    |
| **`anon` lockout**                  | Every function does `revoke all … from public, anon; grant execute … to authenticated`. Test `29` asserts anon → 42501.                                                                                                                                                                                                                                                                                                                                                |

**Assessment:** the definer usage is correct and is the documented safe pattern (the "SEC-3" risk — a definer function in an API-exposed schema that skips authz — does **not** apply here because authorization precedes every data access). The authorization checks are security-critical single points and are covered by tests.

---

## 5 · Public API validation — `public.bti_*`

| Function                                                                                                    | Purpose                                          | Input validation                                                                                                                                                                                   | Authorization                                           | Output        | Failure handling                                | Potential abuse                                                 | Rate-limit recommendation                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `bti_my_tenants()`                                                                                          | List the caller's HL-BTI workspaces              | none needed (no args)                                                                                                                                                                              | membership + `bti.business.read`                        | jsonb array   | returns `[]` when none                          | none (read of own memberships)                                  | not needed                                                   |
| `bti_register_business(tenant,name,website,industry,pack,location,contact,email,phone,goals,analysis_only)` | Create a business + intake fields                | `name` required (else `check_violation`); key auto-derived to satisfy `^[a-z][a-z0-9_]{2,63}$`; other fields `nullif(btrim())`. **No format validation** on email/website/phone (stored as given). | `bti.business.manage` (inside `bti.register_business`)  | uuid          | raises before any write on missing permission   | authorized tenant member could bulk-create businesses (storage) | **Recommend** basic per-user rate limit before external use  |
| `bti_save_analysis(business,score,payload)`                                                                 | Persist a full analysis snapshot                 | `score` constrained 0–100 by table check; **`payload jsonb` is unbounded**                                                                                                                         | `bti.assessment.manage` (tenant resolved from business) | uuid          | raises on unknown business / missing permission | unbounded `payload` → storage bloat by an authorized member     | **Recommend** a payload size cap (e.g. ≤256 KB) + rate limit |
| `bti_list_businesses(tenant)`                                                                               | List tenant businesses + latest-analysis summary | tenant arg checked, not trusted                                                                                                                                                                    | `bti.business.read`                                     | jsonb array   | raises on missing permission                    | none beyond own tenant                                          | not needed                                                   |
| `bti_latest_analysis(business)`                                                                             | Fetch latest saved analysis payload              | —                                                                                                                                                                                                  | `bti.assessment.read` (tenant from business)            | jsonb or null | raises on unknown business / missing permission | none beyond own tenant                                          | not needed                                                   |

**Overall:** inputs are parameterized (no injection surface), authorization is uniform and tested, failure modes are explicit SQL error codes surfaced to the client as readable messages. The two hardening items — **payload size cap** and **basic rate limiting** on the write functions — are **recommendations, not blockers**: abuse is limited to already-authenticated tenant members (insiders), and PostgREST provides no built-in rate limiting, so this belongs at the edge/gateway if HL-BTI later serves untrusted or multi-tenant traffic.

---

## 6 · Authentication, tenant handling, permissions (app side)

- **Authentication:** Supabase Auth only (`signInWithPassword`, `getSession`, `onAuthStateChange`, `signOut`). No custom auth, no password handling in app code, session persisted by supabase-js. Accounts are invitation-granted (no self-serve sign-up).
- **Tenant handling:** resolved server-side via `bti_my_tenants()`; the app passes the chosen `tenant_id` into each call, and the database re-derives authority from `identity.memberships` every time — the tenant argument is a filter, never proof.
- **Permissions:** enforced entirely in the database (`identity.has_permission`); the UI's "Access pending" state is cosmetic — a user with no BTI membership simply gets empty/denied results.
- **Surface:** the app makes **exactly five RPC calls plus four auth calls** (verified by grep). No `.from()` (direct table access), no `.schema()`, **no service-role key**, no direct `fetch` to any host. The service key never enters the browser bundle.

---

## 7 · Production deployment validation

| Item                         | Finding                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dockerfile**               | Multi-stage: `node:22-bookworm-slim` builds (`pnpm install --frozen-lockfile` → `pnpm --filter @hl-bos/hl-bti build`), `nginx:1.27-alpine` serves the static `out/`. Final image has **no Node runtime** — minimal attack surface. Build context is the repo root (correct for the pnpm workspace). |
| **Coolify config**           | Build Pack = Dockerfile; Dockerfile `apps/hl-bti/Dockerfile`; context `/`; port 80; two `NEXT_PUBLIC_*` build variables; domain `bti.hermanlegacygroup.com`. Documented exactly in `apps/hl-bti/DEPLOYMENT.md`.                                                                                     |
| **Nginx**                    | SPA fallback (`try_files … /index.html`), immutable long-cache for hashed `_next/static`, `no-cache` on `index.html`, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), gzip. Sound.                                                                               |
| **Static build**             | Verified: `next build` (static export) compiles, typechecks under the strict config, emits `out/index.html`.                                                                                                                                                                                        |
| **Environment variables**    | Two, build-time only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both browser-safe by the platform `ENV_SPEC`. No runtime env.                                                                                                                                             |
| **Secrets**                  | None in the image beyond the publishable (anon) key, which is public by design and gated by RLS. Service-role key absent. `check-no-public-secrets` passes.                                                                                                                                         |
| **Startup command**          | None — nginx base-image CMD runs in the foreground.                                                                                                                                                                                                                                                 |
| **Health check**             | `GET /` → 200 `index.html`.                                                                                                                                                                                                                                                                         |
| **Resource requirements**    | Minimal: static nginx, ~64–128 MB RAM, negligible CPU; trivially scalable.                                                                                                                                                                                                                          |
| **Expected deployment time** | First build a few minutes (workspace install + `next build`); redeploys faster with layer cache.                                                                                                                                                                                                    |
| **Rollback**                 | App is **stateless** (all data in Supabase) → Coolify redeploy of the previous image is a clean rollback. DB rollback via the `0027` block drops only the new functions/table/columns (loses saved snapshots; earlier data untouched).                                                              |

**Deployment blockers:** none in the configuration itself. The Docker image cannot be built in this validation sandbox (no Docker), so the **image build + container run has not been executed** — it is the same unverified live seam noted in §0.

---

## 8 · CEO deployment checklist (only actions that literally require the CEO)

Engineering steps are omitted deliberately. Each row is an action only the CEO's account access can perform.

| #   | System       | Screen                                            | Button / Field                                                                                                                                           | Value                                                   | Reason                                                                                                 | Expected result                                                              |
| --- | ------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | GitHub       | Repo → Settings → Environments                    | Create environment **`production`**; add yourself as required reviewer                                                                                   | name `production`                                       | Arms the governed migration/deploy path (currently inert)                                              | The protected `db-migrate`/`deploy` workflows can run behind your approval   |
| 2   | GitHub       | Repo → Settings → Secrets and variables → Actions | Add **secret** `SUPABASE_ACCESS_TOKEN`; add **variable** `SUPABASE_PROJECT_REF`                                                                          | token from Supabase account; ref `mvvtngiopdrgiedjmhfb` | Lets the governed workflow authenticate to the project                                                 | Workflows stop refusing "ref not set"                                        |
| 3   | Supabase     | (your approval to the engineer)                   | Approve applying migrations **0018–0027**                                                                                                                | "approved"                                              | No migration is applied without explicit approval; this is a 10-migration, 8-subsystem first promotion | Engineer applies via the governed path on **preview first**, then production |
| 4   | Supabase     | Dashboard → Authentication → Users                | **Add user → Send invitation** (not Auto-Confirm)                                                                                                        | `ceo@hermanlegacygroup.com`                             | Creates your account, proving mailbox control                                                          | You appear in `auth.users`, email confirmed                                  |
| 5   | Supabase     | Dashboard → SQL Editor                            | Run `bootstrap_first_platform_owner('ceo@…')` then `provision_tenant('herman-legacy','Herman Legacy')`                                                   | the two statements                                      | Grants you `platform_owner` + a workspace with `bti.business.manage`                                   | `bti_my_tenants()` returns your workspace                                    |
| 6   | Coolify      | New → Application                                 | Repo + branch; Dockerfile `apps/hl-bti/Dockerfile`; context `/`; port 80; two `NEXT_PUBLIC_*` build vars; domain `bti.hermanlegacygroup.com`; **Deploy** | build-var values from `DEPLOYMENT.md`                   | Only your Coolify account can grant repo access + build vars                                           | App builds and serves on the Coolify URL                                     |
| 7   | DNS provider | `hermanlegacygroup.com` → Records                 | Add **A** record                                                                                                                                         | Name `bti`, value = Coolify server IP, TTL 300          | Only you control the domain                                                                            | `https://bti.hermanlegacygroup.com` resolves; Coolify issues TLS             |

---

## 9 · The one verification that closes the gap

Before production, run the DoD loop **once** against a non-production target (Supabase **preview branch** + a staging Coolify build): sign in → create a business → run an analysis → save → sign out → sign back in → retrieve. This exercises the single unproven seam (app ↔ real Supabase Auth + PostgREST + `public.bti_*`). The database round-trip behind it is already proven by tests; this confirms the wiring in the real stack.

---

## 10 · Final recommendation

**1. Would you approve deploying this into the production HL-BOS platform today?**
**NO.**

**2. Blockers (why NO):**

- **B1 — No live end-to-end verification.** The deployed app against real Supabase Auth + PostgREST + the public API has not been run once. (Closes with the §9 preview smoke test.)
- **B2 — Scope not consciously accepted / not preview-validated.** Applying `0027` applies all of `0018`–`0027` (8+ subsystems) to a production DB that has only `0001`–`0017`. This has not been validated on a preview branch, and the governed apply path (CEO checklist #1–#2) is not armed.
- **B3 — `events.deliveries` rewrite/lock (`0021`).** Confirm the production row count and, if non-trivial, apply in a maintenance window (`ACCESS EXCLUSIVE` lock during column backfill).
- **B4 — Setup gates open.** CEO account, tenant, Coolify app, and DNS (checklist #4–#7) are not done, so the DoD loop cannot be completed today regardless.
- **Non-blocking, recommended before external/multi-tenant use:** payload-size cap + rate limiting on the write RPCs (§5); reconcile the snapshot store with the `0026` human-review gate if that governance is wanted (§3).

**3. If YES (the path to approval, in order):** arm the governed path (checklist #1–#2) → apply `0018`–`0027` to a **Supabase preview branch** and confirm advisors are clean → deploy the app to a **staging** Coolify build against that preview DB → **run the §9 smoke test** → on green, apply to production (mind B3) and complete checklist #4–#7 (account → tenant → Coolify → DNS).

**4. After deployment, can the CEO immediately do the full loop** (open URL, sign in, create a business, run + save an analysis, close, return tomorrow, retrieve it, generate blueprint + proposal)?
**Proven at the data layer (create/save/retrieve, 627/627 tests); not yet proven live.** Until the §9 smoke test passes on a real Supabase target, I cannot answer an unconditional YES — and by the order's own rule ("if any answer is NO, deployment is not approved"), **deployment is not approved today.** Once the smoke test is green and checklist #1–#7 are done, every step is expected to work, and I will confirm it live before reporting success.

---

### Honest summary

The HL-BTI work is **safe, reusable, additive, well-tested, and consistent** with the Herman Legacy architecture. It is **not yet production-approved** — not for any defect, but because a responsible promotion of a 10-migration, 8-subsystem change should be validated on a preview branch and smoke-tested live once before it becomes the production platform. That validation is hours of work behind two CEO approvals, not a rebuild.
