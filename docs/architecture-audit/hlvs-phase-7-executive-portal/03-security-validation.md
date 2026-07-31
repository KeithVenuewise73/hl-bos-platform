# Security Validation — Executive Portal

Confirmation of each security requirement, with evidence.

## Authentication & role model

- **Authentication:** HL-BOS identity via Supabase Auth. Login (`/login`) uses the browser client + publishable key; the session cookie is validated **server-side** (`src/lib/session.ts`, `middleware.ts`). Unauthenticated → redirect to `/login`, no content.
- **Roles (5):** `platform_owner`, `executive`, `administrator`, `developer`, `read_only_auditor` — resolved from HL-BOS platform permissions / a verified `portal_role` claim (`src/lib/access.ts`, fail-closed).
- **Role visibility:** platform_owner = all; executive = all incl. commercial & CEO decisions; administrator = operational (no commercial/decisions); developer = technical (no commercial/decisions/deployment); read_only_auditor = non-sensitive views only. Encoded in the pure matrix `src/lib/authz.ts`.
- **All actions read-only:** no role can write, deploy, or run a command.

## Requirement checklist

| Requirement                                   | Status       | Evidence                                                                                                                                                                                         |
| --------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No public command-execution routes            | ✅           | No route runs a command; app has no such surface                                                                                                                                                 |
| No server action can execute shell commands   | ✅           | **Zero Server Actions**; no `child_process` anywhere in the app                                                                                                                                  |
| No secrets exposed to the browser             | ✅           | Only `NEXT_PUBLIC_*` (publishable key) is client-side                                                                                                                                            |
| No service-role key shipped client-side       | ✅           | `SUPABASE_SERVICE_ROLE_KEY` is never referenced                                                                                                                                                  |
| Secure session handling                       | ✅           | `@supabase/ssr` cookie session; validated server-side; HTTPS/HSTS                                                                                                                                |
| Authorization checked server-side             | ✅           | `PortalShell` calls `getViewer()` + `canView()` on every route; 403 on deny (screenshot 08)                                                                                                      |
| Security headers enabled                      | ✅           | CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (`next.config.ts`)                                                                                                 |
| Audit logging (login + protected-page access) | ✅           | Structured `portal.access` / `portal.access_denied` lines to stdout (verified in run logs)                                                                                                       |
| Safe error handling                           | ✅           | 403 leaks no asset detail; no stack traces to the browser                                                                                                                                        |
| Production source maps handled                | ✅           | `productionBrowserSourceMaps: false`                                                                                                                                                             |
| Rate limiting / abuse protection on auth      | ✅ (layered) | Supabase Auth enforces per-account/IP rate limits on sign-in; the app adds no unauthenticated write surface. (A Coolify/ingress rate-limit on `/login` is recommended and noted in the runbook.) |
| Automated authorization-boundary tests        | ✅           | `authz.test.ts` + `access.test.ts` — 20 tests                                                                                                                                                    |

## Command-surface confirmation (the core requirement)

Verified by inspection of `apps/executive-portal/`:

- **No `child_process`** — the app never imports it.
- **No git / pnpm / package-manager execution.**
- **No filesystem mutation** — the data layer is pure over `@hl-bos/catalog`; no repo scan at runtime.
- **No database writes** — only read-only Supabase auth/session; every data read is from the static catalog or RLS-scoped reads.
- **No Server Actions** — the app defines none.

## The dev bypass (and why it is safe)

For local screenshots/development, a `PORTAL_DEV_ROLE` env grants a role **only when NOT in production** (`devRoleFromEnv` returns `null` if `NODE_ENV==='production'` OR `HL_BOS_ENV==='production'`). This is proven impossible in production by `access.test.ts` and demonstrated live: the production standalone build redirected every route to `/login` even with `PORTAL_DEV_ROLE` set.

## Residual items (deploy-time)

- **Role provisioning:** users need `app_metadata.portal_role` (or a `public.portal_role()` RPC) to resolve a role; until then authenticated users are fail-closed (no access). This is a deploy-time gate, not a code defect.
- **Ingress rate limit on `/login`** — recommended at the Coolify/proxy layer in addition to Supabase's built-in limits.
