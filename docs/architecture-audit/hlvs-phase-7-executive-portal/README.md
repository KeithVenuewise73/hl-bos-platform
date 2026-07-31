# Herman Legacy Executive Portal — Delivery Package

**For:** Keith Herman, CEO · **Date:** 2026-07-30
**Branch:** `feat/herman-legacy-executive-portal` (from `main`, post-merge)

---

## 1. PR #16 merged ✅

Project Atlas (PR #16) was merged into `main` (merge commit `120f20e`) using the repository's merge-commit method, preserving the phase history. This branch was created from the updated `main`.

## 2–9. Deliverables

| #   | Deliverable                      | Where                                                                                                      |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 2   | New executive portal application | `apps/executive-portal/` (secure, read-only, reuses `@hl-bos/catalog`)                                     |
| 3   | Authentication & role model      | [03-security-validation.md](03-security-validation.md) + `src/lib/authz.ts`, `session.ts`, `middleware.ts` |
| 4   | Security validation              | [03-security-validation.md](03-security-validation.md)                                                     |
| 5   | Automated authorization tests    | `apps/executive-portal/src/lib/authz.test.ts`, `access.test.ts` (20 tests)                                 |
| 6   | Coolify deployment configuration | [01-coolify-deployment-config.md](01-coolify-deployment-config.md) + `Dockerfile`                          |
| 7   | Cloud deployment runbook         | [02-cloud-deployment-runbook.md](02-cloud-deployment-runbook.md)                                           |
| 8   | Staging-readiness report         | [04-staging-readiness-report.md](04-staging-readiness-report.md)                                           |
| 9   | Screenshots                      | `screenshots/` (login, dashboard, factory, platform-health, portfolio, 403-denied)                         |

## The application in one paragraph

A separate Next.js app that renders 12 read-only executive views over the Enterprise Catalog and Software Factory. It has **no command-execution surface** — no `child_process`, git, pnpm, filesystem mutation, or database writes. Access requires authentication (HL-BOS identity via Supabase Auth); a pure, unit-tested role matrix is enforced server-side on every route. `apps/control-center` is untouched and stays localhost-only.

## Verified (this build)

- **Production build** succeeds (all 12 views + login/logout + health + middleware compile).
- **Typecheck** passes · **Lint** passes · **Tests** 127/127 (20 new authorization tests).
- **Unauthenticated → no content:** the production build redirects every protected route to `/login` (307).
- **Authorization enforced server-side:** a developer visiting Commercial Readiness gets a logged 403 (screenshot `08`).
- **Dev bypass impossible in production:** guarded on `NODE_ENV`/`HL_BOS_ENV`, covered by tests.
- **Health endpoint:** `GET /api/health` → 200 JSON.

## 10. Exact CEO approvals needed before staging deployment

Deployment is **not** performed in this phase. Before staging, you must:

1. **Authorize a Coolify application** for `apps/executive-portal` (create the service, connect the repo).
2. **Provide the publishable Supabase values** as build args/env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — publishable key only; the service-role key is never used.
3. **Provision portal roles** for the intended users — set each user's `app_metadata.portal_role` (or `platform_permissions`) in HL-BOS identity, OR approve a small `public.portal_role()` RPC migration (approval-gated) so roles resolve from platform permissions. Until roles are provisioned, authenticated users are fail-closed (no access).
4. **Approve the internal staging hostname** for validation (not the public domain yet).
5. **After staging validation, authorize** the production promotion to `control.hermanlegacygroup.com` (DNS + TLS) — a later, separate step.

**Per the stop condition: not deployed to Coolify, no DNS change, Control Center not exposed, no SalonAI work, no website migration.**
