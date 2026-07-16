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
