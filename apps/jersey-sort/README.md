# JerseySort AI

**Find your athlete. Instantly.**
AI-powered sports photo organization by player, jersey number, event, and date.

Turn hundreds of game photos into organized player galleries in minutes.

## Start it

Open the Development Control Center and press **Start** next to
**JerseySort AI** on the home page. The console builds it, starts it, waits
until it answers, and opens it. It runs at `http://localhost:4603`, on this
computer only. Needs Node.js 22.13 or newer (it uses Node's built-in SQLite).

The first time, choose **Create an account**: your name, your team / school /
studio (that becomes your organization), an email and a password.

## What you can do

1. **Sign in.** Email and password. Everyone in an organization sees its
   photos; nobody outside it sees any. The owner adds people in Settings.
2. **Create an event** — name, sport, team, opponent, date, location, season,
   notes.
3. **Upload** — drag and drop, choose hundreds of photos, or a whole folder.
   JPG, PNG and HEIC (iPhone). The original is stored untouched; a 480 px
   thumbnail and a 1600 px preview are made for the screens. The photo's date
   comes from its EXIF; with no date in the file, the upload date is used and
   marked _inferred_. A file uploaded twice is refused and the first copy is
   named.
4. **Watch it process** — "Analyzing photos · 147 / 428 complete · 34%".
   Analysis runs in the background; go anywhere in the app meanwhile.
   Failed photos say why and have a **Retry** button.
5. **Jersey galleries** — every photo is filed under every jersey number in
   it (one photo, three athletes, three galleries, one file). Scoreboards,
   yard markers, clocks and signs are kept out. Readings are banded:
   **High** (≥ 85%, filed), **Needs review** (60–84%, filed and flagged),
   **Low** (< 60%, Unidentified). Thresholds are adjustable in Settings and
   re-sort everything immediately.
6. **Review** — one photo at a time, big. Confirm, delete, change or add a
   number; mark _no jersey visible_, _unusable_, or _skip_. Keyboard: digits
   to add a number, **Enter** done, **N** no jersey, **U** unusable,
   **S** skip. The next photo is preloaded.
7. **Players** — name, number, team, sport, season, position, graduation
   year, profile photo. A number belongs to a player for **one team and one
   season**; next season's #24 can be someone else. Galleries then read
   "#24 — Dominic Herman".
8. **Search** — `24`, `#24`, `Dominic Herman`, `October 3`, `West Seneca`,
   `Football`. Every word must match.
9. **Filters** — event, date, team, sport, jersey number, player, confidence,
   reviewed / not, favorited, uploaded by, status.
10. **Favorites, albums, the date gallery** and **bulk actions**: add a
    number, assign a player, add to an album, favorite, remove a tag,
    download (ZIP of the untouched originals), mark reviewed.

## Who reads the numbers

| Provider                | When                                          | What it can do                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude vision**       | an Anthropic key is set (`ANTHROPIC_API_KEY`) | Reads numbers and says what each is printed on, so a scoreboard is refused by our rules, visibly. Each photo's 1600 px preview is sent to Anthropic.                                                              |
| **Local OCR** (default) | no key                                        | Tesseract on this computer; nothing leaves it. Reads digits but cannot see athletes or tell a jersey from a sign, so **every reading it makes goes to review**, and it misses many numbers on real action photos. |
| **None**                | chosen in Settings                            | No automatic analysis; every photo goes to review for numbers to be added by hand.                                                                                                                                |

The provider is chosen per organization in **Settings**. Whatever reads a
photo, nothing is invented: a provider that cannot run marks the photo
**failed** with the reason — it never fills the gap — and a person can
override every reading.

## Where things are kept

`.jersey-sort/` inside this app's folder: `jerseysort.db` (SQLite) and
`originals/`, `thumbnails/`, `previews/`, one folder per organization.
Gitignored, so a photo can never be committed. Images are served only through
an authenticated route that checks the viewer's organization; there is no
public URL to any photo.

## Verifying it

```
pnpm --filter @hl-bos/jersey-sort test       # the engine's decisions
pnpm --filter @hl-bos/jersey-sort-app test   # store, upload pipeline, queue, real local OCR
```

Against a running copy, the whole brief in a real browser (85 checks):

```
JERSEYSORT_DATA_DIR=/tmp/js-data pnpm --filter @hl-bos/jersey-sort-app start
JERSEYSORT_DATA_DIR=/tmp/js-data node scripts/local-test/verify-jersey-sort.cjs http://127.0.0.1:4603
```

Set `JERSEYSORT_HEIC_SAMPLE` to a real `.heic` file to include the HEIC
checks (a real HEVC HEIC cannot be generated by the test itself).

## Database

`supabase/migrations/…_hlbos_0052_jersey_sort.sql` defines the `jerseysort`
schema — 14 tables, the `review_queue` view and three private storage
buckets — reusing HL-BOS identity: organizations are `platform.tenants`,
people are `auth.users`, access is `identity.has_permission()`. Row-level
security is forced on every table, and the schema itself refuses a member
writing an AI result, a photo status that claims what has not happened, two
athletes on one number in one season, and any public photo. Tested by
`supabase/tests/52_jersey_sort.sql` (74 assertions). **Not applied to any
project.** Switching the app from the local store to Supabase is a new
implementation of the queries in `src/lib/repo` plus Supabase Auth (which
also brings magic links and social sign-in).

Engine details: [`packages/jersey-sort/README.md`](../../packages/jersey-sort/README.md).
