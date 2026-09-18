# HighlightAI Hockey

Upload a game, describe the player by jersey colour and number, let the vision
service find them, review the clips it proposes, and build a highlight reel.

Runs on port **4650**. The Control Center starts it; nobody needs a terminal.

## The workflow

```
create the game  ->  upload the video  ->  Find my player  ->  review the clips
                                                                     |
                     download  <-  build the reel  <-  keep the ones you want
```

## What it will not do

These are enforced in code and tested, not merely intended.

- **It will not say it is certain on jersey colour alone.** Colour is shared
  with four team-mates on the ice. A track reaches "confirmed" only when a
  jersey number was legibly read more than once and agreed; otherwise it caps
  at "likely", and the percentage shown is capped to match the word so the two
  halves of the claim cannot contradict each other.
- **It will not name a goal, a save or an assist.** Nothing in the pipeline can
  see a puck. Events are named for the motion that was actually observed —
  a burst of speed, a hard change of direction, crease work.
- **It will not put a clip in a reel you have not approved.** Enforced in the
  engine's review step, again when the reel is assembled, and a third time as a
  CHECK constraint in migration 0049.
- **It will not report "nothing found" when it could not look.** A missing
  analysis service is an error with a remedy, never an empty result.
- **It will not show a control that cannot do its job.** No Try Again on a
  failure that would fail identically; no download link for a file that was
  never rendered.

## Where things are

|                 |                                                                       |
| --------------- | --------------------------------------------------------------------- |
| Engine          | `packages/hockey-highlights` — pure, deterministic, 109 tests         |
| Vision service  | `services/hockey-vision` — ffmpeg + OpenCV, 65 tests                  |
| Database schema | `supabase/migrations/…_0049_highlightai_hockey.sql` — **not applied** |
| Storage keys    | `src/lib/media.ts` — the one place a key becomes a path               |

## Configuration

| Variable                                           | Default            | What it does                                                                          |
| -------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `HOCKEY_DATA_DIR`                                  | `.data`            | Where the JSON store lives                                                            |
| `HOCKEY_MEDIA_ROOT`                                | `<data dir>/media` | **Shared with the vision service.** Both must point at the same directory             |
| `HOCKEY_VISION_URL`                                | unset              | The vision service. Unset means analysis is unavailable, and the app says so          |
| `HL_BOS_ENV`                                       | unset              | `local` for no sign-in; `preview`/`staging`/`production` require an identity provider |
| `NEXT_PUBLIC_SUPABASE_URL` / `..._PUBLISHABLE_KEY` | unset              | Turns on sign-in                                                                      |

**The deployment gate is derived, never configured.** In a deployed
environment with no identity provider the app refuses to serve at all, because
this data is video of a child at a named rink on a known date beside their name
and jersey number. That refusal is real: `next start` sets `NODE_ENV=production`,
and starting without Supabase returns the refusal page rather than the app.

## Storage

A JSON file per account, with video alongside it under the media root. The
PostgreSQL schema is written and tested but **has not been applied anywhere**,
so Settings says which store is actually in use rather than implying a database
that is not there.

## Verified

`pnpm test` — 22 passing. `pnpm build` — clean.

Proven by driving the real UI in a headless browser against the real vision
service: a 30-second game was created through the form, uploaded, analysed
(proxy built, players detected, tracked, jerseys classified), one candidate
segment surfaced at **likely · 84%** with "jersey number: never read clearly in
this stretch" shown beside it, one burst clip proposed, kept by a click, and a
reel rendered. `ffprobe` on the result: **6.900000s of H.264 at 960×540** — the
original's resolution, not the 540p analysis proxy — and the app served it over
HTTP as `video/mp4`, 16934 bytes, HTTP 200.

Three real defects were found by running it rather than by reading it:

1. **The app and the vision service disagreed about what a storage key is.**
   The app sent absolute paths; the service refused them, correctly, as
   traversal risks. The first real upload failed at the first stage. Both sides
   now use relative keys under a shared media root, and `src/lib/media.ts` is
   the single place that translates one into the other.
2. **A clip was stored with no end time.** The HTTP provider passed the probe
   response through without mapping it, so `duration_seconds` never became
   `durationSeconds` — and `width`/`height` are spelled the same on both sides,
   which is exactly why it looked like it worked. The undefined duration became
   NaN and serialised to null.
3. **The review screen read "LIKELY · 100%".** The band was refusing to claim
   certainty while the number beside it claimed certainty anyway.
