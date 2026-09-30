# 5-Star Hype Video

**5-Star Sports Media · a Herman Legacy Group product**

Upload an athlete's photo or short clip, enter their details, pick a style, and
get a complete sports hype package — ready to post, and ready to hand to a
video, music or voice service.

## Start it

Open the Development Control Center and press **Start** next to
**5-Star Hype Video** on the home page. The console builds it, starts it, waits
until it answers, and opens it. It runs at `http://localhost:4602`, on this
computer only.

## What you can do

1. **Create a hype project** — right on the first screen. Name it, pick a style,
   and confirm you have the rights to the media (and, for an athlete under 18,
   that you are or have the consent of their parent/guardian).
2. **Upload media** — photos (JPG, PNG, WebP, GIF, up to 15 MB) or clips (MP4,
   MOV, WebM, up to 150 MB), up to 10 per project.
3. **Athlete details** — name, sport, team/school, jersey, position, class or
   age group, achievements, personality, optional sponsor.
4. **Template and tone** — 8 templates × 6 tones, which outputs you care about
   most, and a red / gold / blue accent.
5. **Hype package** — title, 15- and 30-second scripts, voiceover, caption,
   hashtags, on-screen text, AI video prompt, AI music prompt, sponsor line.
   Copy any piece, or **Export Package** as `.txt`, `.md` or `.json`.
6. **Project history** and a **pricing** page (placeholder).

## What it will not do

- **Make things up about a kid.** The package only states achievements you
  entered. A number, an honour (champion, MVP, All-State) or a recruiting claim
  (offer, committed, scholarship) that you did not type is refused, whoever
  wrote the draft.
- **Publish anything.** Projects are private and stay on this computer. There
  is no public sharing in this version.
- **Pretend.** Generate Video, Generate Music and Create Voiceover are shown
  switched off with the reason on them: no service is connected yet. Payments
  are not connected; nothing can be charged. Uploaded photos and video are not
  automatically checked for content — the person uploading is the check.

## Who writes the package

With no AI key set, the **built-in template writer** writes it, and the page
and every export say "template writer (not AI)". With an Anthropic key set,
**Claude** writes it, under the same fact and content checks; if Claude's draft
fails a check, the template version is used and the page says why.

## Where things are kept

`.hype-video/` inside this app's folder (projects file + one folder of media
per project). It is gitignored so a photo can never be committed. Deleting a
project deletes its photos and clips from disk.

## Verifying it

`pnpm --filter @hl-bos/hype-video-app test` runs the unit tests (upload rules,
store, same-origin checks). Against a running copy:

```
node scripts/local-test/verify-hype-video.cjs http://127.0.0.1:4602
```

drives the whole flow in a real browser — 46 checks, including every refusal.

## Database

`supabase/migrations/…_hlbos_0051_hype_video.sql` defines the `hype` schema
(`hype_projects`, `hype_project_media`, `hype_templates`, `hype_outputs`,
`user_profiles`, `purchases`, `subscriptions`) with the same consent, privacy
and no-fabrication rules enforced on the data. It is tested (50 pgTAP
assertions) and **applied to canonical production** (HL-BOS Core, 2026-09-30,
CEO-approved) — see `docs/operations/hype-video-0051-apply.md`. The app does
not use it yet: switching from the local file store to Supabase is a new
implementation of `HypeStore` (`src/lib/store-core.ts`) plus sign-in.

Engine details, the AI layer and the integration plan:
[`packages/hype-video/README.md`](../../packages/hype-video/README.md).
