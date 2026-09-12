# Football FilmStudy AI

**Upload the film. Understand the game. Coach the next rep.**

Herman Legacy Group → Venuewise → Football FilmStudy AI.

Phase 1 of the build brief: the **film operating system**. A coach can upload a
game film, segment it into plays by hand, tag each play's football data, put
players on the field, grade them, write a coaching note, cut a clip, assign it
to an athlete — and that athlete can open it and mark it reviewed.

That is the brief's section 54 vertical slice, end to end. Everything above it —
automatic play detection, tendencies, the conversational AI Coach — is Phase 2
and later, and the screens for those say so rather than showing a mock.

## Run it

```bash
pnpm --filter @hl-bos/filmstudy dev     # http://localhost:4400
```

Two environment values are needed, both publishable and both safe in a browser
bundle:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Without them the app runs and redirects everything to `/setup`, which says what
is missing. It does not render a dashboard of zeroes.

The Supabase project needs migration `0048_football_filmstudy` applied, the
`filmstudy` schema exposed to PostgREST, and a **private** `film-private`
storage bucket. None of that has been done to any project — see _Status_ below.

## The two things that shape every screen

**1. AI output and coach-confirmed football data are different things.**

`filmstudy.plays` holds only values a coach entered or accepted.
`filmstudy.predictions` holds what a model guessed and has **no tenant write
path at all**. `filmstudy.confirmations` records, per field, who confirmed it
and whether it came from a prediction. In the film room a suggestion always
carries the word "Suggested", a confidence band rather than a decimal, and three
buttons: Accept, Correct, Reject. Accepting writes the value _and_ a
confirmation naming the prediction. Rejecting writes nothing.

**2. A panel with no data says so, and says why.**

HL-BOS Principle 10 — never invent data — with the dashboard explicitly not
exempt. So:

- An ungraded player's average grade is `null`, rendered "Not recorded". Never 0.
- An unplayed game has no score. Never 0–0.
- A third-down conversion rate over zero third downs is `null`, not 0%.
- A tendency below the sample floor is refused outright by `@hl-bos/football`.
- The **AI Insights panel shows no insight**, because there is no inference
  pipeline. It says that, and says what Phase 2 needs.
- Film search reports the words it did **not** understand as prominently as the
  results, so a half-matched query cannot look like a full one.
- Demo film sits in a `demo_no_video` state and never offers a play button.

## Access: two layers, both in the database

| Layer                                  | Answers                          |
| -------------------------------------- | -------------------------------- |
| `identity.has_permission(tenant, …)`   | May you do this kind of thing?   |
| `filmstudy.team_members.football_role` | On whose team, wearing what hat? |

A user who passes only one gets nothing. That split is what stops an athlete
reading opponent scouting film and a guardian reading coach-only grades, and it
is enforced by RLS and by permission checks inside every write function — not
here. `src/lib/access.ts` decides what is _rendered_; if it were wrong a user
would see a menu item they cannot use, not another athlete's grades.

Both privacy switches (athletes see grades, guardians have access) default
**closed** and are set per program.

This app holds **no service-role key**. Every read goes through the publishable
key and the signed-in user's own cookies, so RLS applies to all of it.

## Layout

```
src/app        routes; actions.ts is every write in the product
src/components shell, film room, forms
src/lib        access rules, queries, aggregation, formatting — all pure and tested
```

`src/lib/columns.ts` lists every column the app selects and every RPC argument it
passes. `src/lib/schema.test.ts` asserts that list against migration 0048 on
every commit, and `data.ts` _builds its select lists from it_ rather than
retyping the names — so a column renamed in the database fails the fast test
suite instead of failing in front of a coach.

## Two deliberate deviations from the brief

**No Tailwind, no shadcn/ui.** The brief names both. This monorepo has neither,
pins its dependency graph deliberately (`docs/architecture/dependency-policy.md`)
and installs with a frozen lockfile in CI. The design goals the brief actually
asks for — dark-mode first, strong typography, subtle field cues, professional
enough for a college staff and simple enough for a youth team — are all met by
`src/app/globals.css`, with zero new dependencies. If the portfolio adopts
Tailwind later, this app moves with it.

**Film bytes do not go through `storage_meta.files`.** That shared table caps an
object at 50 MiB. A single Friday-night game film is 2–8 GiB, so every real
upload would fail at the CHECK constraint. Film gets its own record and its own
private bucket with a 16 GiB ceiling; everything else about the pattern —
tenant-prefixed object paths, register-then-confirm lifecycle, no direct tenant
write path — is copied exactly.

## Status — what is proven and what is not

**Proven, by running it:**

- Migration 0048 applies from an empty database (PostgreSQL 17.6).
- 100 pgTAP assertions in `supabase/tests/48_football_filmstudy.sql`, covering
  the vertical slice and the access boundaries **attacked** — an athlete trying
  to read opponent film, a guardian trying to read grades, a coach trying to
  mark an athlete's film reviewed, a second tenant trying to segment our film.
- 99 unit tests in this app, 57 in `@hl-bos/football`.
- `typecheck`, `lint`, `build`.

**Not proven:**

- This app has **never been run against a live Supabase project**. The database
  layer is tested hard; the app's queries and RPC calls are checked against the
  migration by `schema.test.ts` and typecheck, which is not the same as having
  served a page from a real project.
- The storage upload path has not been exercised against a real bucket.
- No migration has been applied anywhere. That needs explicit approval.

`middleware.ts` raises a deprecation notice on Next 16 (it prefers `proxy.ts`).
It still works, and `apps/executive-portal` uses the same convention; both should
move together rather than this app diverging alone.
