<!-- Recovered/written 2026-11-04 on branch recovery/hlbos-production-2026-11. Status: PROPOSED — takes effect when this PR is approved and merged. -->

# Migration policy — HL-BOS Core

## 1. One ledger

The database's `supabase_migrations.schema_migrations` table and the repository's `supabase/migrations/` directory must list the same versions with the same bodies. Today they do not (see `supabase/recovery/production-2026-11/migrations/REPO_DIFF.md`). Closing that gap is the first migration task for every schema owner; until a schema's ledger rows are committed unchanged, no new migration may touch that schema.

Repository migration directory today: supabase/migrations/ (54 files, stamped `YYYYMMDDHHMMSS_hlbos_NNNN_name.sql`).

## 2. Writing a migration

- File name: `YYYYMMDDHHMMSS_<product>_<NNNN>_<short_name>.sql`. The timestamp is the version and is **never changed after the file is applied anywhere**. Applied migrations are never renumbered, edited or squashed; corrections are new forward migrations (`…r01`, `…r02` is the convention production already uses).
- One concern per file. Enabling an extension, scheduling a cron job and defining a function are three files, because production has shown they are applied — and fail — separately.
- Every `create policy` ships with the matching `alter table … enable row level security` and, for tables only service code should write, `force row level security`.
- Every `security definer` function sets `search_path` and ends with `revoke execute … from public, anon` plus an explicit grant. Trigger functions are never executable by `anon`, `authenticated` or `public` (SEC-3 was exactly this).
- No migration contains a secret, token, URL with credentials, or customer data. Seed files containing real customer or partner names are not migrations.
- Comments are kept. The production ledger shows comment-stripped copies; the repository copy is the one with the reasoning.

## 3. Applying a migration

- **Never by hand, never from a laptop, never from an AI session.** Applying is a CI job with a human approval gate (HL-BOS: `.github/workflows/db-migrate.yml` with a `production` environment and required reviewers; other repos: adopt the same file).
- The approval request states: the files, the schema owner, the backup taken, the validation query that will be run after, and the rollback (a forward migration, written before applying).
- Order of operations: backup → apply to a Supabase branch or empty project → run the test suite (`pnpm test` (vitest) and `supabase/tests` (77 pgTAP tests) — both exist on `main`) → approval → apply to production → run the validation query → record the result in the PR.

## 4. Proposed next step (not done)

Rehearse a restore from `supabase/recovery/production-2026-11/migrations/` into an empty project and diff the catalog against production. Until that rehearsal has been run and its differences recorded, the archive is "source recovered", not "recovery validated".

## 5. Who may approve

Applying any migration to `mvvtngiopdrgiedjmhfb` is a Level B change: prepared by the engineer, approved by the CEO, with the package format defined in `docs/operations/production-recovery.md`.
