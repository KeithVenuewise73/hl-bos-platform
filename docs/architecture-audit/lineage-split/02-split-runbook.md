# Split runbook — moving the product lineage off HL-BOS Core

**Audience: the engineer (me, in a later session), or CI. Not the CEO.** Nothing in here is
a task for Keith; the one thing that needs him is named at the bottom, and it is a decision,
not a command.

Evidence for every number: [01-separability-analysis.md](01-separability-analysis.md).

## Scope

**Moves:** `jobscout`, `dma`, `barberos`, `transform_audit` (60 tables, 959 rows) and the
17 `barberos_*` functions in `public`.

**Stays and gets adopted into `supabase/migrations`:** `disco`, and the `hlvs_board_*`,
`ingest_*`, `temp_perftest_*` migrations. These are HL-BOS Venture Studio work over
`vstudio`; see the analysis for why moving them is damage rather than separation.

## Order matters

Do not reorder. Each step is safe to stop after; none of steps 1–6 changes HL-BOS Core.

### 1 — Create the target project

`create_project` in the Herman Legacy org. Pro plan, so this adds roughly $10/month of
compute. Region is not load-bearing — there are no cross-project queries by design.

> Three attempts on 2026-09-17 timed out at 60s with nothing created. Check the dashboard
> before retrying, in case one landed late and a second would duplicate it.

### 2 — Extract the DDL from Core itself

The authoritative SQL is already in the database. Core stores every applied migration's
statements, so the DDL does not need to be reconstructed by hand or guessed from the
catalog:

```sql
select version, name, array_to_string(statements, E'\n') as sql
from supabase_migrations.schema_migrations
where name similar to '(dma|jobscout)_%'
   or name in (
     'hlbos_0048_barberos_capability_catalog',
     'hlbos_0049_transform_audit',
     'hlbos_0050_citext_guard_semantics',
     'hlbos_0051_unknown_is_not_complete',
     'hlbos_0052_barberos_owned_website',
     'hlbos_0053_barberos_public_site_read',
     'hlbos_0054_discovery_call',
     'hlbos_0055_proposal',
     'hlbos_0056_barberos_shop_api',
     'hlbos_0057_barberos_product_map',
     'hlbos_0058_barberos_client_crm'
   )
order by version;
```

Write each row to `supabase/products/migrations/<version>_<name>.sql` in **this**
repository — a directory of its own, so `scripts/check-lineage.mjs` (which governs
`supabase/migrations` and Core's ledger alone) does not treat them as Core migrations.

That directory is the deliverable that makes this split reviewable instead of a live-database
operation nobody can inspect.

### 3 — Sever the anchors, deliberately

The extracted SQL references tables that will not exist in the target. Decide per anchor and
record the decision in the file:

| Anchor                             | Count            | Recommended                                                                                                                                              |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform.tenants`                 | 1 tenant, 28 FKs | Create a minimal local `tenants` table and carry the single row. Keeps the column meaningful.                                                            |
| `auth.users`                       | 2 users, 10 FKs  | Re-map to the target project's own auth users via a two-row lookup. **Identities do not survive a project move** — a new project's users have new UUIDs. |
| `visibility.prospects`             | 50 rows, 5 FKs   | Carry the 50 rows, or drop the FK if BarberOS no longer needs prospect provenance.                                                                       |
| `visibility.assessment_categories` | reference data   | Carry it.                                                                                                                                                |
| `vstudio.opportunities`            | —                | Not applicable: `disco` is not moving.                                                                                                                   |

### 4 — Apply to the target and verify

Same standard as migration 0049: structural checks, then fail-closed checks by assuming the
role and setting JWT claims the way PostgREST does. A schema is not "moved" because the
tables exist; it is moved when `anon` still cannot read it.

### 5 — Move the `barberos_*` public API

17 functions, two of them `SECURITY DEFINER` and callable by `anon` — currently the only
anonymous-executable functions in the database. They query `barberos` tables, so leaving
them in Core after the tables move would leave a public API pointing at nothing.

Take the opportunity to review whether both genuinely need `anon`.

### 6 — Repoint the applications

**This is the gate.** Until it is done, nothing may be dropped from Core.

| Schema                         | Application                    | Status                                          |
| ------------------------------ | ------------------------------ | ----------------------------------------------- |
| `jobscout`                     | `KeithVenuewise73/hl-jobscout` | repo exists, not in this session's scope        |
| `dma`                          | `KeithVenuewise73/homehuddle`  | repo exists, not in this session's scope        |
| `barberos` + `transform_audit` | BarberOS                       | **no repository found** — must be located first |

Each needs its Supabase URL and publishable key changed and its deployment redeployed.

### 7 — Cutover window, in one sitting

1. Stop writes to the moving schemas (take the apps down, briefly).
2. Copy the data — 959 rows; small enough to generate as `INSERT`s.
3. Verify row counts match per table.
4. Bring the apps up against the target.
5. Confirm they work.

**Do not copy data before this window.** The apps keep writing to Core, so an early copy is
stale on arrival and creates two divergent truths — worse than the state we are in now.

### 8 — Only now, remove from Core

`drop schema jobscout, dma, barberos, transform_audit cascade`, plus the 17 `barberos_*`
functions, plus their rows in Core's `supabase_migrations.schema_migrations`.

Take a backup first. This is the one irreversible step in the runbook.

### 9 — Adopt Group B and close the loop

Write `disco_*`, `hlvs_board_*`, `ingest_*` and `temp_perftest_*` into
`supabase/migrations` at their applied versions, regenerate the manifest, and clear the
matching entries from `knownMigrationDrift`.

Then run `scripts/check-lineage-drift.mjs` against Core. It should pass — for the first
time. That is how this finishes: not when the schemas have moved, but when the check that
would have caught all of this can run green.

## The one thing that needs Keith

**Where does BarberOS live?** It is the only moving product with no repository I can find,
and it is the most coupled of the four. Everything else in this runbook is mine.
