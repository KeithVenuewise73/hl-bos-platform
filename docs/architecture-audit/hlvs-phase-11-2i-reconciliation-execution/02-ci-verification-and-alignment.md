# XI-2I · CI verification report + production alignment confirmation

## CI / gate verification (exact results, this phase)

| Check                           | Command                              | Result                                                                       |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Migration filename/content lint | `scripts/check-migrations.sh`        | ✅ **OK: all migration checks passed** (after adding 0028's rollback block)  |
| Lineage governance              | `pnpm lineage` (`check-lineage.mjs`) | ✅ 28 migrations sequential, monotonic, checksum-locked, registry-consistent |
| Online drift-check (fixture)    | `check-lineage-drift.mjs --file …`   | ✅ reconciled reality: 27 applied == remote, 0028 pending                    |
| Format                          | `pnpm format:check`                  | ✅ clean                                                                     |
| Lint                            | `pnpm lint`                          | ✅ clean                                                                     |
| Typecheck                       | `pnpm typecheck`                     | ✅ clean (8 projects)                                                        |
| Unit tests                      | `pnpm test`                          | ✅ **247 / 247**                                                             |

> Note: `supabase db reset` + pgTAP (the empty-DB apply job) runs in CI on GitHub, not
> reproduced locally here; the rename preserves ordering (0022 `20260726…` < 0023–0027
> `20260728…` < 0028 `20260731…`) and content, so the from-empty apply is unaffected.

## Migration numbering / ordering (post-rename)

- Ordinals `0001…0028` contiguous, no gaps, no duplicates. ✅
- Version identifiers strictly increasing with ordinal. ✅
- `0023–0027` moved from `20260727…/20260728090000` to `20260728181327…182949`, still
  after `0022` and before `0028`. ✅

## No SQL content changed

- `0023–0027`: content SHA-256 **before == after** (see [01](01-reconciliation-audit.md)).
- `0028`: DDL unchanged — normalized-SQL md5 identical before/after the rollback-comment
  addition; only a comment block was added.

## Production alignment confirmation (read-only)

Production `mvvtngiopdrgiedjmhfb` was **not modified** this phase. A read-only query of
`supabase_migrations.schema_migrations` returns, for `0023–0027`:

| Ordinal | Production applied version | Repo file version (post-rename) | Aligned |
| ------- | -------------------------- | ------------------------------- | :-----: |
| 0023    | `20260728181327`           | `20260728181327`                |   ✅    |
| 0024    | `20260728182035`           | `20260728182035`                |   ✅    |
| 0025    | `20260728182459`           | `20260728182459`                |   ✅    |
| 0026    | `20260728182832`           | `20260728182832`                |   ✅    |
| 0027    | `20260728182949`           | `20260728182949`                |   ✅    |

**Repository and production migration identity are now fully aligned** for the applied
lineage (`0001–0027`). The only repo migration not on production is `0028` (correctly
pending). `supabase migration list` would now show `0023–0027` as local == remote and
`0028` as local-only — the intended post-reconciliation state.
