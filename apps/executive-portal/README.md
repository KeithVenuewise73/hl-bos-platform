# @hl-bos/executive-portal

The **Herman Legacy Executive Portal** — a secure, **read-only**, cloud-deployable executive view over the Enterprise Catalog and Software Factory. It reuses `@hl-bos/catalog` and is safe to deploy publicly **behind authentication**.

> This is NOT the Control Center. `apps/control-center` stays localhost-only (it drives git/pnpm). This app has **no command-execution surface**: no `child_process`, no git, no pnpm, no filesystem mutation, no OS command surface, no database writes.

## Views (all read-only)

Executive Dashboard · Enterprise Catalog · Software Factory · Module Registry · Product Compositions · Asset Relationships · Product Readiness · Platform Health · Commercial Readiness · Deployment Status · CEO Decision Status · Product Portfolio.

## Security model

- **Authentication:** HL-BOS identity (Supabase Auth). Unauthenticated → redirected to `/login`, no content.
- **Authorization:** a pure, unit-tested role matrix (`src/lib/authz.ts`) enforced **server-side** in every route (`PortalShell`). Five roles: `platform_owner`, `executive`, `administrator`, `developer`, `read_only_auditor`. Sensitive views (Commercial, CEO Decisions) are owner/executive only.
- **No secrets in the browser:** only the publishable (anon) key + the viewer's JWT; the service-role key is never referenced.
- **Headers:** CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (see `next.config.ts`).
- **Audit:** login, protected-page access, and denials are logged (stdout → platform log sink).
- **Source maps** disabled in production.

## Local development

```bash
# Runs with a LOCAL dev role so you can see the authenticated views without a
# live Supabase login. This bypass is IMPOSSIBLE in production (guarded on
# NODE_ENV/HL_BOS_ENV) and is covered by tests.
HL_BOS_ENV=development PORTAL_DEV_ROLE=platform_owner pnpm --filter @hl-bos/executive-portal dev
```

## Tests

`pnpm --filter @hl-bos/executive-portal test` — 20 tests: the authorization boundary matrix (unauthenticated sees nothing; each role's allowed/denied views; sensitive-view gating) and the dev-bypass-impossible-in-production guarantee.

## Deployment

Node SSR (`output: standalone`). See `Dockerfile` and `docs/architecture-audit/hlvs-phase-7-executive-portal/`. Health check: `GET /api/health`. Port 4300.
