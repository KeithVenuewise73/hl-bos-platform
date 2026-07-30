# Herman Legacy Cloud — Executive Site Architecture (`control.hermanlegacygroup.com`)

**Design only. No Coolify, DNS, or infrastructure changed in this phase.**

## Current state (confirmed)

The Enterprise Catalog and Software Factory **exist today only as routes inside the localhost-only CEO Control Center** (`apps/control-center` → `/catalog`, `/catalog/factory`). **They are not deployed anywhere.**

## The decisive finding — do NOT deploy `apps/control-center` as-is

`apps/control-center/next.config.ts` states it plainly:

> _"This app runs ONLY on the operator's own machine. It shells out to git and pnpm, so it must never be deployed to a public host — that would be remote code execution as a service."_

The app has **no authentication** (no middleware, no session check) and its Server Actions (`buildProject`, `runTests`, `pushChanges`, `approveMerge`, `saveConnection`) execute `git`/`pnpm`/`node` via `child_process` and write `.env.local`. **Publishing it to `control.hermanlegacygroup.com` would expose remote code execution.** The read-only catalog/factory routes I added inherit that localhost-only posture.

**Conclusion:** the executive site must be a **separate, read-only deployment** that contains the viewing routes and **none of the shell-driving Server Actions**, behind authentication. This is a small build task (a pre-deployment gate), not a redesign — it reuses `@hl-bos/catalog` unchanged.

## Recommended target: a read-only Executive Console

Create `apps/executive-console` — a thin, **read-only** Next.js app that renders exactly the required views over `@hl-bos/catalog` (a pure, safe package) and read-only Supabase queries. It ships **no `child_process`, no git/pnpm, no write Server Actions**. The Control Center stays local and unchanged.

### Views the site must provide (all read-only)

Executive Dashboard · Enterprise Catalog · Software Factory · Module Registry · Product Composition Blueprints · Asset Relationships · Product Readiness · Platform Health · Commercial Decision Status · Deployment Status. Every one is already implemented as a read-only view over `@hl-bos/catalog`; they are ported into the new app without the operator actions.

### Data sourcing (safe in production)

- **Static catalog/registry/compositions:** from the bundled `@hl-bos/catalog` package (pure code) — no filesystem scan needed at runtime (completeness uses a build-time snapshot, not a repo scan).
- **Live platform health / deployment status:** read-only Supabase queries with the **publishable (anon) key + the viewer's JWT** — never the service-role key.

## Deployment specification

| Item                       | Value                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Application to deploy**  | `apps/executive-console` (new, read-only) — **NOT** `apps/control-center`                                                                                                                                            |
| **Shared package**         | `@hl-bos/catalog` (reused unchanged)                                                                                                                                                                                 |
| **Repository**             | `KeithVenuewise73/hl-bos-platform`                                                                                                                                                                                   |
| **Production branch**      | `main` (deploy from `main` after Atlas merge)                                                                                                                                                                        |
| **Coolify service type**   | Nixpacks/Dockerfile **Application** (Node server) — mirror the `apps/hl-bti` container pattern (nginx for static, or Node for SSR). Because health/deploy views need live SSR, use a **Node server** (`next start`)  |
| **Build command**          | `pnpm install --frozen-lockfile && pnpm --filter @hl-bos/executive-console build`                                                                                                                                    |
| **Start command**          | `pnpm --filter @hl-bos/executive-console start` (Next standalone server)                                                                                                                                             |
| **Node version**           | 22 (matches `engines.node >=22`, CI runtime)                                                                                                                                                                         |
| **Package manager**        | pnpm 10.34.5 (`packageManager` pin)                                                                                                                                                                                  |
| **Port**                   | 3000 (container), fronted by Coolify TLS proxy                                                                                                                                                                       |
| **Health-check route**     | `/api/health` (returns 200 + build SHA) — add to the new app                                                                                                                                                         |
| **Environment variables**  | `NODE_ENV=production`, `HL_BOS_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `AUTH_ALLOWED_ROLES` (see access-control spec). **No** service-role key, **no** provider secrets |
| **Supabase configuration** | Point at HL-BOS Core (`mvvtngiopdrgiedjmhfb`); use publishable key only; RLS enforces all reads; auth via Supabase Auth                                                                                              |
| **Persistent storage**     | **None** — stateless app; no volumes                                                                                                                                                                                 |
| **Logging**                | Coolify stdout/stderr capture; structured request logs (no secrets); ship to the platform log sink                                                                                                                   |
| **Monitoring**             | Coolify health check on `/api/health`; uptime alert; error-rate alert                                                                                                                                                |
| **Backup**                 | N/A for the app (stateless). The **database** is Supabase-managed (PITR); the app is redeployable from `main`                                                                                                        |
| **Rollback**               | Redeploy the previous image/commit in Coolify (one click); no data implications (read-only)                                                                                                                          |
| **DNS**                    | `control.hermanlegacygroup.com` → Coolify ingress (A/AAAA or CNAME to the Coolify host). **Not changed in this phase**                                                                                               |
| **TLS**                    | Coolify-managed certificate (Let's Encrypt) on the domain; HTTPS-only; HSTS                                                                                                                                          |

## Non-negotiable pre-deployment gates

1. **Authentication first.** The site must not be reachable unauthenticated (access-control spec). _Do not deploy an unprotected executive system._
2. **Read-only only.** No `child_process`, no write Server Actions, no service-role key in the deployed app.
3. **Publishable key + RLS.** Every data read is scoped by the viewer's JWT and RLS.

## What this phase does NOT do

No Coolify service is created, no DNS record changed, no TLS issued, no build deployed. This is the specification the post-merge runbook (doc 06) executes, with your authorization.
