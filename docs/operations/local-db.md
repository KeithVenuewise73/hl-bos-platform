# Local isolated database (development only)

`scripts/local-db/` lets you build the HL-BOS schema on a bare PostgreSQL 16 with synthetic data and run
the pgTAP-style tests in `supabase/tests/` without touching any hosted project.

- `bootstrap.sql` — stand-ins for Supabase roles, `auth.users` and `auth.uid()`. Never applied to a hosted project.
- `reset.sh [db]` — drops/creates a database and applies the platform migrations (0001–0019) and every `hlbos_01xx` commercial migration in order.
- `pgtap_shim.sql` + `run-tests.sh [db] [glob]` — a small subset of pgTAP so the same test files run where the extension is not installed. CI uses real pgTAP.

```
export PGHOST=/tmp PGPORT=54329 PGUSER=postgres   # a local server you started
scripts/local-db/reset.sh
scripts/local-db/run-tests.sh hlbos_local 60_commercial_modules.sql
```

Migration numbering: the repository's lineage gate (`scripts/check-lineage.mjs`) requires contiguous ordinals, so the
commercial migrations are stacked in merge order (0055, 0056 shared services; SalonOS follows). NOTE: production already
records different migrations under ordinals 0055-0058 (see `supabase/recovery/**/REPO_DIFF.md`); ordinals are names only,
the version timestamps are unique, but promoting the recovered production rows into `main` will need a rename decision.
