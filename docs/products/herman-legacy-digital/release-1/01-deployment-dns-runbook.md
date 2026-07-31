# Herman Legacy Digital · Release 1 — Deployment & DNS Runbook

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**No production deployment or DNS change is made in this phase.** This runbook is the approved
procedure to execute **after CEO authorization**. Nothing here is irreversible until you approve
step 6.

## What deploys

`apps/herman-legacy-digital` — a standalone Node SSR app (Next.js), containerized by its
`Dockerfile`, on the same **Herman Legacy Cloud (Coolify)** pattern as the Executive Portal.
Target domain: **hermanlegacydigital.com**. Container port **4400**.

## Environment separation

| Env        | HL_BOS_ENV   | Supabase                           | Notes                                |
| ---------- | ------------ | ---------------------------------- | ------------------------------------ |
| Preview    | `preview`    | HL-BOS Core (publishable key)      | Dev bypass OFF; auth required        |
| Production | `production` | HL-BOS Core `mvvtngiopdrgiedjmhfb` | Dev bypass impossible (code-guarded) |

## Secrets (never committed)

Set as Coolify build/runtime variables — **publishable key only**, never a service-role key:

- `NEXT_PUBLIC_SUPABASE_URL` — HL-BOS Core URL (build arg + runtime).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — anon/publishable key (build arg + runtime).
- `HLD_INTAKE_WEBHOOK_URL` _(optional)_ — enables live delivery of intake leads into the customer
  lifecycle. Until set, intake is captured and an advisor follows up (honest `persisted:false`).
- `HLD_ANALYTICS_URL` _(optional)_ — forwards analytics events to the platform store.

## Procedure

1. **Build image** from `apps/herman-legacy-digital/Dockerfile` with the two `NEXT_PUBLIC_*`
   build args. Verify the build succeeds (it does locally — see the validation report).
2. **Deploy to Preview** (`hermanlegacydigital-preview` or a Coolify preview URL). Confirm HTTPS,
   the health check, and auth.
3. **Health check:** `GET /api/health` → `200 {"status":"ok","app":"herman-legacy-digital"}`.
   Wire Coolify's health check to this path.
4. **Auth callback:** in Supabase Auth (HL-BOS Core) add the production origin
   `https://hermanlegacydigital.com` to allowed redirect URLs. Client login uses email/password
   against HL-BOS identity — no new auth system.
5. **Deployment verification:** load `/`, `/solutions`, `/visibility-assessment`; submit a test
   assessment and confirm the honest confirmation + reference; sign in and load `/portal`.
6. **DNS (CEO-authorized, reversible):** point `hermanlegacydigital.com` (A/ALIAS/CNAME per
   Coolify) at the Herman Legacy Cloud ingress. Enable automatic TLS (Let's Encrypt). **This is
   the one step that requires explicit CEO authorization.**
7. **Production monitoring:** Coolify health check on `/api/health`; container logs; Supabase Auth
   logs for sign-ins.

## Rollback plan

- **App:** Coolify → redeploy the previous image tag (one click). The app is stateless; no data
  migration is involved, so rollback is immediate and safe.
- **DNS:** revert the record to its prior value; TLS remains valid. DNS changes are reversible.
- **No database rollback needed:** this release applies **no migration** and writes no schema.

## Guarantees

- HTTPS enforced (HSTS header set in `next.config.ts`).
- Strict CSP, `X-Frame-Options: DENY`, no powered-by header, production source maps off.
- The dev auth bypass is impossible in production (guarded on `NODE_ENV`/`HL_BOS_ENV`).
- No service-role key in the app or image; no Venuewise access.
