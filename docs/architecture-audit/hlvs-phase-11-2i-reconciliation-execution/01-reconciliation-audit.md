# XI-2I · Reconciliation audit report (permanent governance record)

**Phase:** XI-2I · **Date:** 2026-07-31 · **Mechanism:** Option D (repository filename
reconciliation) · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Commit reference:** the XI-2I reconciliation commit on the branch above (this report is
part of that commit). **ADR reference:** [ADR-0002](../../architecture/decisions/0002-migration-lineage-governance.md) + its XI-2I addendum.

Production was **not** modified. Migration 0028 was **not** applied. No merge, no deploy,
no preview created.

## What was done

Repository migration files `0023–0027` were renamed (via `git mv`, so git records them as
100%-similarity renames and `git log --follow` preserves each file's history) from their
old version identifiers to **production's applied version identifiers**. **No SQL or
migration content was changed** — proven below by identical content SHA-256 before and
after each rename.

## Per-migration audit record

| Ordinal | Original filename                                         | New filename                                              | Old version      | New version      | SHA-256 before      | SHA-256 after       | Identical | Normalized SQL md5  |
| ------- | --------------------------------------------------------- | --------------------------------------------------------- | ---------------- | ---------------- | ------------------- | ------------------- | :-------: | ------------------- |
| 0023    | `20260727090000_hlbos_0023_blueprint_engine.sql`          | `20260728181327_hlbos_0023_blueprint_engine.sql`          | `20260727090000` | `20260728181327` | `c25d6e338afd357f…` | `c25d6e338afd357f…` |    ✅     | `f7ac093f429399f7…` |
| 0024    | `20260727090100_hlbos_0024_commerce_provisioning.sql`     | `20260728182035_hlbos_0024_commerce_provisioning.sql`     | `20260727090100` | `20260728182035` | `0ffef225b007cb47…` | `0ffef225b007cb47…` |    ✅     | `984e33a8e0a50888…` |
| 0025    | `20260727090200_hlbos_0025_hlvs_factory.sql`              | `20260728182459_hlbos_0025_hlvs_factory.sql`              | `20260727090200` | `20260728182459` | `fd30da2193c8b960…` | `fd30da2193c8b960…` |    ✅     | `6d9642bdefb1cba0…` |
| 0026    | `20260727090300_hlbos_0026_bti_platform.sql`              | `20260728182832_hlbos_0026_bti_platform.sql`              | `20260727090300` | `20260728182832` | `e9bc7036fd5e8a59…` | `e9bc7036fd5e8a59…` |    ✅     | `56d7affd729a75a1…` |
| 0027    | `20260728090000_hlbos_0027_bti_intake_and_public_api.sql` | `20260728182949_hlbos_0027_bti_intake_and_public_api.sql` | `20260728090000` | `20260728182949` | `34c58af64d00a1c5…` | `34c58af64d00a1c5…` |    ✅     | `386591edb1080bbc…` |

## Proof the SQL is identical

1. **Content SHA-256 before == after** for every file (column pair above) — a rename
   cannot change bytes; verified programmatically against the pre-rename lineage manifest.
2. **Normalized SQL md5** (comments + whitespace stripped) equals the value captured from
   **production's stored statements** in XI-2F for each migration — the SQL semantics are
   identical to what production actually ran.
3. **New version == production applied version** for all five (confirmed by a read-only
   query of `supabase_migrations.schema_migrations` — see
   [02-ci-verification-and-alignment.md](02-ci-verification-and-alignment.md)).

## Justification

Production is the canonical, authoritative record (ADR-0001; verified in XI-2E). The repo
had drifted on the `0023–0027` version identifiers only (XI-2F: SQL identical). Aligning
the repository to production (Option D) is the least-invasive, vendor-aligned reconciliation
(XI-2G, XI-2H): it touches nothing in production, preserves the repo's hand-authored
migrations and `-- rollback:` blocks, and leaves one clean lineage where file version ==
applied version. The move was executed forward-only via `git mv` (no Git history rewrite).

## Related correctness fix surfaced this phase (disclosed)

Running `scripts/check-migrations.sh` (the repo's migration linter, a CI job) during this
phase revealed that **migration 0028 was missing the repo-required `-- rollback:` block** —
a latent defect from Phase XI-2C that earlier local gate runs (format/lint/typecheck/test)
did not exercise. A `-- rollback:` block was added to 0028. It is **comment-only**: 0028's
normalized-SQL md5 is **unchanged** (`ef0fb2ccad87693ae382c55bd04990a2` before and after),
so the executable DDL is byte-identical; only its content SHA-256 (and thus its manifest
entry) changed. This is disclosed here per the platform honesty rules ("bugs found by
testing our own guards get named").

## Governance artifacts updated

- `.hlbos/migration-lineage.json` — regenerated; `0023–0027` now carry the production
  versions; their content SHA-256 is **unchanged** (proof of content preservation);
  `productionAppliedVersion` cleared; `0028` SHA-256 updated for the rollback comment.
- `.hlbos/canonical.json` — active `knownMigrationDrift.entries` emptied; the history moved
  to a `resolvedMigrationDrift` record.
- `scripts/__fixtures__/migration-list-sample.txt` — updated to the reconciled reality
  (`0023–0027` local == remote; `0028` pending).
