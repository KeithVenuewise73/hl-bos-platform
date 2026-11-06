# Team galleries — switching them on (migrations 0053 + 0054, function `team-gallery`)

## Status, stated plainly

| Thing                                   | State                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Migration `0053_team_galleries`         | **APPLIED** to HL-BOS Core (`mvvtngiopdrgiedjmhfb`) on 2026-11-06 under CEO approval.                                                    |
| Migration `0054_team_gallery_publisher` | **APPLIED** the same day, straight after 0053.                                                                                           |
| Recorded in production as               | `hlbos_0053_team_galleries` and `hlbos_0054_team_gallery_publisher` (production assigns its own version numbers).                        |
| Edge Function `team-gallery`            | **DEPLOYED**, version 2, `verify_jwt = false`.                                                                                           |
| Data in `gallery`                       | **None.** No galleries, games, photos or files. The one-time connect window is **open** until 2026-11-07 21:59 UTC (about 5 PM Eastern). |
| 5starsportsmedia.com galleries pages    | Live; they read `/listing`, which now answers `{"games":[]}`, so they still say "coming soon" until the first gallery is published.      |
| JerseySort "Publish online"             | Waiting for the one click: **Connect to the online galleries**, inside the window above.                                                 |

The rest of this page is the runbook that was followed, then the record of
what actually happened ("Apply record", at the end).

## What will be applied, byte for byte

| File                                                                       | SHA-256                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261103120000_hlbos_0053_team_galleries.sql`         | `692a35e361ec46c1866cc16a2ae3441a16c78b81ed24dce7c05dbe8991b07cdf` |
| `supabase/migrations/20261104120000_hlbos_0054_team_gallery_publisher.sql` | `3a902ece613561f359912551cc112cb65ed829c5759adeb1f9d815d75af1f3a8` |
| `supabase/functions/team-gallery/index.ts`                                 | `1a9c878f599c8ef45a6365f647a9ace09d5a1150bca4b924ef167d84c0f3574e` |
| `supabase/functions/_shared/gallery/core.ts` (**with the Buffer fix**)     | `b1cd655e7daf34b786f437fb0e10fcfabcf1aada4431b2d5a088092ace589535` |
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
6. **Advisor counts after.** No new warnings. The five `gallery` tables will each add one
   _info_ note, "RLS enabled, no policy", which is the design (no web access at
   all), so expect +5 info, nothing else.
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

## Apply record (what actually happened, 2026-11-06)

**Pre-checks, on production, read-only.** Schema `gallery` absent; buckets
`gallery-photos` and `gallery-covers` absent; `extensions.gen_random_bytes`
present; PostgreSQL 17.6; 112 migrations recorded. Security advisor: **47**
findings (12 info, 35 warnings), none about galleries.

**Applied one at a time, from the merged files** (hashes above), as
`hlbos_0053_team_galleries` then `hlbos_0054_team_gallery_publisher`. After
0053: 4 tables, 10 functions, both buckets, 113 migrations recorded.

**Fingerprint.** The names fingerprint matched the expected values exactly (tables 5,
columns 40, checks 21, fks 3, policies 0, functions 13, rls_forced 5, web
tables 0, web functions 0, anon usage false, buckets
`gallery-covers:true,gallery-photos:false`, constraint md5 `a4e2e60c…`,
function md5 `a15963ef…`, connect window open, no publisher yet).

**Full definitions** (`supabase/verify/team_galleries_definitions.sql`):
functions `99df50f2…`, columns `3da3791d…`, constraints `69012f7e…`,
identical on production and on the tested local copy. **A false alarm worth
recording:** the first columns hash differed. Cause: Postgres leaves the
schema name off `extensions.gen_random_bytes(32)` in a column default when
`extensions` is on the session's search path, so production _displayed_
`gen_random_bytes(32)` while storing the same default. Proved by reading it
with an empty search path (identical), and the script now sets one.

**Refusal probe** (rolled back by its own final error):

```
PROBE anon_reads=refused web_runs=refused foreign_path=refused foreign_cover=refused takeover=refused bad_fingerprint=refused rows_left=2
```

Afterwards: 0 galleries, 0 games, 0 photos, 0 probe rows.

**Advisors after.** Security: **52** (47 + 5), the five being info notes "RLS
Enabled No Policy" on `gallery.galleries`, `games`, `photos`, `settings` and
`unlock_failures` (by design). Every warning group unchanged; no gallery
function is runnable by the web roles. Performance: 3 info notes about
`gallery`, on empty tables (`photos`' foreign key `(game_id, gallery_id)` has no
covering index; `games_gallery_date` and `unlock_failures_gallery_at` unused).
Left as they are, matching the 0051 precedent for empty tables; the foreign
key index is worth adding once photos are real.

**The service's database access** was checked before deploying: the objects
are owned by `postgres`, which is the role `SUPABASE_DB_URL` uses; it can run
every function and bypasses row rules; `service_role` cannot reset the
publisher.

**A real bug, found by the first live check.** Version 1 of `team-gallery`
answered `/unlock` with a 500: `Buffer is not defined`. The service used
`Buffer` as a global; Supabase's Edge Runtime has none (the local test
runtime does, which is why every test passed). It would have broken every
password check and every publish. Reproduced locally by removing the global
(`supabase/functions/tests/team_gallery_runtime.test.ts`, 3 of 4 failing),
fixed with `import { Buffer } from "node:buffer"` in `core.ts` (146 of 146
passing), and redeployed as version 2 **before this pull request**, so the
repository's `core.ts` now matches production again (hash above).

**Live checks, version 2** (all as expected): `/listing` 200 `{"games":[]}`;
`/unlock` with an unknown link 404; `/gallery` with an unknown link 404;
`/publish/check` without the key 401; CORS allows `https://5starsportsmedia.com`
and no other origin.

**A complete round trip against the live service,** with a throwaway
gallery (22 of 22 passed, then everything removed):

- connect with a throwaway key; a second key refused as another computer;
  the right key accepted on a protected route and a wrong key refused;
- publish a gallery, 5 uploads through the signed addresses, publish a game
  with a chosen cover;
- the listing shows the game with its cover; the cover is publicly readable;
  nothing private is in the listing;
- wrong password 401; right password gives a pass; no pass or a forged pass
  401; with the pass, the games and the photos' signed addresses; a signed
  address downloads a real 2400 px JPEG; the same file is **not** readable
  without it (private bucket); a game not in the gallery 404;
- clean-up: the gallery removed with its files, the listing empty again.

Then `gallery.reset_publisher(24)`: no publisher registered, window open until
2026-11-07 21:59 UTC; 0 galleries, games, photos, failures; **0 files in
either bucket**.

**Not done / still to do.** Keith's JerseySort has not connected yet. It has
to press **Connect to the online galleries** inside the window above; if the
window is missed, `select gallery.reset_publisher(24);` opens another.
`.hlbos/canonical.json` was not rewritten (the production-history
reconciliation noted in `social-publishing-phase-1.md` is still outstanding).
