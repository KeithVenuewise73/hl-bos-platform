# Migration 0051 (`hype`, 5-Star Hype Video) — production apply record

## Status, stated plainly

| Thing                                | State                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Migration `0051_hype_video`          | **APPLIED** to canonical production (HL-BOS Core, `mvvtngiopdrgiedjmhfb`) on 2026-09-30 under CEO approval. |
| Recorded in production as            | `hlbos_0051_hype_video` (production assigns its own version number; the repo file is `20260930120000`). |
| Data in `hype`                       | 8 seed templates. **No projects, media or packages.**                                                  |
| The app (`apps/hype-video`)          | **Not connected to it.** Still stores projects on the machine it runs on.                              |

## How it was applied, and why this way

Applied on its own, from the merged file byte for byte (SHA-256
`0174b1da…07bb71cdb`, matching `.hlbos/migration-lineage.json`). It was
**not** pushed through `.github/workflows/db-migrate.yml`, for the reason
recorded in `social-publishing-phase-1.md`: production carries migrations
from other lineages and some of ours under different version identifiers,
so `supabase db push` would try to re-run migrations production already
has. That reconciliation is still outstanding, and `.hlbos/canonical.json`
has again deliberately **not** been rewritten here.

Before applying: the `hype` schema did not exist; `auth.users` and
`auth.uid()` did; the server is PostgreSQL 17.6. The migration is
purely additive (a new schema) and touches no existing object.

## Verification on production

**Fingerprint.** Counted on production and on the locally tested copy (all
51 migrations applied from empty, 1106 pgTAP assertions, 0 failing):

```
tables|columns|checks|fks|policies|functions|enums|rls_on|rls_forced|triggers|indexes|authed_grants|anon_grants|anon_usage|templates
     7|     79|    16| 10|      17|        3|    8|     7|         7|       5|     11|           17|          0|f         |        8
```

Identical, including an MD5 over the sorted names of every CHECK
constraint (`05165482…`) and every policy (`07d10732…`).

**The refusals, probed live.** A single block ran on production and was
rolled back by a deliberate exception at the end, so nothing was left
behind (verified afterwards: 0 projects, 0 media):

```
minor_no_guardian=refused   consented=ok   unchosen_share=refused
fake_generated=refused      fake_payment=refused   foreign_media=refused
```

## Advisor gate

|                      | Before | After | Net new | About `hype` |
| -------------------- | ------ | ----- | ------- | ------------ |
| Security findings    | 40     | 40    | **0**   | 0            |
| Performance findings | 591    | 614   | +23     | 23           |

The 23 performance findings, honestly:

- **16 `auth_rls_initplan` (WARN) — a real mistake in 0051.** The policies
  compare `owner_id = auth.uid()`, which Postgres re-evaluates per row; the
  recommended form is `owner_id = (select auth.uid())`, evaluated once per
  query. No cost today (the tables are empty), but it should be fixed
  before the app uses the schema, with a small forward-repair migration.
  That migration needs its own approval.
- **5 `unindexed_foreign_keys` (INFO)** — `owner_id` on outputs, media and
  purchases, `project_id` on purchases, `template_key` on projects. Left as
  is, matching the platform-wide precedent (not adding indexes to empty
  tables purely to silence INFO findings).
- **2 `unused_index` (INFO)** — the tables are empty; these clear once the
  app uses them.

## A governance finding, not caused by this apply

Production's migration history already contains other branches'
migrations that reuse this repository's ordinals, including an unrelated
`hlbos_0051_unknown_is_not_complete` and `hlbos_0048`–`0058` BarberOS
entries. Two lineages are numbering `hlbos_NNNN` independently. The names
differ, so nothing collided, but ordinals alone no longer identify a
migration in production. This belongs in the same reconciliation as the
`canonical.json` drift above.

## Rollback

`DROP SCHEMA IF EXISTS hype CASCADE;` — the schema is additive and holds no
user data. Per `db-migrate.yml`'s rule, a rollback would itself be a new,
approved, forward migration.
