# XI-2L · Migration evidence — 0028 applied to production

Direct evidence that migration 0028 was applied to canonical production
(`mvvtngiopdrgiedjmhfb`) correctly and at the exact repo version.

## The migration

|               |                                                                                |
| ------------- | ------------------------------------------------------------------------------ |
| File          | `supabase/migrations/20260731090000_hlbos_0028_knowledge_graph_read_model.sql` |
| sha256 (repo) | `f750be1862dd8aa3790898ee0633c609df14071eb9627c09b0a577a4d4fc476f`             |
| Lines         | 494                                                                            |
| Applied via   | migration path (`apply_migration`), full 0028 SQL, onto the existing 0001–0027 |
| Result        | **success**                                                                    |

## Version fidelity (repo ↔ production)

The apply tool auto-stamps a version from the current time. It recorded
`20260731041802`; the repo's canonical version is `20260731090000`. To keep the lineage
byte-identical (and the drift-check green), the ledger row was reconciled to the exact repo
version.

```
-- before reconciliation
version           name
20260731041802    hlbos_0028_knowledge_graph_read_model   <- tool-stamped current time

-- reconciliation
update supabase_migrations.schema_migrations
   set version = '20260731090000'
 where version = '20260731041802'
   and name = 'hlbos_0028_knowledge_graph_read_model';

-- after reconciliation (top of the applied set)
version           name
20260731090000    hlbos_0028_knowledge_graph_read_model   <- matches the repo exactly
20260728182949    hlbos_0027_bti_intake_and_public_api
```

## Applied set — before vs after

|                              | Before                  | After                   |
| ---------------------------- | ----------------------- | ----------------------- |
| Migration count              | **27**                  | **28**                  |
| Latest version               | `20260728182949` (0027) | `20260731090000` (0028) |
| `graph` schema               | absent                  | present                 |
| Total `identity.permissions` | 92                      | 95 (+3 graph keys)      |

Production's applied set is now `0001–0028`, matching the repository migration set exactly.
No other migration was applied; nothing in `0001–0027` was modified.

## Lineage governance — post-apply

- `.hlbos/canonical.json`: `notYetAppliedOrdinals` cleared (was `[28]`, now `[]`) with a
  dated note recording the 2026-07-31 apply at `20260731090000`.
- `.hlbos/migration-lineage.json`: regenerated; 0028's `notYetApplied` flag removed; sha256
  checksum lock **unchanged** (`f750be18…` — the migration file was not touched).
- `pnpm lineage` (offline governance: sequential ordinals, monotonic versions, checksum
  lock, canonical consistency): **green** — "28 migrations, sequential, monotonic,
  checksum-locked; canonical registry consistent."

Repo and production now agree on the full 0001–0028 set at identical version identifiers —
**no drift introduced**.
