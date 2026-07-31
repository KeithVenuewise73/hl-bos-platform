# XI-2H · Official Supabase guidance — evidence & citations

Retrieved from the official Supabase documentation via the Supabase docs search
(read-only). Quotes are verbatim. No production was contacted.

## 1. `supabase migration repair` — the vendor tool for history drift

Source: <https://supabase.com/docs/reference/cli/supabase-migration-repair>

> "Repairs the remote migration history table. Requires your local project to be linked
> to a remote database by running `supabase link`. **If your local and remote migration
> history goes out of sync, you can repair the remote history by marking specific
> migrations as `--status applied` or `--status reverted`.** Marking as `reverted` will
> delete an existing record from the migration history table while marking as `applied`
> will insert a new record."

Worked example (verbatim) — note the official recovery **deletes the local file** and
**regenerates it from remote via `db pull`**:

```bash
$ supabase migration list
 LOCAL           │ REMOTE         │ TIME (UTC)
                 │ 20230103054303 │ 2023-01-03 05:43:03
 20230103054315  │                │ 2023-01-03 05:43:15

$ rm supabase/migrations/20230103054315_remote_commit.sql      # adjust LOCAL
$ supabase migration repair 20230103054303 --status reverted    # clean REMOTE record
$ supabase db pull                                              # regenerate LOCAL from remote
   → Schema written to supabase/migrations/20240414044403_remote_schema.sql
   → Update remote migration history table? [Y/n]  → applied
```

**Direction of the official flow: remote is the source of truth; the LOCAL side is
adjusted (delete/regenerate) to match it.**

## 2. `supabase db push` — timestamp is the id; use repair to mutate history

Source: <https://supabase.com/docs/reference/cli/supabase-db-push>

> "After successfully applying a migration, a new row will be inserted into the migration
> history table with **timestamp as its unique id**. Subsequent pushes will skip
> migrations that have already been applied. **If you need to mutate the migration
> history table, such as deleting existing entries or inserting new entries without
> actually running the migration, use the `migration repair` command.**"

This is the canonical statement that (a) the version string is the identity, and
(b) `migration repair` — **not** a hand-written migration — is the sanctioned way to
change the history table.

## 3. `db pull` + Branching 2.0 — branching relies on migration files being in sync

Source: <https://supabase.com/docs/guides/troubleshooting/new-branch-doesnt-copy-database>

> "Branching in Supabase (Branching 2.0) relies on the **current migration files** in
> your project—**not** a schema dump—when creating environments from `main`… Follow the
> steps below to generate, synchronize, and repair your migration history for smooth
> branching."
>
> `supabase db pull --linked` — "generates a migration file … which reflects your remote
> schema. This will not run the migration locally or overwrite anything." Then: "Update
> remote migration history table? [Y/n]".

**Implication for our preview plan:** a faithful preview branch requires the repo's
migration files to be in sync with production **first** — exactly the XI-2G ordering
(reconcile, then branch).

## 4. Local development workflow — migrations tracked in version control

Source: <https://supabase.com/docs/guides/local-development/cli-workflows>

> "…database schema and migrations tracked in version control, with seed data for local
> development."

Confirms the intended model: hand-authored migration files under version control are the
unit of truth on the local/repo side.

## 5. What the docs do NOT say

- There is **no** documented Supabase command that "renames" a migration to a new
  version. Renaming is a plain file operation; the docs instead **delete + `db pull`**
  the local file to align it to remote.
- There is **no** endorsement of mutating `schema_migrations` from inside a migration —
  the docs route that need through `migration repair` instead.
