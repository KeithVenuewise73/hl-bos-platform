# HLVS V2 · V2-1 — Coolify Deployment Package

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Prepared from source (`main` @ `7dc7ec2`); NOT deployed.**

All values below are verified from the committed source, not assumed.

## Coolify application configuration

| Field                             | Value                                                                                           | Source                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Repository                        | `KeithVenuewise73/hl-bos-platform`                                                              | —                                                  |
| Branch                            | `main`                                                                                          | —                                                  |
| Build pack                        | Dockerfile                                                                                      | —                                                  |
| Dockerfile path                   | `apps/venture-studio/Dockerfile`                                                                | verified                                           |
| Build context                     | **repository root (`.`)** — the Dockerfile `COPY . .` + `pnpm install` needs the whole monorepo | `Dockerfile`                                       |
| Build command (inside Dockerfile) | `pnpm --filter @hl-bos/venture-studio-app build`                                                | `Dockerfile:22`                                    |
| Runtime                           | Node 22 (bookworm-slim), Next.js **standalone**                                                 | `Dockerfile`, `next.config.ts output:"standalone"` |
| Start command                     | `node apps/venture-studio/server.js`                                                            | `Dockerfile:38`                                    |
| Internal port                     | **4500** (`EXPOSE 4500`, `ENV PORT=4500`, `HOSTNAME=0.0.0.0`)                                   | `Dockerfile:35-37`                                 |
| Health-check path                 | `/api/health` → HTTP 200 `{"status":"ok","app":"venture-studio",…}`                             | `src/app/api/health/route.ts`                      |
| Auth redirect behavior            | unauthenticated `GET /` → **307 → `/login`** (public paths: `/login`, `/api/health` only)       | `src/middleware.ts`                                |

## Environment variables (verified from code)

**Build args AND runtime — REQUIRED** (Dockerfile declares as `ARG`; Next inlines `NEXT_PUBLIC_*` at build):

| Variable                               | Value                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://mvvtngiopdrgiedjmhfb.supabase.co` (HL-BOS Core) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Core anon/publishable key (**never** service-role)       |

**Runtime — REQUIRED for write functionality:**

| Variable            | Value                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VSTUDIO_TENANT_ID` | The first-party tenant UUID that owns records — **see private value + open decision in `V2_1_DEPLOYMENT_READINESS.md`.** Unset → app runs read-only with an honest "tenant not configured" state (no fabrication). |

**Baked by the Dockerfile (do not re-add):** `NODE_ENV=production`, `HL_BOS_ENV=production` (these make the dev bypass impossible).

**Optional:** `SOURCE_COMMIT` / `COOLIFY_GIT_COMMIT_SHA` (health metadata; Coolify injects the commit automatically).

**PROHIBITED — never set:**

- `VSTUDIO_DEV_ROLE` (local dev bypass only; would be inert in production anyway, but must not be set)
- `SUPABASE_SERVICE_ROLE_KEY` / any database password / any private secret — **never**, and never behind `NEXT_PUBLIC_*`.

**Confirmed complete:** the app source reads exactly these env vars (`git grep process.env` over `apps/venture-studio/src`): the two `NEXT_PUBLIC_*`, `VSTUDIO_TENANT_ID`, `VSTUDIO_DEV_ROLE`, `NODE_ENV`, `HL_BOS_ENV`, `SOURCE_COMMIT`, `COOLIFY_GIT_COMMIT_SHA`. **No additional variable is required.**

## Dependency gate

Live reads/writes also require **`vstudio` exposed to PostgREST** (see `V2_1_POSTGREST_EXPOSURE_PLAN.md`). The app deploys and serves the public shell + honest states even before exposure.

## Proposed internal domain

**Recommended: `venturestudio.hermanlegacygroup.com`.**

Rationale: the forensic trace established that the abbreviation **"HLVS" is ambiguous** — it has meant the retired legacy Venture Studio, the `hlvs` Software Factory, and the business unit. Using `hlvs.hermanlegacygroup.com` would re-import that ambiguity onto a public hostname. `venturestudio.…` names the product plainly ("Herman Legacy Venture Studio"), is unambiguous, and won't be confused with the `hlvs` Factory schema. This is an **internal executive tool** — keep it behind authentication and, ideally, network-restricted.

_Alternative:_ `hlvs.hermanlegacygroup.com` (shorter, but carries the ambiguity above). **DNS is not configured in this phase.**
