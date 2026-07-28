# HL-BTI — Herman Legacy Cloud Deployment (Coolify)

_Response to the Deployment Execution Order. Target: the existing Herman Legacy Cloud (Coolify) + the HL-BOS Supabase Pro project `mvvtngiopdrgiedjmhfb`, at `bti.hermanlegacygroup.com`. No Vercel, no new Supabase project, no separate auth system._

## What is built and proven (done without CEO access)

Everything that can be built without your credentials is built, committed, and verified:

| Piece                                   | Status         | Proof                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deployable app** `apps/hl-bti`        | Built          | Authenticated static SPA. `next build` compiles + typechecks under the strict config; the full flow (sign in → workspace → intake → analysis → blueprint → proposal → **save** → reload) was driven in a real browser against the compiled bundle with **zero console errors**.           |
| **Reuses HL-BOS auth/tenancy**          | Yes            | Supabase Auth for sign-in; `identity.memberships` + `identity.has_permission` for tenancy/permissions; no new auth system.                                                                                                                                                                |
| **Intake screen**                       | Built          | Captures business name, website, industry, location, primary contact, email, phone, business goals, and analysis-only flag. (Optional document upload is deferred behind a storage bucket rather than shown as a control that does nothing.)                                              |
| **Persistence** (businesses + analyses) | Built + tested | New migration `0027` adds intake columns + `bti.analysis_snapshots` + a browser-reachable `public.bti_*` API. **20/20 pgTAP tests pass** and a full functional run against real PostgreSQL 17-class DB confirms create → save → reload-after-re-sign-in, with strangers correctly denied. |
| **Coolify config**                      | Built          | `apps/hl-bti/Dockerfile` (multi-stage: pnpm build → nginx static) + `apps/hl-bti/nginx.conf` + root `.dockerignore`.                                                                                                                                                                      |
| **Repo gates**                          | Green          | `lint`, `typecheck` (5/5), `test` (81/81), `format:check` all pass.                                                                                                                                                                                                                       |

**What is NOT yet true:** nothing is running at a URL, because the remaining steps each require an account only you control — Supabase (apply migrations), your mailbox (confirm your account), Coolify (create the app), and DNS (point the subdomain). Those are below, one at a time. **Deployment is not complete until you can sign in at the live URL and retrieve saved results** — I will not report it complete before then.

---

## The architecture, in one paragraph

The app is a **static site** (Next.js static export) served by nginx in a container on your Coolify server. It talks **directly** to the HL-BOS Supabase project from the browser using only the **publishable (anon) key** + the signed-in user's JWT. It never holds the service-role key. Every read/write goes through the permission-checked `public.bti_*` functions added in migration `0027`; Row Level Security and `identity.has_permission(tenant, …)` are the security boundary. This is the lightest possible footprint on your existing infrastructure: no new server tier, no new database, no new auth.

---

## Environment variables (names only — no secret values in this repo)

The app needs exactly **two** values, both **at build time** (Next inlines them into the static bundle). Both are browser-safe by the platform's own `ENV_SPEC` — the publishable key is public by design and gated by RLS, not by secrecy.

| Variable                               | Where                      | Value source                                                                 |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Coolify **Build Variable** | `https://mvvtngiopdrgiedjmhfb.supabase.co` (the project ref is not a secret) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Coolify **Build Variable** | Supabase Dashboard → Project Settings → API → **Publishable / anon key**     |

The app uses **no runtime env** and **no service-role key**. For the governed migration workflow (below), GitHub also needs: repo **secret** `SUPABASE_ACCESS_TOKEN`, repo **variable** `SUPABASE_PROJECT_REF = mvvtngiopdrgiedjmhfb`, and a `production` GitHub Environment — the same three the existing `db-migrate.yml` / `deploy.yml` already reference.

---

## Coolify application configuration (exact)

Create one **Application** resource in the Herman Legacy Cloud project:

| Setting                        | Value                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Source                         | GitHub repo `KeithVenuewise73/hl-bos-platform`, branch containing the HL-BTI work                |
| Build Pack                     | **Dockerfile**                                                                                   |
| Dockerfile location            | `apps/hl-bti/Dockerfile`                                                                         |
| Base directory / build context | `/` (repository root — this is a pnpm workspace)                                                 |
| Build variables                | the two `NEXT_PUBLIC_SUPABASE_*` above                                                           |
| Exposed port                   | **80** (the nginx container)                                                                     |
| Startup command                | none — the image's nginx runs in the foreground by default                                       |
| Health check path              | `/`                                                                                              |
| Domain                         | `https://bti.hermanlegacygroup.com` (Coolify provisions TLS via Let's Encrypt once DNS resolves) |

The image is self-contained: stage 1 runs `pnpm install --frozen-lockfile` + `pnpm --filter @hl-bos/hl-bti build`; stage 2 serves `apps/hl-bti/out` via nginx with SPA fallback.

---

## DNS record (exact)

At the DNS provider for `hermanlegacygroup.com`, add one record pointing the subdomain at the Coolify server:

| Type | Name  | Value                                                                 | TTL |
| ---- | ----- | --------------------------------------------------------------------- | --- |
| `A`  | `bti` | _the public IPv4 of your Coolify server_ (shown in Coolify → Servers) | 300 |

(If Coolify is behind a proxy/hostname rather than a bare IP, use a `CNAME` `bti` → that hostname instead.) Do **not** register a new domain — this is a subdomain of the domain you already own.

---

## The deployment sequence — gated CEO actions (each in the required format)

Everything above is done. These five steps each **genuinely require an account only you control**, so each is presented in the CEO-action format. Do them in order; after each, the next becomes possible. In our working session I will hand you these **one at a time** and do the engineering in between — this document is the reference for the whole path.

### CEO ACTION 1 — Approve applying the HL-BOS migrations to the Pro project

- **System:** Supabase (project `HL-BOS Core`, `mvvtngiopdrgiedjmhfb`)
- **Exact screen:** Your approval to me, then the protected **DB migrate** GitHub workflow (or the Supabase SQL path) — the standing rule is that no migration is applied without your explicit approval.
- **Exact button or field:** Reply "approved to apply migrations 0018–0027 to `mvvtngiopdrgiedjmhfb`."
- **Exact value to enter:** — (approval is the input; I run the governed apply)
- **Why this action is required:** The production project currently has migrations 0001–0017; the BTI schema (`0026`) and the browser API + intake persistence (`0027`) are not applied yet. Until they are, the app has nothing to read or write. Applying to production is a governed, approval-gated step by platform rule.
- **What happens immediately afterward:** The `bti` schema and the `public.bti_*` API exist in production; the app's data layer is live and permission-checked. I confirm with a read-only migration list.

### CEO ACTION 2 — Create your account (prove control of the mailbox)

- **System:** Supabase → Authentication
- **Exact screen:** Dashboard → **Authentication → Users**
- **Exact button or field:** **Add user → Send invitation** (NOT "Auto Confirm") for `ceo@hermanlegacygroup.com`, then open the email and complete confirmation.
- **Exact value to enter:** your email `ceo@hermanlegacygroup.com` and a password you choose when you accept.
- **Why this action is required:** HL-BOS has zero users; the platform-owner grant must attach to a mailbox you demonstrably control (the invitation flow proves it; Auto-Confirm would not).
- **What happens immediately afterward:** You exist in `auth.users` with a confirmed email — the account you will sign in with.

### CEO ACTION 3 — Bootstrap owner + create your workspace

- **System:** Supabase → SQL Editor
- **Exact screen:** Dashboard → **SQL Editor**
- **Exact button or field:** Run: `select platform.bootstrap_first_platform_owner('ceo@hermanlegacygroup.com');` then `select platform.provision_tenant('herman-legacy','Herman Legacy');`
- **Exact value to enter:** the two statements above (owner-only; not exposed to the app).
- **Why this action is required:** This grants you `platform_owner` and creates the tenant whose `tenant_owner` role carries `bti.business.manage` — the permission the app checks. Without it you sign in but have no workspace.
- **What happens immediately afterward:** `bti_my_tenants()` returns "Herman Legacy" for your account; the app will show your workspace.

### CEO ACTION 4 — Create the Coolify application

- **System:** Coolify (Herman Legacy Cloud)
- **Exact screen:** Coolify → your project → **+ New → Application → Public/Private Repository**
- **Exact button or field:** Select the repo + branch; set Build Pack = **Dockerfile**, Dockerfile = `apps/hl-bti/Dockerfile`, context `/`, port `80`; add the two `NEXT_PUBLIC_SUPABASE_*` **build variables** (values in the table above); set domain `bti.hermanlegacygroup.com`; click **Deploy**.
- **Exact value to enter:** the build-variable values from the environment table above.
- **Why this action is required:** Coolify needs repository access and the build variables — that is account access only you hold.
- **What happens immediately afterward:** Coolify builds the image and serves the app; it is reachable on the Coolify-generated URL even before DNS.

### CEO ACTION 5 — Point the subdomain

- **System:** your DNS provider for `hermanlegacygroup.com`
- **Exact screen:** DNS management → Records
- **Exact button or field:** Add record — Type `A`, Name `bti`, Value = your Coolify server's public IP, TTL `300`.
- **Exact value to enter:** the Coolify server IP (Coolify → Servers).
- **Why this action is required:** Only you control the domain's DNS; this makes `bti.hermanlegacygroup.com` resolve to the app and lets Coolify issue TLS.
- **What happens immediately afterward:** `https://bti.hermanlegacygroup.com` serves the app over HTTPS. You sign in, create a business, run the analysis, view findings + recommendations, generate the blueprint and proposal, sign out, sign back in, and your saved business and results are still there — the Definition of Done.

---

## Definition of Done — how it will be verified

After the five actions, the live checklist is: open `https://bti.hermanlegacygroup.com` → **sign in** → **create a business** (with website) → **run the analysis** → **review evidence-backed findings** → **review Herman Legacy recommendations** → **generate the Executive Blueprint** → **generate the proposal** → **close the browser** → **sign in again and retrieve the saved business and results.** The database round-trip behind steps "create/save/retrieve" is already proven in tests; the remaining unknowns are purely the four account-gated setup steps above.
