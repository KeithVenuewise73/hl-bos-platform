# Coolify Deployment Configuration — Executive Portal

**Design/config only. Nothing is deployed in this phase.**

| Item                   | Value                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Repository**         | `KeithVenuewise73/hl-bos-platform`                                                                                                                                       |
| **Production branch**  | `main` (deploy from `main` after this branch merges)                                                                                                                     |
| **Application root**   | `apps/executive-portal` (monorepo app)                                                                                                                                   |
| **Service type**       | **Application** — Node SSR. Preferred: **Dockerfile** (`apps/executive-portal/Dockerfile`, deterministic monorepo build). Alternative: Nixpacks with the commands below. |
| **Node version**       | 22 (`engines.node >=22`)                                                                                                                                                 |
| **pnpm version**       | 10.34.5 (`packageManager` pin; `corepack enable`)                                                                                                                        |
| **Install command**    | `pnpm install --frozen-lockfile` (run at repo root)                                                                                                                      |
| **Build command**      | `pnpm --filter @hl-bos/executive-portal build`                                                                                                                           |
| **Start command**      | `node apps/executive-portal/server.js` (standalone) — or `pnpm --filter @hl-bos/executive-portal start`                                                                  |
| **Listening port**     | `4300` (`PORT=4300`, `HOSTNAME=0.0.0.0`)                                                                                                                                 |
| **Health-check route** | `GET /api/health` → `200 {"status":"ok",...}` (public, unauthenticated)                                                                                                  |

## Environment variables

| Variable                                   | Value                              | Notes                                                  |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| `NODE_ENV`                                 | `production`                       | Disables the dev bypass + source maps                  |
| `HL_BOS_ENV`                               | `production`                       | Also disables the dev bypass                           |
| `NEXT_PUBLIC_SUPABASE_URL`                 | HL-BOS Core project URL            | **Build-time** (inlined); public by design             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | HL-BOS Core publishable (anon) key | **Build-time**; public by design (RLS is the boundary) |
| `SOURCE_COMMIT` / `COOLIFY_GIT_COMMIT_SHA` | commit SHA (optional)              | Surfaced by `/api/health`                              |
| `PORTAL_DEV_ROLE`                          | **UNSET in production**            | Dev-only; impossible to use in production anyway       |

**Never set:** `SUPABASE_SERVICE_ROLE_KEY` or any provider secret — the portal does not use them.

## Supabase configuration

- Points at **HL-BOS Core** (`mvvtngiopdrgiedjmhfb`).
- Uses the **publishable key + the viewer's JWT** only; every read is RLS-scoped server-side.
- Auth: Supabase Auth (email/password, invitation-only). Enable leaked-password protection + MFA on the project (recommended).

## Operational

| Concern                | Configuration                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| **Persistent storage** | None — stateless app; no volumes                                                                  |
| **Logging**            | Container stdout/stderr (structured access/denial lines); ship to the platform log sink           |
| **Monitoring**         | Coolify health check on `/api/health`; uptime + error-rate alerts                                 |
| **TLS**                | Coolify-managed Let's Encrypt certificate; HTTPS-only; HSTS (set in `next.config.ts`)             |
| **Rollback**           | Redeploy the previous image/commit in Coolify (one click). Read-only + stateless → no data impact |
| **DNS (later, gated)** | `control.hermanlegacygroup.com` → Coolify ingress. **Not changed in this phase**                  |
