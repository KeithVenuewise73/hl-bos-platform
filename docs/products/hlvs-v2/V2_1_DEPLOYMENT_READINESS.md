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

| Variable            | Purpose                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VSTUDIO_TENANT_ID` | The first-party tenant that owns records. Unset → honest "tenant not configured"; no fabrication. **See the open decision below before setting.** |

### Tenant decision — OPEN (CEO input required)

A read-only check of `platform.tenants` in production found **exactly one** first-party tenant:

| Tenant          | UUID                                   | Kind        | Plan  |
| --------------- | -------------------------------------- | ----------- | ----- |
| HSCS Government | `0fa1e91a-4b8e-4637-9ce9-afdc6562c48e` | first_party | trial |

There is **no dedicated "Herman Legacy internal" tenant** yet. Venture Studio is an internal executive tool, and using the HSCS Government tenant to own Herman Legacy opportunity records would conflate two distinct businesses. Two supported paths, both a CEO decision (nothing was created or modified):

- **Path A (recommended):** create a dedicated first-party tenant (e.g. "Herman Legacy — internal") before deploy, then set `VSTUDIO_TENANT_ID` to its UUID. Cleanest data ownership; needs one CEO-approved tenant-provisioning step.
- **Path B (interim):** deploy with `VSTUDIO_TENANT_ID` **unset**. The app runs in its honest read-only "tenant not configured" state — real deploy, no fabricated records — until a tenant is chosen.

Until this is decided, `VSTUDIO_TENANT_ID` should remain **unset** (Path B). Do not point it at the HSCS Government tenant by default.

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

No deploy, no DNS, no API exposure, no external connectors. (Migration 0029 is already applied — see above.) Deployment is a separate, CEO-authorized step.
