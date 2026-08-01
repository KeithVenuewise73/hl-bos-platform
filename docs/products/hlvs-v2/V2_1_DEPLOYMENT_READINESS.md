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

| Variable            | Purpose                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `VSTUDIO_TENANT_ID` | The Herman Legacy first-party tenant that owns records. Unset → honest "tenant not configured"; no fabrication. |

**Baked by the Dockerfile:** `NODE_ENV=production`, `HL_BOS_ENV=production` (these make the dev bypass impossible).
**Must NOT be set:** `VSTUDIO_DEV_ROLE` (local dev only), any `SUPABASE_SERVICE_ROLE_KEY`.
**Optional:** `SOURCE_COMMIT` / `COOLIFY_GIT_COMMIT_SHA` (health metadata; Coolify injects automatically).

## Migration dependency (the gate)

- **Migration `0029_venture_studio_foundation.sql` is written but UNAPPLIED.** Live opportunity data requires it to be applied to HL-BOS Core **after CEO approval**, and the `vstudio` schema exposed to the API.
- Until applied, the deployed app runs correctly and shows explicit "schema not yet provisioned" states. **No migration is applied by this phase.**

## First-boot checks

1. `GET /api/health` → 200 `{"status":"ok","app":"venture-studio"}`.
2. `GET /` (no session) → **307 → /login** (auth gate; dev bypass off).
3. `GET /login` → 200.
4. `POST /api/opportunities` (no session) → redirected (no mutation).
5. After migration applied + `VSTUDIO_TENANT_ID` set: capture a **demonstration** opportunity (labeled DEMONSTRATION / NOT LIVE) and confirm it round-trips.

## Not done in this phase (as instructed)

No deploy, no DNS, no migration applied, no external connectors. Deployment is a separate, CEO-authorized step after merge.
