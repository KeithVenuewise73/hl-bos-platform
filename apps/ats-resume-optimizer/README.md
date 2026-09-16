# ATS Resume Optimizer

Compare a job posting against your resume, see every requirement matched against evidence you actually have, and generate a tailored, ATS-friendly resume in which **every sentence is traceable to a source fact**.

The engine is [`@hl-bos/ats-resume`](../../packages/ats-resume/README.md); this app is the interface over it.

---

## Run it

```bash
pnpm install
pnpm --filter @hl-bos/ats-resume-optimizer dev
# http://localhost:4600
```

No credentials, no database, no AI key. On first start it seeds a sample profile — a fictional transportation executive — so there is something to look at immediately. Every sample record is labelled **Sample data** on screen, and Settings deletes all of it in one click.

Production build:

```bash
pnpm --filter @hl-bos/ats-resume-optimizer build
pnpm --filter @hl-bos/ats-resume-optimizer start
```

---

## Environment variables

All optional. All server-side; none of them is browser-visible.

| Variable            | Default         | What it does                                                                                                                                   |
| ------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | unset           | Enables Claude for two jobs: re-reading a job posting, and proposing bullet phrasing. Without it the built-in rules engine runs every feature. |
| `ATS_AI_MODEL`      | `claude-opus-5` | Which model, when a key is set.                                                                                                                |
| `ATS_DATA_DIR`      | `.data`         | Where the JSON store is written, relative to the app directory unless absolute.                                                                |
| `ATS_SEED_DEMO`     | `true`          | Set to `false` to start with an empty workspace.                                                                                               |

`src/lib/config.ts` is the only file in this app that reads `process.env`, and it carries the matching ESLint exemption in the repository config. The API key is read on the server, used on the server, and never returned to a page.

---

## The screens

| Screen                | What it is for                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**         | Jobs analyzed, resumes created, active applications, average internal score, recurring strengths, recurring gaps. Every figure counted from stored records; a panel with nothing to count says so. |
| **Candidate Profile** | The structured career database. Every fact carries its source (Resume / You confirmed). Adding a fact here is the **only** way a new claim can enter the system.                                   |
| **Master Resume**     | Upload DOCX/PDF or paste text. Shows exactly how it was parsed, and an ATS formatting check on the extracted text. Previous versions are kept.                                                     |
| **New Job Analysis**  | Paste a posting. Produces the evidence matrix, keyword buckets, terminology opportunities and both scores.                                                                                         |
| **Analysis results**  | Score and breakdown, the evidence matrix with critical gaps at the top, terminology opportunities, keyword analysis, recommendations.                                                              |
| **Resume review**     | Split screen: the generated resume (every sentence editable) beside the analysis. Each sentence discloses its source evidence, the requirement it answers, and why it is worded that way.          |
| **Applications**      | Company, role, URL, dates, resume version, status, recruiter, interview dates, notes. An analysis starts an application automatically.                                                             |
| **Resume Library**    | Every generated version, with original wording, optimized wording and the reason for each change.                                                                                                  |
| **Settings**          | What is switched on, stated plainly: AI provider, storage, the scoring model, the ten services, sample data.                                                                                       |

Every form works **without JavaScript**. A career database that stops saving because a bundle failed to load is a career database that loses work.

---

## What is enforced, and where

The promise is _optimize aggressively, fabricate nothing_. It is enforced in three places, not one:

1. **`validateClaim()`** — every generated sentence is checked against the evidence it names. A number not in the evidence makes the line `unsupported`. A word not traceable to the evidence or to terminology the analysis licensed makes it `needs_confirmation`.
2. **`buildExportDocument()`** — runs unconditionally in the download route and drops everything that did not clear the validator. The response carries `X-Claims-Dropped`, so the behaviour is observable rather than silent.
3. **Migration 0048** — `CHECK` constraints that make it impossible to record an unsupported or unconfirmed claim as exported. (Written and verified; see _Storage_ below.)

Editing a sentence re-runs the validator. That is deliberate: the check is on the sentence, not on who typed it, so your own edit can move a line from Verified to Needs confirmation. Confirming a flagged line stores it in your profile as a **user-confirmed career fact** — the claim stops being unsupported because supporting evidence now exists, not because a flag was flipped.

---

## Storage

A single JSON document, written atomically (write-then-rename), at `ATS_DATA_DIR/workspace.json`.

That is a real choice, not a placeholder: a career database is one person's data, read and written by one process, and this way the app works with no credentials and no migration. Every record is a plain serialisable object, so moving to PostgreSQL is a different implementation of the same reads and writes.

**PostgreSQL is not connected.** The schema is written and committed at `supabase/migrations/20260916120000_hlbos_0048_ats_resume_optimizer.sql` — 17 tables, RLS enabled _and forced_ on every one, 68 policies, zero grants to `anon`. It was verified against a local PostgreSQL 16 (including the anti-fabrication constraints and cross-user isolation) and it has **not been applied to any project**. The Settings page says this on screen. Applying it is a separate decision.

---

## Deliberate deviations from the brief

Stated rather than quietly taken:

- **No Tailwind or shadcn/ui.** No app in this repository uses a CSS framework, and the dependency policy (`docs/architecture/dependency-policy.md`) is tight. `src/app/globals.css` is a token-based design system in one file: light and dark, responsive, with one colour per status and a word beside it.
- **No Supabase Auth yet.** The app is single-operator and local; the schema is written for `auth.uid()` and is ready for it.
- **URL ingestion is not built.** Job boards block automated fetches and return a login wall, so a button for it would fail most of the time. The URL field is stored with the application, and the page says exactly why fetching is not offered.
- **Roles stay in reverse-chronological order.** The optimizer expresses relevance through bullet order and bullet count, not by re-sorting employment history — re-sorting breaks date parsing in every ATS worth optimising for, and reads to a human like something is being hidden.

---

## Health

```
GET /api/health
```

Reports whether the store is readable, which provider is active, and how many records exist. It reads the store before answering, so it can actually fail.
