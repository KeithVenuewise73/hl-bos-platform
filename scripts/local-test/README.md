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

# Serving a shop's page end to end

`site-serve-e2e.mjs` runs the **real** `site` edge function under `Deno.serve`,
over real HTTP, against the real local PostgreSQL:

```bash
NODE_PATH=/path/to/local-test/node_modules node scripts/local-test/site-serve-e2e.mjs
# set HLBOS_DENO if `deno` is not on PATH
```

The only stand-in is the transport to PostgREST (`postgrest-rpc-shim.cjs`), and
it does two things that make the run worth trusting:

- it executes every call **as the `anon` role**, in a transaction, the way
  PostgREST does for an anonymous request. Connected as `postgres` the run would
  prove the SQL works and say nothing about whether a stranger may call it,
  which is the only interesting question about a public endpoint.
- it will only call the two functions migration 0053 exposes. A shim that ran
  whatever it was handed would be testing a wider door than the real one.

It seeds Truth Barbershop (a real row of the WNY list) through the real
permission-checked write functions, publishes it, and then asserts 25 things
over HTTP — the page and its real hours, prices and tap-to-call number; a draft
and an unused slug returning **byte-identical** 404s; the capitalised-URL
redirect; robots and sitemap; `HEAD`, `POST` and `If-None-Match`; and the two
that prove "published" means something on the wire: unpublishing takes the URL
off the internet, and republishing brings it back.

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

---

# Verifying the Shop Analysis page against real data

The console reads HL-BOS Core through the Supabase Management API's SQL
endpoint. That HTTP hop cannot be exercised from a build environment with no
token, so the page is verified against the local PostgreSQL mirror instead:

```bash
node supabase-api-shim.cjs &          # stands in for the Management API, on :4555
cd ../../apps/control-center
printf 'SUPABASE_ACCESS_TOKEN=local-verification-only\nHLBOS_SUPABASE_PROJECT_REF=mirror\nHLBOS_SUPABASE_API_URL=http://127.0.0.1:4555/v1\n' > .env.local
npx next start --port 4000
```

`supabase-api-shim.cjs` answers `POST /v1/projects/:ref/database/query` by
running the statement against the mirror and returning the rows. Nothing in the
app imports it; it exists so the page can be looked at with fifty real shops in
it rather than shipped on the strength of a type check.

**Delete `.env.local` afterwards.** It is gitignored, but a stale one makes the
console think it is connected to a project that is not there.

This is how the "site did not answer" bug was found: five shops that had never
been fetched were being described as unreadable, and only a rendered page with
real data showed it.

---

# The discovery call, end to end

`discovery-call-e2e.mts` runs the call screen's real SQL and real mappings
against the local PostgreSQL carrying migration 0054:

```bash
NODE_PATH=/path/to/pg/node_modules \
  node --experimental-strip-types --import ./scripts/local-test/ts-extensionless.mjs \
  scripts/local-test/discovery-call-e2e.mts
```

19 checks. What is worth proving here is not that a row can be written — it is
the three things that would quietly produce a false claim in a proposal:

- the write goes through **`set local role authenticated`** as the tenant
  owner, so the permission check and the RLS policy are exercised. The SQL
  endpoint connects as `postgres`; writing that way would let the console store
  what the application itself would refuse, and prove nothing.
- a second call **adds to** the first rather than overwriting it, and an
  explicit `null` clears an answer back to "nobody asked". That absent-versus-
  null distinction is the whole design of 0054, and it only holds if the
  payload builder, the JSON cast and the function agree.
- a `false` survives the round trip as `false` and a `null` as `null`. A
  transport that collapsed them would have the screen telling an owner they
  have no online booking when nobody raised the subject.

The React is typechecked, not rendered. What can be wrong is the SQL and the
mapping, and those are what this runs.

`ts-extensionless.mjs` (and the hooks file beside it) let plain Node resolve the
console's extensionless imports — Next bundles the app, so `./shop-audit-sql`
has no extension and Node's ESM resolver will not find it. Used only by this
harness; nothing shipped depends on it.

---

# The proposal, end to end

`proposal-e2e.mts` runs the whole proposal path against the local PostgreSQL
carrying migration 0055:

```bash
NODE_PATH=/path/to/pg/node_modules \
  node --experimental-strip-types --import ./scripts/local-test/ts-extensionless.mjs \
  scripts/local-test/proposal-e2e.mts
```

34 checks, and the four groups are chosen because each one is a way a proposal
could quietly become a lie:

- **The honesty rules belong to the DATABASE.** `capability-match.ts` already
  refuses to offer a deferred module or to sell a planned one as available, and
  it has tests — but that holds only for documents it composed. So the run goes
  straight at the trigger: a deferred module, an invented module and a planned
  module claimed as deliverable today are each refused by PostgreSQL, with the
  reason quoted.
- **The snapshot does not move.** It promotes `review_engine` to `available`
  mid-run and asserts the proposal drafted a moment earlier still says roadmap.
  A live-rendered document would have silently changed what the shop was told.
- **Sent is immutable, by every route.** Through the function, and by a direct
  `UPDATE` — the shape of every future fix-up script — which the trigger refuses
  rather than a missing grant.
- **The document tells the truth about its own gaps.** It renders a real
  proposal from real rows: the verified finding with its evidence URL is in it,
  the `unknown`-confidence finding is not, the audit's coverage is stated
  ("over 1 of the 2 dimensions"), the roadmap is labelled "not available yet",
  and what nobody asked on the call appears as a limit rather than a "no".

Every write goes through the permission-checked function **as the tenant
owner**. Connected as the superuser the run would prove the SQL parses and say
nothing about whether the application would allow it.
