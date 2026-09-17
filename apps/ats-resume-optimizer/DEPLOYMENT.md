# ATS Resume Optimizer — Herman Legacy Cloud (Coolify)

Target: the existing Coolify server and the HL-BOS Supabase project `mvvtngiopdrgiedjmhfb`. No new server, no new database, no second account system.

---

## Why this app cannot simply be switched on

It was built local-first: no login, and each career database in a JSON file on the machine running it. That is correct for a tool you start from the Control Center on your own desktop, and dangerous on a public URL — a career database is a resume, an employment history, and a record of every job you applied for and were rejected from.

Two things therefore changed before any deployment config was written:

1. **It now requires a sign-in whenever it is not running on your own machine**, using the same Supabase Auth the rest of the platform uses.
2. **It refuses to start if it finds itself deployed with no way to sign in.** Not a warning — it serves a page explaining what is missing and nothing else. Forgetting one environment variable must not be the difference between private and public.

Both are unit-tested (`src/lib/deployment.test.ts`) and were verified by running the exact command the container runs.

## What is built and proven

| Piece                          | Status         | Proof                                                                                                                                                          |
| ------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in (Supabase Auth)        | Built          | `/login`; publishable key only, never a service-role key                                                                                                       |
| Fail-closed deployment guard   | Built + tested | 7 unit tests; `refuse` verified by running the built server with no provider configured — all seven routes redirect to `/unavailable`, zero career data served |
| Per-account isolation          | Built          | One store file per account id; two signed-in people never share a database                                                                                     |
| Container                      | Built          | `apps/ats-resume-optimizer/Dockerfile`, standalone Node SSR, non-root, volume at `/data`                                                                       |
| Browser bundle carries the key | Verified       | Built with a probe value and confirmed it is inlined into the client chunk — sign-in works in a browser, not just on the server                                |
| Health check                   | Built          | Distinguishes `refusing` / `waiting` / `ok`; returns 200 for the first two so the platform does not restart-loop and hide the explanation page                 |

**What is NOT yet true:** nothing is running at a URL. The remaining steps need accounts only you control.

---

## Persistence — read this before the first deploy

The app stores each account's career database as a JSON file under `ATS_DATA_DIR` (the image defaults to `/data`). **A container filesystem does not survive a redeploy.** Without a persistent volume mounted at `/data`, every deployment silently destroys the stored resumes, analyses and applications.

In Coolify: **Storages → Add → Persistent Volume**, mount path `/data`.

This is the interim shape. The PostgreSQL schema that replaces it (`ats`, 17 tables, applied to production on 2026-09-16) is installed and empty; moving the store onto it is the next piece of work and removes this footgun entirely.

---

## Environment variables (names only — no values in this repo)

| Variable                               | Where                        | Value                                                              |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Coolify **Build** variable   | `https://mvvtngiopdrgiedjmhfb.supabase.co`                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Coolify **Build** variable   | Supabase → Project Settings → API → publishable / anon key         |
| `HL_BOS_ENV`                           | Coolify **Runtime** variable | `production`                                                       |
| `ATS_DATA_DIR`                         | already set in the image     | `/data`                                                            |
| `ANTHROPIC_API_KEY`                    | Coolify **Runtime** variable | optional — without it the built-in rules engine runs every feature |

Both `NEXT_PUBLIC_*` values must be **build** variables: Next inlines them into the browser bundle at build time, so setting them only at runtime produces a sign-in page that cannot sign anyone in. Both are browser-safe by the platform's own `ENV_SPEC` — the publishable key is public by design and row-level security, not secrecy, is the boundary. No service-role key is used anywhere in this app.

## Coolify application configuration

| Setting                        | Value                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Source                         | GitHub `KeithVenuewise73/hl-bos-platform`, branch `main` |
| Build Pack                     | **Dockerfile**                                           |
| Dockerfile location            | `apps/ats-resume-optimizer/Dockerfile`                   |
| Base directory / build context | `/` (repository root — this is a pnpm workspace)         |
| Exposed port                   | **4600**                                                 |
| Health check path              | `/api/health`                                            |
| Persistent storage             | volume mounted at `/data`                                |
| Domain                         | a subdomain of `hermanlegacygroup.com`                   |

## DNS

| Type | Name                  | Value                             | TTL |
| ---- | --------------------- | --------------------------------- | --- |
| `A`  | your chosen subdomain | public IPv4 of the Coolify server | 300 |

(Or a `CNAME` to the Coolify hostname if it sits behind one.)

## The account

Sign-in uses Supabase Auth on the HL-BOS project. Create the user once in **Supabase → Authentication → Users**, or via the normal sign-up flow if you enable it. Until an account exists, the deployed app shows a sign-in page that nobody can pass — which is the correct failure, not a broken one.

## What "done" means

Deployment is complete when you can open the URL, sign in, see your own records, and still see them after a redeploy. Not before. Anything less gets reported as what it is.
