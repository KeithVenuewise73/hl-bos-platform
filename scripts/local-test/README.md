# Local database tests

Runs the Phase 2 migrations and the pgTAP suite against a **local** PostgreSQL.
Never touches a Supabase project.

## Why this exists

CI runs `supabase test db` against the real local Supabase stack (Docker). This
sandbox has no Docker, so the same SQL is exercised against:

- **PostgreSQL 17.6** — embedded, userland, matching production exactly
- **pgTAP 1.3.5** — the real extension SQL, not a shim
- `supabase-shim.sql` — recreates only what Supabase provides and our SQL needs:
  the `anon`/`authenticated`/`service_role`/`authenticator` roles, the `auth`
  schema, `auth.users`, and `auth.uid()` reading `request.jwt.claims` exactly as
  PostgREST sets it.

The shim is emulation, and that is its weakness: if it drifts from real Supabase,
these tests could pass while production differs. CI is the control for that —
the identical test files run against the real stack.

## Run

```bash
npm i @embedded-postgres/linux-x64@17.6.0-beta.15 pg @electric-sql/pglite-pgtap
# install pgtap's SQL into the embedded PG's extension dir, then:
node apply.cjs        # drops + recreates the db, applies shim + 0001..0006
node runtests.cjs     # runs supabase/tests/*.sql, prints TAP
node concurrency.cjs  # two live sessions racing one invitation token
```

## Divergences from real Supabase, stated plainly

| Aspect          | Local                  | Real                                      |
| --------------- | ---------------------- | ----------------------------------------- |
| Session user    | `postgres` (superuser) | `authenticator`                           |
| `postgres` role | superuser              | not superuser; `BYPASSRLS` + `CREATEROLE` |
| Auth            | `auth.users` stub      | full GoTrue                               |

The session-user difference is why test 48 asserts the **grant graph**
(`pg_has_role`) rather than `SET ROLE` behaviour: `SET ROLE` is authorised
against the session user, so under a superuser session it would trivially
succeed and prove nothing.

## Reproducible bootstrap (the previously-manual pgTAP step)

The `npm i` above ships the pgTAP extension SQL inside
`@electric-sql/pglite-pgtap/dist/pgtap.tar.gz`. To make `create extension pgtap`
(migration 0001) resolve against the embedded server:

```bash
PGROOT=node_modules/@embedded-postgres/linux-x64/native
# 1. install pgTAP's control + version SQL into the embedded PG extension dir
mkdir -p /tmp/pgtap && tar -xzf node_modules/@electric-sql/pglite-pgtap/dist/pgtap.tar.gz -C /tmp/pgtap
cp /tmp/pgtap/share/postgresql/extension/pgtap* "$PGROOT/share/postgresql/extension/"
# 2. initdb + start as a NON-root user (initdb refuses root), socket in /tmp, port 5433
#    e.g. run under an unprivileged user with:
#      "$PGROOT/bin/initdb" -D pgdata --username=postgres --auth=trust
#      "$PGROOT/bin/pg_ctl" -D pgdata -o '-p 5433 -k /tmp' -l /tmp/pg.log start
# 3. stage files where the runners expect them
mkdir -p /tmp/pgtest/tests
cp supabase/migrations/*.sql supabase/tests/../../scripts/local-test/supabase-shim.sql /tmp/pgtest/
cp supabase/tests/*.sql supabase/tests/*.inc /tmp/pgtest/tests/
```

Then `node apply.cjs && node runtests.cjs`. The runners `require('pg')`; if you
invoke them from outside this directory, set `NODE_PATH` to this folder's
`node_modules`. Current suite: **190 assertions across 18 files**, 0 failing.

## Edge function unit tests (Deno)

The AI-gateway edge layer (provider adapters, secret redaction, structured
output, retry) has Deno unit tests:

```bash
deno test --no-check supabase/functions/tests/    # 8 tests
```

They import only local `_shared` modules (no remote deps) so they run offline.
CI runs them in the `functions-tests` job. Where Deno is unavailable, the same
files run under Node via `tsx` with a 6-line `Deno.test` shim (Node 22 provides
native `fetch`/`Response`/`Headers`).

---

# Update check

`verify-update.sh` proves `scripts/update.mjs` — the step that collects finished
work from GitHub when the console starts.

```bash
scripts/local-test/verify-update.sh
```

It builds throwaway git repositories and runs the real script against them, so
the guards are tested rather than asserted: a folder with unsaved changes is
left alone, a diverged branch is refused without touching history, an
unreachable remote gives up in seconds instead of hanging on a password prompt,
and a folder that is not a git repository at all still starts the console.

It also proves the **bootstrap**: a self-updating launcher cannot deliver
itself, so `control-center.bat` falls back to running git directly when
`scripts/update.mjs` is not present yet. That path is exercised against a real
older clone — including the case that matters most, where the folder has unsaved
work and must not be trampled.

It then mirrors the launcher's rebuild decision. `control-center.bat` cannot run
here, and the bug that mirror guards against was real: `if A if B (X) else (Y)`
binds the `else` to the inner `if`, so a fresh clone would have skipped the
build entirely and started a console that had never been built.
