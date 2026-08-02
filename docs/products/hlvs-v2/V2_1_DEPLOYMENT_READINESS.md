# HLVS V2 · V2-1 — Deployment Readiness

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Prepared, not executed.**

Follows the proven Coolify pattern used by the Executive Portal and Herman Legacy Digital. **Nothing here is deployed; no DNS change is made.**

## Coolify configuration

| Field                    | Value                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Repository               | `KeithVenuewise73/hl-bos-platform`                                                                |
| App path                 | `apps/venture-studio`                                                                             |
| Dockerfile               | `apps/venture-studio/Dockerfile`                                                                  |
| Build context            | **repository root (`.`)** — the Dockerfile builds the monorepo                                    |
| Build pack               | Dockerfile                                                                                        |
| Container port           | **4500** (`EXPOSE 4500`, `ENV PORT=4500`, `HOSTNAME=0.0.0.0`)                                     |
| Health check path        | `/api/health` (expects HTTP 200, `{"status":"ok"}`)                                               |
| Proposed internal domain | internal-only (e.g. `venture-studio.internal.hermanlegacy…`) — **not public**; this is a CEO tool |

## Environment variables

**Required — build args AND runtime** (the Dockerfile declares them as `ARG`; Next inlines `NEXT_PUBLIC_*` at build):

| Variable                               | Value                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://mvvtngiopdrgiedjmhfb.supabase.co` (HL-BOS Core) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Core anon/publishable key (**never** service-role)       |

**Required for writes — runtime:**

| Variable            | Purpose                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `VSTUDIO_TENANT_ID` | The first-party tenant that owns records — **now resolved** (see below). Unset → honest "tenant not configured"; no fabrication. |

### Tenant decision — RESOLVED (2026-08-02)

The CEO approved **Path A**: a dedicated first-party internal tenant was provisioned through the canonical HL-BOS path (`platform.provision_tenant`), so Herman Legacy internal records are never mixed with the HSCS Government (customer-facing) tenant.

| Tenant                                         | UUID (private)                         | Slug                     | Class       | Status |
| ---------------------------------------------- | -------------------------------------- | ------------------------ | ----------- | ------ |
| **Herman Legacy Group Internal** _(new)_       | `f1619fdb-9e14-4067-9cac-9182c9751c8e` | `herman-legacy-internal` | first_party | trial  |
| HSCS Government _(unchanged; do NOT use here)_ | `0fa1e91a-4b8e-4637-9ce9-afdc6562c48e` | `hscs-government`        | first_party | trial  |

**`VSTUDIO_TENANT_ID = f1619fdb-9e14-4067-9cac-9182c9751c8e`** (Herman Legacy Group Internal). This value is recorded here in the private deployment-readiness record only — not in public-facing docs — and is **not yet configured in Coolify** (deployment is a separate authorized step).

Verified at provisioning: created via `platform.provision_tenant(... 'first_party' ...)` as the platform owner; CEO (`keith@venuewise.net`) is an **active** member with role **`tenant_owner`**; all five Venture Studio permissions resolve for the CEO; isolated from HSCS Government (no HSCS row or membership changed); audit trail written for the tenant, membership, and role inserts. Status is `trial` — the canonical initial state (identical to HSCS Government) and fully operable; promotion to `active` is an optional later lifecycle step, not required for Venture Studio.

**Baked by the Dockerfile:** `NODE_ENV=production`, `HL_BOS_ENV=production` (these make the dev bypass impossible).
**Must NOT be set:** `VSTUDIO_DEV_ROLE` (local dev only), any `SUPABASE_SERVICE_ROLE_KEY`.
**Optional:** `SOURCE_COMMIT` / `COOLIFY_GIT_COMMIT_SHA` (health metadata; Coolify injects automatically).

## Migration dependency (the gate)

- **Migration `0029_venture_studio_foundation.sql` is APPLIED to HL-BOS Core (2026-08-01).** The `vstudio` schema, RLS, permissions, and RPCs exist in production. See `V2_1_PRODUCTION_STATE.md`.
- The remaining gate for **live data** is exposing `vstudio` to the API (PostgREST) — see `V2_1_POSTGREST_EXPOSURE_PLAN.md`. Until exposed, the deployed app runs correctly and shows explicit "schema not yet provisioned" states. **No API exposure is done in this phase.**

## First-boot checks

1. `GET /api/health` → 200 `{"status":"ok","app":"venture-studio"}`.
2. `GET /` (no session) → **307 → /login** (auth gate; dev bypass off).
3. `GET /login` → 200.
4. `POST /api/opportunities` (no session) → redirected (no mutation).
5. After `vstudio` is API-exposed + `VSTUDIO_TENANT_ID` set: capture a **demonstration** opportunity (labeled DEMONSTRATION / NOT LIVE) and confirm it round-trips.

## Not done in this phase (as instructed)

No deploy, no DNS, no API exposure, no external connectors, no Coolify configuration. (Migration 0029 is applied and the dedicated internal tenant is provisioned — see above.) The remaining gates are: expose `vstudio` to the API, configure Coolify with `VSTUDIO_TENANT_ID`, and deploy — all a separate, CEO-authorized step.
