# Deliverable 2 — Environment and Repository Map

**Audit:** VisibilityAI Phase 0
**Date:** 2026-07-26
**Method:** repository inspection + live Supabase catalog reads + GitHub API. Read-only.

---

## 1. Repository

| Property                    | Value                                                                          | Evidence                       |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Repo                        | `KeithVenuewise73/hl-bos-platform`                                             | `git remote -v`                |
| Default branch              | `main` (protected)                                                             | `CLAUDE.md`, `CONTRIBUTING.md` |
| Package manager             | `pnpm@10.34.5`, Node ≥22                                                       | `package.json`                 |
| Build system                | Turborepo (`turbo.json`)                                                       | repo root                      |
| Monorepo layout             | `apps/*`, `packages/*` (pnpm workspace + catalog)                              | `pnpm-workspace.yaml`          |
| Working branch (this audit) | `claude/hl-bos-architecture-audit-jrx1ss`                                      | assignment                     |
| HEAD at audit               | `45c3418` "Merge PR #14: Billing (0015–0016) + VisibilityAI Assessment (0017)" | `git log`                      |

### 1.1 Merged pull-request history

| PR     | Title                                                          | Merged        |
| ------ | -------------------------------------------------------------- | ------------- |
| #1     | Phase 1: HL-BOS Core Monorepo Foundation                       | 2026-07-16    |
| #5, #6 | Phase 2: Identity, Tenancy, Permissions & Audit                | 2026-07-16/17 |
| #13    | VisibilityAI V0 — reusable shared primitives + module boundary | 2026-07-26    |
| #14    | Billing (0015–0016) + VisibilityAI Assessment (0017)           | 2026-07-26    |

Open PRs #2–4, #7–12 are all **Dependabot** dependency bumps (React, supabase-js, turbo, prettier, typescript-eslint, GitHub Actions). None are functional.

---

## 2. Applications

| App                                | Path                  | Status                                                                                                              | Evidence                                                          |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **CEO Development Control Center** | `apps/control-center` | Built, **local-only by design** (never deployed; Server Actions origin-locked to localhost; shells out to git/pnpm) | `apps/control-center/next.config.ts`, `README.md`, `package.json` |

There is **one** application. No customer-facing app, admin portal, or VisibilityAI UI exists yet.

## 3. Packages

| Package          | Path              | Responsibility                                                                                                                 | Evidence                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `@hl-bos/config` | `packages/config` | The only sanctioned reader of `process.env`; validated + classified env (`ENV_SPEC`, Zod), server/browser classification guard | `packages/config/src/{env,classification}.ts` |

One package. The target architecture names ~14 packages; the repo deliberately creates a package only when it has a real job (`README.md`).

## 4. Databases / Supabase projects

Three projects exist in the Herman Legacy estate. Only two are reachable from this session's token.

| Project                                  | Ref                    | Region / PG      | Reachable             | State (verified)                                             | Role                                                                      |
| ---------------------------------------- | ---------------------- | ---------------- | --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **HL-BOS Core**                          | `mvvtngiopdrgiedjmhfb` | us-west-2 / 17.6 | ✅                    | **17 migrations applied; 49 tables; seed data; 1 auth user** | **Canonical / where work actually landed**                                |
| keith@venuewise.net's Project            | `ywrzgursvdowzyhipsmt` | us-east-1 / 17.6 | ✅                    | **0 migrations, 0 tables (empty)**                           | The ref named "canonical production" in `environments.md`, but never used |
| Herman Legacy Business Platform (legacy) | `bkfsjhhclbqrhaolvhmz` | —                | ❌ Not in token scope | 156 tables (per prior audit); has live SEC-1                 | Out of scope per `CLAUDE.md`; excluded                                    |

Both reachable projects are in the same Pro org (`ihtsbcxtvkbfkkpmforp`).

> **⚠️ Canonical-project conflict (STOP-condition class).** The docs (`environments.md`, `migration-plan.md`, `bootstrap-first-platform-owner.md`) declare `ywrzgursvdowzyhipsmt`/us-east-1 the canonical production project and state it is empty and awaiting the first apply. In reality, the 17 migrations are live on `mvvtngiopdrgiedjmhfb`/us-west-2 ("HL-BOS Core"), and `ywrzgursvdowzyhipsmt` is still empty. The two newest docs (`phase-2-implementation-report.md` §9, `PR_BODY_phase2.md`) already flag this. **This must be reconciled by the CEO** — see Deliverable 11, Decision D-1. It is not a blocker for VisibilityAI development (the live project is unambiguous), but the docs are wrong and the empty project should be retired or repurposed.

## 5. Environments (intended topology)

`HL_BOS_ENV` enum: `local | preview | staging | production` (`.env.example`, `@hl-bos/config`).

| Environment | Intended                                       | Actual state                                                                      | Evidence                                          |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Local       | Supabase local stack + control-center on :4000 | Configured; local pgTAP harness works                                             | `supabase/config.toml`, `scripts/local-test/`     |
| Preview     | Supabase per-PR branch                         | **Not created; Supabase branching not enabled**                                   | `environments.md`, `phase-2-migration-set.md` §13 |
| Staging     | Deliberately rejected in favor of branching    | Not introduced                                                                    | `environments.md`                                 |
| Production  | Protected manual-approval apply workflow       | **No deploy pipeline exists;** migrations were applied out-of-band to HL-BOS Core | `.github/workflows/ci.yml` (no deploy job)        |

**Hosting:** No Vercel, no Coolify, no container host is referenced anywhere in the repo or docs. Application hosting for the future customer-facing app is **undecided** (the only app today is local-only). Supabase + the Supabase↔GitHub integration is the only external platform named.

## 6. CI/CD

`.github/workflows/ci.yml` — triggers on PR and push to `main`. Four jobs, **validation only, no deploy step:**

1. `validate` — install, TS-pin check, `format:check`, `lint`, `typecheck`, `test` (unit), `build`.
2. `secret-scan` — `gitleaks` + `check-no-public-secrets.sh`.
3. `database-tests` — `supabase start` → `db reset` → **`supabase test db`** (the pgTAP suite) → `db lint`.
4. `migrations` — `check-migrations.sh` (naming, rollback block, no secrets, no duplicate ordinals).

CI proves the migrations apply from empty and the tests pass; it **does not** deploy migrations or edge functions to any Supabase project.

## 7. External services referenced

| Service                                    | How referenced                                                             | Status                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Supabase (DB, Auth, Vault, Edge, Storage)  | `config.toml`, migrations, edge functions, `@hl-bos/config`                | Active (DB); Auth used; Vault referenced; Edge/Storage not deployed/created |
| GitHub                                     | control-center GitHub REST client; CI                                      | Active                                                                      |
| Anthropic                                  | `ai.providers` seed (`vault:anthropic_api_key`), `_shared/ai/anthropic.ts` | Seeded **inactive**; adapter real but inert (no key)                        |
| Stripe                                     | `billing.providers` seed, `_shared/billing/stripe.ts`                      | Seeded **inactive**; adapter is a stub (501)                                |
| Google (Business/Search Console/PageSpeed) | `integrations.connectors` seed                                             | Catalog rows only; no connection code                                       |
| Twilio / Email                             | Deferred (not in `.env.example`)                                           | Not present                                                                 |

## 8. Missing access / verification limits

| Item                                           | Why it matters                                                   | Status                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Legacy Supabase project `bkfsjhhclbqrhaolvhmz` | Holds the "duplicate foundations" (hlvs/hscs_glp) and live SEC-1 | **Unreachable** from this token; out of scope per `CLAUDE.md` |
| Edge Function deployed source                  | To confirm runtime behavior                                      | 0 functions deployed; source inspected instead                |
| Supabase Vault secret values                   | Confirm keys granted                                             | Not enumerated (and must not be); refs only                   |
| Application hosting target                     | Where the VisibilityAI app will run                              | Not decided anywhere in repo                                  |
