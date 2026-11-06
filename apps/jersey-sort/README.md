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

## Bring a game in from DateSort

DateSort's **Find jersey numbers** button opens
`/import?folder=…&date=…&sport=…&name=…`. That page shows how many JPG, PNG and
HEIC photos are directly in the game's folder. Canon RAW files are counted and
left out: they are the same shots, and reading both would double the cost. It
also shows who will read the numbers, with the event filled in. **Create event**
creates it and brings the photos in, in the background, through the same
`ingestPhoto()` as an upload. The event page shows "Bringing in photos from the
folder: n of N". Photos already in JerseySort are recognised by their bytes and
skipped, so starting again finishes an interrupted import. The folder is only
read (`src/lib/folder-import.ts`, tested with a fingerprint before and after).

**Claude key.** `ANTHROPIC_API_KEY` if it is set. Otherwise, the key the CEO
saved in DateSort's Sports panel (`src/lib/shared-key.ts`, read fresh each time).

Signing in now returns to the page you were going to (`?next=`), and only to
a page of this app (`src/lib/next-path.ts`).

## Publish a game to 5 Star from DateSort

DateSort's **Publish to 5 Star** opens `/publish?folder=…&date=…&sport=…&name=…`
(`src/app/publish/page.tsx`, `src/actions/publish-folder.ts`). Choose the team
gallery and press **Publish to 5 Star**: the folder's game is found by its
photos' bytes if it is already in JerseySort (`src/lib/folder-event.ts`), or
created; it is added to the team gallery; the photos are brought in; and once
every one has been tried the gallery is published online (connecting first if
this computer never has). The team gallery page shows the photos arriving and
then the publish. It also has a **message for the families**: the website link
and the team password, typed there because JerseySort never keeps the
password.

## Team galleries

**Team galleries** in the menu. Give a team, an organization or a group of
family and friends their own private gallery, branded with your organization's
name (for example _5 Star Sports Media_):

1. **Create** one: organization or group (optional, e.g. _Cazenovia Hockey_),
   team or gallery name (_Varsity_), and a team password (6+ characters).
2. **Tick the games** it shows. Visitors see only those games: never another
   team's, never a game left unticked, not even by guessing an address.
3. **Copy the link** and give it, with the password, to the coach.

Visitors need no account: link + team password, then they can view each
game's photos and download one (the untouched original) or **Download all**
(a ZIP). Ten wrong passwords in 15 minutes and that link waits.

You stay in control: **change the password** (everyone already looking must
enter the new one), **switch the link off**, or **make a new link** (the old
one stops working). Deleting a gallery leaves its photos in JerseySort.

**The /g/ link opens on this computer only**, and the page says so. For
phones, publish the gallery online (below).

### Online, on 5starsportsmedia.com

On a team gallery's page, **Online**:

1. **Connect to the online galleries** (once). This computer makes its own
   publisher key and keeps it in the data folder (`gallery-publisher.json`);
   only the key's fingerprint is sent, during the one-time connect window
   migration 0054 opens. If another computer connected first, it says so.
2. **Cover for the website**, per game: the one photo a game's public page
   may show. None chosen, none shown.
3. **Publish online**: each game's photos go up at web size (about 2400 px)
   with 480 px thumbnails; originals stay here. Publishing again uploads only
   new photos and makes the online copy match (unticked games and removed
   photos are removed). The page shows progress and the website link.

Switching a gallery off, a new password, a new link, games or name: when the
gallery is online, it is published again at once, so switching it off here
switches it off online. Deleting a gallery takes it offline first.

Goes to `JERSEYSORT_GALLERY_SERVICE_URL` (default: HL-BOS Core's
`team-gallery` function). Until migrations 0053 + 0054 are applied and the
function is deployed (both need the CEO's approval), Connect says "not
switched on yet". Proven by `src/lib/online.test.ts` (against the real
service handler) and `scripts/local-test/verify-publish-online.cjs` (20
checks in a real browser against `gallery-service-local.ts`, the real
service code on a local PostgreSQL).

Proven by `scripts/local-test/verify-team-galleries.cjs` (29 checks in a real
browser, also run on Windows CI) and `src/lib/galleries.test.ts`.

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
