# Team galleries — switching them on (migrations 0053 + 0054, function `team-gallery`)

## Status, stated plainly

| Thing                                   | State                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Migration `0053_team_galleries`         | **Merged, NOT applied** to HL-BOS Core (`mvvtngiopdrgiedjmhfb`).                                                                 |
| Migration `0054_team_gallery_publisher` | **Merged, NOT applied.**                                                                                                         |
| Edge Function `team-gallery`            | **NOT deployed.** The live URL answers 404 today.                                                                                |
| 5starsportsmedia.com galleries pages    | **Live**, saying "coming soon" — truthfully, because the service they read from does not exist yet.                              |
| JerseySort "Publish online"             | Built and tested locally end to end; online it has nowhere to publish until the two steps above.                                 |
| What blocks it                          | (1) CEO approval to apply and deploy; (2) this session's Supabase access does not reach the organization that holds HL-BOS Core. |

Nothing on this page has been run against production. Every expected value
below comes from a fresh local database with all 54 migrations applied
(1239 pgTAP assertions, 0 failing).

## What will be applied, byte for byte

| File                                                                       | SHA-256                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261103120000_hlbos_0053_team_galleries.sql`         | `692a35e361ec46c1866cc16a2ae3441a16c78b81ed24dce7c05dbe8991b07cdf` |
| `supabase/migrations/20261104120000_hlbos_0054_team_gallery_publisher.sql` | `3a902ece613561f359912551cc112cb65ed829c5759adeb1f9d815d75af1f3a8` |
| `supabase/functions/team-gallery/index.ts`                                 | `1a9c878f599c8ef45a6365f647a9ace09d5a1150bca4b924ef167d84c0f3574e` |
| `supabase/functions/_shared/gallery/core.ts`                               | `8172928104ef56cffa01d7c5e2ef4f6d62e6df54e20fae9f73d848dd2f08fadf` |
| `supabase/functions/_shared/gallery/pg-store.ts`                           | `fa5b2c433fa74f30ba6e75d77705053e5c3e795fad1e0906a570d066ff981b3e` |

The two migration hashes match `.hlbos/migration-lineage.json`.

## How it will be applied, and why this way

Exactly as 0051 was (`hype-video-0051-apply.md`): **each migration on its
own, from the merged file**, not through `db-migrate.yml`. Production
carries migrations from other lineages and some of ours under other version
identifiers, so `supabase db push` would try to re-run migrations
production already has (`social-publishing-phase-1.md`). That
reconciliation is still outstanding and is not part of this change.

Both migrations are additive: a new schema `gallery`, two new Storage
buckets (`gallery-photos` private, `gallery-covers` public). They touch no
existing table, policy or function.

### Order, and the one timing rule

1. **Pre-checks** on production: schema `gallery` does not exist; buckets
   `gallery-photos` and `gallery-covers` do not exist; `extensions.gen_random_bytes`
   exists (0054's secret default needs it).
2. **Advisor counts before** (security and performance), written down.
3. Apply **0053**, then **0054**, under the names `hlbos_0053_team_galleries`
   and `hlbos_0054_team_gallery_publisher`.
4. **Fingerprint** (`supabase/verify/team_galleries_fingerprint.sql`) — must
   equal the values below exactly.
5. **Refusal probe** (`supabase/verify/team_galleries_probe.sql`) — rolls
   itself back; must print the expected line, then leave 0 probe rows.
6. **Advisor counts after.** Net new security findings must be 0.
7. **Deploy `team-gallery`** with `verify_jwt = false` and the three files
   above. It needs no secrets of its own: `SUPABASE_DB_URL`, `SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase to every function.
8. **Live checks** (below).
9. Keith clicks **Connect to the online galleries** in JerseySort, then
   **Publish online** on one gallery. The website's galleries page lists it
   the next time anyone opens it (it asks the service directly); the
   game's own searchable page follows at the next rebuild, which runs on
   GitHub's schedule (every 30 minutes asked, often hours in practice).
10. Write the apply record into this file (replace "NOT applied" above).

**Timing rule:** 0054 opens a **24-hour connect window** the moment it is
applied. JerseySort's Connect must be clicked inside it, or the window
closes and no publisher can register. Apply 0054 only when Keith is ready
to click Connect that day. If the window is missed, it is reopened by
`select gallery.reset_publisher(24);` run as the database owner — on
purpose the web-facing service role cannot run it.

## Expected fingerprint

From `supabase/verify/team_galleries_fingerprint.sql`, local copy:

```
tables              5
columns             40
checks              21
fks                 3
policies            0      (RLS forced on every table, no policies: nothing reaches it from the web API)
functions           13
rls_forced          5
web_readable_tables 0
web_runnable_functions 0
anon_usage          f
buckets             gallery-covers:true,gallery-photos:false
constraint_names_md5 a4e2e60c41e951070035bca7ebfc0805
function_names_md5   a15963efe6091dd1504d18c3eba948d3
connect_window_open t
no_publisher_yet    t
```

## Expected refusal probe

```
PROBE anon_reads=refused web_runs=refused foreign_path=refused
      foreign_cover=refused takeover=refused bad_fingerprint=refused rows_left=2
```

then `select count(*) from gallery.galleries where brand = 'probe'` → `0`.

What each one proves:

| Probe             | Proves                                                           |
| ----------------- | ---------------------------------------------------------------- |
| `anon_reads`      | A website visitor's database role cannot read any gallery table. |
| `web_runs`        | A signed-in app user cannot run the gallery functions.           |
| `foreign_path`    | A photo row cannot point at another gallery's files.             |
| `foreign_cover`   | A cover must be one of that game's own photos.                   |
| `takeover`        | One gallery cannot take over another gallery's game.             |
| `bad_fingerprint` | Only a real key fingerprint can register a publisher.            |

## Live checks after deploy

| Request                                                 | Expected                                           |
| ------------------------------------------------------- | -------------------------------------------------- |
| `GET  …/functions/v1/team-gallery/listing`              | `200`, `{"games":[]}` before anything is published |
| `POST …/unlock` with an unknown link                    | `404`                                              |
| `GET  …/gallery?link=<unknown>` with no pass            | `404` (does not reveal whether a link exists)      |
| `POST …/publish/check` with no key                      | `401` "Not the publisher."                         |
| `OPTIONS …/listing` from `https://5starsportsmedia.com` | CORS allows it; from any other origin it does not  |

All five were run against the local copy of the service (real handler,
real database functions) on 2026-11-05 and gave exactly these answers.

## Rollback

Unpublish from JerseySort first if anything is online, then a new, approved,
forward migration: `drop schema gallery cascade;` and delete the two
buckets. Undeploy the function. No other data is affected.
