# Staging-Readiness Report — Executive Portal

**Date:** 2026-07-30 · **Branch:** `feat/herman-legacy-executive-portal` · **Verdict: READY for staging** (pending the CEO approvals below).

## Readiness checklist

| Check                                     | Result | Evidence                                                                                            |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Production build succeeds                 | ✅     | `next build` — all 12 views + login/logout + `/api/health` + middleware compile                     |
| Typecheck passes                          | ✅     | `tsc --noEmit` clean (7/7 workspace projects)                                                       |
| Lint passes                               | ✅     | `eslint .` clean                                                                                    |
| Tests pass                                | ✅     | **127/127** (20 new: authorization matrix + dev-bypass-impossible-in-prod)                          |
| Authentication works                      | ✅     | Unauthenticated → `/login` (307) in the production build; login form wired to Supabase Auth         |
| Authorization works                       | ✅     | Server-side per-view; developer → **403** on Commercial (logged) — screenshot 08                    |
| All executive routes render               | ✅     | Dashboard, Factory, Platform Health, Portfolio (+ 8 more) render with real data — screenshots 04–07 |
| No developer command capabilities present | ✅     | No `child_process`/git/pnpm/filesystem/DB-write surface (security validation §command-surface)      |
| Health endpoint works                     | ✅     | `GET /api/health` → `200 {"status":"ok",...}`                                                       |
| Deployment configuration complete         | ✅     | Dockerfile + Coolify config (01) + runbook (02)                                                     |

## What "ready for staging" means here

The application is **built, tested, and configured**. It is safe to deploy to an **internal staging address** once the CEO grants Coolify/repo access and the Supabase publishable values, and provisions portal roles for the pilot users. It must not go to the public domain until staging is validated and accepted.

## Known limitations (honest)

1. **Role provisioning is a deploy-time step.** Until a user has `app_metadata.portal_role` (or the `public.portal_role()` RPC is approved), authenticated users are fail-closed. The authorization _logic_ is complete and tested; the _role source_ is wired at deploy.
2. **Live Supabase auth was not exercised in this environment** (no keys/users here). Auth wiring is standard `@supabase/ssr`; the authenticated views were verified via the production-impossible local dev role, and the production build was verified to redirect unauthenticated users.
3. **Platform Health figures** are sourced from the Atlas assessment (registry), labeled as such; live figures require a connected read-only session (a later enhancement).
4. **Not deployed.** No Coolify service, no DNS, no TLS issued in this phase.

## CEO approvals required before staging deployment

1. Authorize a **Coolify Application** for `apps/executive-portal` + connect the repo.
2. Provide the **publishable Supabase values** (URL + publishable key) as build env.
3. **Provision portal roles** for pilot users (or approve the `public.portal_role()` RPC migration).
4. Approve the **internal staging hostname** for validation.
5. (Later) authorize the **production promotion** to `control.hermanlegacygroup.com` (DNS + TLS).

## Recommendation

**Approve staging deployment** of the Executive Portal. It meets every readiness check, enforces authentication and authorization server-side, exposes no command surface, and keeps the Control Center untouched and local-only.
