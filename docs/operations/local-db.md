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

Migration numbering (coordinated across branches): `0100–0109` shared commercial services,
`0110–0119` TransportationOS, `0120–0129` SalonOS. None collides with the production-only numbers
recorded in `supabase/recovery/` (0044/0045/0049 collisions are untouched).
