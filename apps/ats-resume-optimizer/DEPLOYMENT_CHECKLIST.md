# Deployment checklist — ATS Resume Optimizer

The operational companion to [DEPLOYMENT.md](./DEPLOYMENT.md). That file explains
_why_ each setting is what it is; this one is the list you work through and tick off.

Everything below has been executed against the real production build except the two
items marked **UNVERIFIED**, which cannot be run in the build environment and are
called out rather than assumed.

---

## 1. Before you start

| You need                        | Why                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A Supabase project              | Identity provider and database. The app **refuses to serve** when deployed without one.                               |
| Its URL and **publishable** key | Never the service-role key. The app has no use for one and must never be given one.                                   |
| A Coolify server + a domain     | Where it runs and how people reach it.                                                                                |
| One Supabase user account       | Private beta creates accounts by hand.                                                                                |
| Two Stripe Payment Links        | Optional at first — without them the pricing page says checkout is not switched on rather than showing a dead button. |

---

## 2. Environment variables

**Build variables** — these are compiled into the browser bundle. Setting them at
runtime only produces a sign-in page that cannot work, with no error to explain it.

| Variable                               | Value                           |
| -------------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key             |

**Runtime variables**

| Variable                | Value           | Notes                                                                              |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `HL_BOS_ENV`            | `production`    | Also set by the Dockerfile. Drives the auth guard and disables demo seeding.       |
| `ATS_DATA_DIR`          | `/data`         | Only used by the file store. Harmless with Supabase configured.                    |
| `PRIVATE_BETA`          | `true`          | Closes self-service sign-up during the beta.                                       |
| `CONSUMER_PAYMENT_LINK` | Stripe URL      | Must be `https`. Anything else is ignored and the button is hidden.                |
| `COACH_PAYMENT_LINK`    | Stripe URL      | Same.                                                                              |
| `ANTHROPIC_API_KEY`     | _(optional)_    | Leave unset. Every feature works on the rules engine; this only changes phrasing.  |
| `ATS_SEED_DEMO`         | _(leave unset)_ | Derived. Deployed ⇒ no sample data. Set `true` only for a deliberate demo account. |

---

## 3. Supabase

1. **Auth → Providers → Email**: enabled.
2. **Auth → URL Configuration → Site URL**: your production URL.
3. **Redirect URLs**: add `https://<your-domain>/reset-password/update`. Password reset
   silently fails to return the user without this.
4. **Email confirmation**: your choice. The sign-up screen handles both — it says
   "check your email" only when Supabase actually sends one.
5. **Exposed schemas** (API settings): `ats` must be listed, or every query 404s.
6. **Migrations**: `0048` is applied. `0049` (`ats.product_events`) is **not** —
   apply it when you want the beta counters. The app runs correctly without it;
   analytics writes fail silently by design.

---

## 4. Build and deploy

Coolify → new resource → **Dockerfile** build pack.

| Setting               | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Build context         | repository root `/`                                     |
| Dockerfile            | `apps/ats-resume-optimizer/Dockerfile`                  |
| Port                  | `4600`                                                  |
| Health check          | `/api/health`                                           |
| **Persistent volume** | `/data` — **required** if you ever run without Supabase |

Local equivalents, if you want to reproduce the build:

```bash
pnpm install
pnpm --filter @hl-bos/ats-resume-optimizer build
node apps/ats-resume-optimizer/.next/standalone/apps/ats-resume-optimizer/server.js
```

---

## 5. Production verification

Run these against the deployed URL, in order. Each one has been run against the
production build locally and produced the result shown.

| #   | Check                              | Expected                                                                                                                                        |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `curl -s $URL/api/health`          | `"status":"waiting"` or `"ok"`, `"mode":"authenticated"`. **Not** `refusing` — that means the Supabase build variables did not reach the build. |
| 2   | Open `/` signed out                | Redirects to `/welcome`, the landing page                                                                                                       |
| 3   | `/pricing`                         | Both offers; the buttons point at your Stripe links                                                                                             |
| 4   | `/privacy`, `/data-handling`       | Both render                                                                                                                                     |
| 5   | `/profile` signed out              | Redirects to `/login?next=%2Fprofile`                                                                                                           |
| 6   | `/signup` with `PRIVATE_BETA=true` | Says accounts are made by hand                                                                                                                  |
| 7   | Sign in with your account          | Reaches the dashboard                                                                                                                           |
| 8   | Dashboard after first sign-in      | **No transportation executive.** If sample data appears, `HL_BOS_ENV` did not reach the runtime                                                 |
| 9   | Paste a job posting → analyze      | Evidence matrix renders                                                                                                                         |
| 10  | Generate a resume → export DOCX    | File downloads; response carries `X-Claims-Dropped`                                                                                             |
| 11  | Settings                           | Reports the live storage and AI provider, and offers account deletion                                                                           |

---

## 6. Rollback

The app holds no state of its own — everything is in Supabase — so rolling back the
container is safe and does not lose data.

1. Coolify → Deployments → redeploy the previous successful build.
2. If a **migration** is the problem, each migration file carries its own `rollback:`
   block in the header comment. For `0049` that is
   `DROP TABLE IF EXISTS ats.product_events;` — additive, so dropping it restores the
   prior state exactly and costs only the beta counters.
3. If the app is serving but **refusing**, that is not a rollback: it is a missing
   build variable. Fix it and rebuild — the refusal is the guard working.

---

## 7. Known gaps

- **UNVERIFIED: the container image has never been built.** There is no Docker daemon
  in the build environment. The standalone output has been run under the exact `CMD`
  the image uses, and the Dockerfile mirrors a pattern five other apps in this
  repository already deploy with, but the first Coolify build is the real test.
- **UNVERIFIED: the PostgreSQL path has not run against the production project.**
  It has run against a local PostgreSQL 16 with the same migrations and the same
  forced RLS. The first signed-in save is the real test.
- Checkout clicks from signed-out visitors are not counted (see
  `src/app/api/events/route.ts`). Stripe's dashboard is the source of truth for
  conversions.
