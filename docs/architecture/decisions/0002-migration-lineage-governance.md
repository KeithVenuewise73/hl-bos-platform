# ADR-0002 · Migration lineage governance

**Status:** Accepted · **Date:** 2026-07-31 · **Phase:** XI-2F
**Supersedes/extends:** builds on [ADR-0001](0001-canonical-hl-bos-supabase-project.md)
(canonical project = `mvvtngiopdrgiedjmhfb`).

## Context

Phases XI-2D/XI-2E surfaced two lineage hazards:

1. A **stale preview branch** (`hlbos-m1-portfolio`) carrying a superseded
   portfolio/govcon lineage was mistaken for a faithful copy of production, producing a
   wrong conclusion about what production runs.
2. Migrations **0023–0027** carry different version identifiers in the repo than
   production applied (a bookkeeping drift; SQL proven identical in XI-2F). Left
   undetected, this would break `supabase db push`.

Nothing in the repo made the canonical lineage, canonical project, or expected applied
state **machine-checkable**, so drift could only be caught by human audit.

## Decision

Adopt a **checksum-locked, self-verifying migration lineage** and a **single
machine-readable canonical registry**, enforced in CI:

1. **`.hlbos/canonical.json`** — the source of truth: canonical repository, canonical
   project ref, the environment registry (production / abandoned-preview / parked /
   legacy), foundation ordinals, not-yet-applied ordinals, and any recorded
   `knownMigrationDrift`.
2. **`.hlbos/migration-lineage.json`** — a generated manifest locking every migration's
   `sha256` + version + ordinal.
3. **`scripts/check-lineage.mjs`** (offline, in `ci.yml`) — enforces contiguous
   ordinals, monotonic version identifiers, the checksum lock, and canonical
   consistency. `--write` regenerates the manifest; the diff is the audit trail.
4. **`scripts/check-lineage-drift.mjs`** (online, in the gated `db-migrate` drift-check)
   — asserts production's applied set equals the canonical declaration; fails on
   foreign/out-of-band versions.
5. **Target guards** in `db-migrate.yml` — link/apply refuse any project ref that is not
   `canonical.canonicalProjectRef`.

The rule for changing migrations: **run `pnpm lineage:write` and commit the manifest in
the same PR.** An unexplained checksum change is a red flag, by design.

## Consequences

- **Positive:** migration identity drift, duplicate numbers, checksum mismatches, silent
  edits, unexpected production divergence, and wrong deployment targets are all caught
  automatically. The canonical lineage and target are declared in one reviewable file.
- **Accepted cost:** adding/altering a migration now requires regenerating the manifest
  (one command); the manifest diff must be reviewed. This is the intended friction.
- **Non-goals:** this does not apply, repair, or deploy anything. The `0023–0027` repair
  and the stale-branch deletion are separate, approved, forward-only steps (see the
  XI-2F repair strategy). Production history is never rewritten.
- **Boundary with ADR-0001:** ADR-0001 names the canonical project; ADR-0002 makes that
  naming enforceable and extends it to the whole lineage.

---

## Addendum · Phase XI-2I (2026-07-31) — reconciliation executed + vendor alignment

_Appended; the decision above is unchanged._

- **Executed the `0023–0027` reconciliation (Option D).** Repo files were renamed to
  production's applied version identifiers via `git mv` (content byte-identical; SHA-256
  before == after). Full evidence:
  [hlvs-phase-11-2i-reconciliation-execution/01-reconciliation-audit.md](../../architecture-audit/hlvs-phase-11-2i-reconciliation-execution/01-reconciliation-audit.md).
  The active `knownMigrationDrift` in `.hlbos/canonical.json` is now empty; the history is
  preserved under `resolvedMigrationDrift`.
- **Vendor alignment (Phase XI-2H).** Repo-side filename reconciliation is the
  content-preserving realization of Supabase's official _align-local-to-authoritative-remote_
  recovery (`db pull` reaches the same end-state but discards hand-authored migrations).
  **`supabase migration repair` and `supabase db pull` are the sanctioned tools for the
  reverse scenario** — when the **remote** migration history is wrong and must be corrected.
  Mutating `schema_migrations` from inside a migration remains prohibited.
- **Correctness fix disclosed.** Running `scripts/check-migrations.sh` this phase surfaced
  that migration `0028` lacked the required `-- rollback:` block (latent since XI-2C); a
  comment-only rollback block was added (normalized-SQL md5 unchanged). This is the
  governance working as intended — a guard caught a real omission.
