# Phase 1 · Deliverable 3 — Deployment and Migration Plan

**Date:** 2026-07-26 · **Checkpoint:** 1 · **Canonical project:** `mvvtngiopdrgiedjmhfb` (ADR-0001)

This plan closes the governance gap found in Phase 0: the 17 migrations reached the canonical project **out-of-band**, and CI had no deploy path. Two protected, manual-only workflows are introduced. Neither can touch production until the CEO arms them.

---

## 1. CI (unchanged, validation-only)

`.github/workflows/ci.yml` runs on every PR/push to `main`: `validate` (format/lint/typecheck/unit/build), `secret-scan` (gitleaks + NEXT_PUBLIC guard), `database-tests` (real Supabase stack, `db reset`, `supabase test db`, `db lint`), `migrations` (`check-migrations.sh`). CI **never** applies or deploys anything.

## 2. Protected migration workflow — `.github/workflows/db-migrate.yml`

Manual (`workflow_dispatch`) only. Jobs:

1. **validate** — no secrets; proves the set applies from empty + pgTAP passes + migration-name/rollback/secret checks.
2. **drift-check** — read-only `supabase migration list` against the canonical project (skipped until armed); surfaces drift between repo and remote.
3. **apply** — runs only when `mode=apply`, after validate+drift, and **behind the `production` GitHub Environment's required-reviewer gate**. Uses `supabase db push` (forward-only). Refuses to run if the target ref is unset.

**Approval gate = GitHub Environment `production` required reviewers.** No auto-apply on merge, ever.

## 3. Protected deployment workflow — `.github/workflows/deploy.yml`

Manual only. Deploys Edge Functions (`ai-gateway`, `events-dispatcher`, `billing-webhook`) behind the same `production` environment gate. No app-deploy job yet — frontend/worker hosting is undecided (see §7).

## 4. Arming prerequisites (CEO actions — one time)

1. **Create GitHub Environment `production`** with **required reviewers** (Settings → Environments). This _is_ the manual approval gate.
2. **Add repo secret `SUPABASE_ACCESS_TOKEN`** (Supabase personal access token). Secret value never enters the repo or logs.
3. **Add repo variable `SUPABASE_PROJECT_REF` = `mvvtngiopdrgiedjmhfb`** (non-secret).
   Until all three exist, both workflows are inert (apply/deploy jobs refuse or stay gated).

## 5. Migration procedure (target state)

1. Author migration in a branch per `check-migrations.sh` rules (`<ts>_hlbos_<NNNN>_<desc>.sql`, `-- rollback:` block, no secrets, `-- approved-destructive:` for any DROP/TRUNCATE).
2. Open PR → CI validates from empty + pgTAP.
3. Merge to `main`.
4. Run **DB migrate → validate** (dry check) → then **apply** with reviewer approval.
5. `migration list` recorded in the run log.

## 6. Rollback & forward-repair

| Target                   | Strategy                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database migrations      | **Forward-repair.** Never destructive rollback against data — ship a new `hlbos_<n>_*` migration that corrects state. Each migration's `-- rollback:` block documents the inverse for pre-data/dev use only. |
| Edge Functions           | Redeploy the previous function version (re-run `deploy.yml` from the prior commit). Functions are stateless.                                                                                                 |
| Environment config       | Revert the GitHub variable/secret; re-run deploy.                                                                                                                                                            |
| Scheduled jobs (pg_cron) | Disable the cron entry (Checkpoint 2 concern).                                                                                                                                                               |
| Frontend/workers         | Re-deploy previous build once a host is chosen.                                                                                                                                                              |

## 7. Open hosting decisions (Requires CEO)

- **Frontend + worker host** — not chosen (no Vercel/Coolify in repo). Needed before external users (Decision D-10). Until then, no app-deploy job is added.
- **DNS / custom domains** — out of scope until hosting is chosen; a STOP condition if required.

## 8. What this checkpoint did NOT do

No migration applied. No function deployed. No secret created. No environment armed. The workflows are committed as inert scaffolding for CEO review.
