# Contributing to HL-BOS

## Golden rule

**GitHub is the source of truth.** Schema, policies, functions, Edge Functions and application code ship as reviewed commits in this repository.

This is not a stylistic preference. The production database currently carries 52 migrations that were applied from outside version control (see the [current state audit](docs/architecture/current-state-audit.md), finding M-2). Production is presently authoritative over the repo, which is exactly backwards. HL-BOS does not repeat that.

Do not use ad-hoc SQL, the Supabase dashboard, or an MCP tool as a permanent change mechanism.

## Branching

- `main` is protected. Never push to it directly.
- Branch per unit of work: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`.
- Open a PR. CI must be green before merge.

## Commits

Small and atomic. One reason to change per commit.

Conventional Commits: `type(scope): subject`.

The body explains **why**, not what — the diff already shows what. If a commit encodes a security or architecture decision, say so and cite the evidence. If it corrects an earlier mistake, name the mistake.

## Verification

Never describe something as working, passing or deployed unless it was actually executed.

```bash
pnpm check   # format:check + lint + typecheck + test
```

If you claim a test passes, run it and paste the real output. "Should work" is not a result. This applies to PR descriptions and to phase reports.

## Dependencies

Read [`docs/architecture/dependency-policy.md`](docs/architecture/dependency-policy.md) first.

- Exact pins in the `catalog:` block of `pnpm-workspace.yaml`. Packages reference `catalog:`.
- No `latest`. No `^`, no `~` in the catalog.
- Never disable `strict-peer-dependencies` to make an install pass. Fix the tree.
- Verify a version exists (`npm view <pkg> version`) before pinning it. Do not assume related packages share a version — `@eslint/js` does not track `eslint`, and `@types/react` does not track `react`.
- Dependency bumps are their own commit, with compatibility evidence in the message.

## Adding a package

Only add a package when it has all of:

1. a defined responsibility that is genuinely shared
2. a public interface
3. documentation
4. tests

**Do not create empty packages to make the tree look complete.** An empty package is a liability: it implies a capability that does not exist.

Before creating any new table, service, provider integration or UI component, check whether a reusable one already exists. If you must duplicate, document why extension would be unsafe or inappropriate.

## Migrations

Naming is enforced by `scripts/check-migrations.sh`:

```
<timestamp>_hlbos_<NNNN>_<description>.sql
```

The `hlbos_` prefix is mandatory. The existing database has two independent counters both using `0009`–`0017`, so bare ordinals collide; the timestamp orders, the ordinal is for humans, the prefix prevents collision.

Every migration must:

- carry a `-- rollback:` block (CI rejects it otherwise)
- be idempotent where reasonable, and transaction-safe
- contain no secrets
- ship RLS policies **alongside** the tables they protect, not in a later migration
- carry an `-- approved-destructive:` marker for any `DROP`/`TRUNCATE`, which requires prior owner approval and an impact report

**Migrations are never auto-applied to production.** Production requires a protected workflow with explicit approval.

## Security

- Never commit a secret. CI runs gitleaks plus a dedicated `NEXT_PUBLIC_` secret check.
- Never prefix a private secret with `NEXT_PUBLIC_`. It is inlined into the client bundle.
- Read configuration through `@hl-bos/config`, never `process.env` directly. ESLint enforces this.
- The service-role key bypasses RLS. It is server-only, always.
- Report vulnerabilities per [SECURITY.md](SECURITY.md).
