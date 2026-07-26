# Phase 1 · Deliverable 2 — Environment Reconciliation Report

**Date:** 2026-07-26 · **Checkpoint:** 1 · **Status:** inspection + documentation (no production change)

Classification: **Operational · Partially operational · Configured-unverified · Missing · Blocked-by-access · Requires-CEO-approval.**

---

## 1. Environment & hosting inventory

| Area                                | State                                                                                | Classification                           | Evidence                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------- |
| Local dev (Next.js control-center)  | Runs on :4000 via `control-center.bat`                                               | Operational                              | `scripts/control-center.bat`, app README          |
| Local Supabase stack                | `supabase start` + local pgTAP harness                                               | Operational                              | `supabase/config.toml`, `scripts/local-test/`     |
| HL-BOS Core dev/prod target         | `mvvtngiopdrgiedjmhfb` — 17 migrations live, 49 tables                               | Operational (DB); pre-production data    | live catalog; ADR-0001                            |
| Staging environment                 | Not introduced (branching preferred)                                                 | Missing                                  | `environments.md`                                 |
| Preview (Supabase branch)           | Not created; branching not verified enabled                                          | Configured-unverified                    | `environments.md`, `phase-2-migration-set.md` §13 |
| Frontend hosting                    | None chosen (no Vercel/Coolify config)                                               | Missing / Requires-CEO-approval          | repo has no host config                           |
| Worker (edge fn) hosting            | Supabase Edge runtime; **0 functions deployed**                                      | Missing (deploy)                         | `list_edge_functions` = []                        |
| Coolify configuration               | None present anywhere                                                                | Missing (and not planned)                | repo grep: no Coolify refs                        |
| GitHub Actions CI                   | 4 validation jobs; no deploy job                                                     | Operational (validation)                 | `.github/workflows/ci.yml`                        |
| Protected migration/deploy workflow | **Authored this checkpoint** (`db-migrate.yml`, `deploy.yml`), inert until armed     | Configured-unverified (needs CEO to arm) | this checkpoint                                   |
| Env-variable handling               | `@hl-bos/config` sole reader; classification-enforced; ESLint bans raw `process.env` | Operational                              | `packages/config`, `eslint.config.mjs`            |
| DB migration process                | Locally validated in CI; production apply was **out-of-band**                        | Partially operational                    | `ci.yml`, live migration list                     |
| Edge Function deployment            | No process exists (now scaffolded, inert)                                            | Missing → Configured-unverified          | this checkpoint                                   |
| Rollback procedures                 | Documented per-migration (`-- rollback:` blocks); no operational deploy rollback     | Partially operational                    | migrations; `03-deployment-and-migration-plan.md` |
| Branch protection                   | `main` protected (assumed per `CONTRIBUTING.md`); not API-verified this session      | Configured-unverified                    | `CONTRIBUTING.md`                                 |

## 2. Stale project-reference reconciliation

**Canonical (correct) references — left unchanged:**

- `supabase/migrations/…_hlbos_0007_…sql`, `…_0008_…sql` (header comments cite `mvvtngiopdrgiedjmhfb` as reconciliation source).
- `apps/control-center/src/components/ConnectForm.tsx:71` — placeholder `mvvtngiopdrgiedjmhfb`.
- `docs/operations/phase-2-implementation-report.md`, `PR_BODY_phase2.md` — already note the change.

**Stale references — corrected this checkpoint (banner + fix, history preserved):**
| File | Was | Action |
| --- | --- | --- |
| `docs/operations/environments.md` | `ywrzgursvdowzyhipsmt` as production (table + preview/prod rows + URL) | Table corrected to `mvvtngiopdrgiedjmhfb`; banner added |
| `docs/operations/migration-plan.md` | greenfield = `ywrzgursvdowzyhipsmt` | Correction banner added |
| `docs/operations/phase-2-migration-set.md` | Target `ywrzgursvdowzyhipsmt` | Correction banner added |
| `docs/operations/bootstrap-first-platform-owner.md` | Target `ywrzgursvdowzyhipsmt` | Target corrected + banner |
| `docs/architecture/permission-model.md` | Target `ywrzgursvdowzyhipsmt` | Target corrected + banner |

**No secret or runtime configuration hardcoded either ref**, so no code/config change was needed beyond docs. `.env.example` uses a placeholder URL; project refs are runtime-supplied via `@hl-bos/config`.

## 3. Services/apps that may still reference the empty project

Verified from the repository:

- **In-repo:** none point at `ywrzgursvdowzyhipsmt` after this checkpoint except the historical docs (now bannered).
- **Out-of-repo (cannot verify from here, must be checked by CEO):** any `.env.local` on Keith's machine, the Supabase↔GitHub integration link, any deployed frontend, DNS, or a management-API token scoped to the empty project. These are enumerated in the retirement-readiness report (`04-…`).

## 4. Missing access / cannot verify from this session

- Branch-protection settings on `main` (GitHub settings API not exercised).
- Whether Supabase branching is enabled on the canonical project.
- Any external `.env.local`, deployed host, or DNS pointing at either project.
- Legacy project `bkfsjhhclbqrhaolvhmz` (out of scope, unreachable).

## 5. Deployment readiness verdict

**Partially operational.** Local dev and CI validation are solid. Production migration and edge-function deployment now have _authored, inert_ protected workflows but are **not armed** — they require the CEO to create the `production` GitHub Environment (with required reviewers), add the `SUPABASE_ACCESS_TOKEN` secret, and set the `SUPABASE_PROJECT_REF` variable. Frontend/worker hosting is undecided. No environment is production-ready for external users yet.
