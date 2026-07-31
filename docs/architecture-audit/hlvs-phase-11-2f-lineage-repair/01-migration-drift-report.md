# XI-2F · Migration drift report + checksum comparison (0023–0027)

**Question:** why do migrations `0023–0027` have different version identifiers in the
repo vs production, and is the SQL identical? **Answer: the SQL is byte-for-byte
identical; only the version identifier (and cosmetic comments) differ.** All evidence
below is read-only.

## What differs

| # / name                       | Repo file version | Production applied version | Names match | Order match |
| ------------------------------ | ----------------- | -------------------------- | :---------: | :---------: |
| 0023 blueprint_engine          | `20260727090000`  | `20260728181327`           |     ✅      |     ✅      |
| 0024 commerce_provisioning     | `20260727090100`  | `20260728182035`           |     ✅      |     ✅      |
| 0025 hlvs_factory              | `20260727090200`  | `20260728182459`           |     ✅      |     ✅      |
| 0026 bti_platform              | `20260727090300`  | `20260728182832`           |     ✅      |     ✅      |
| 0027 bti_intake_and_public_api | `20260728090000`  | `20260728182949`           |     ✅      |     ✅      |

`0001–0022` version identifiers match production **exactly**; `0028` is repo-only
(not applied). So the drift is confined to `0023–0027` and is a **version-identifier**
difference.

## Checksum comparison — the SQL content is identical

Two hashes per migration: the **raw** file (differs — see below) and the
**normalized** SQL (comments + all whitespace stripped, identical algorithm on both
sides). Production's SQL was read from `supabase_migrations.schema_migrations.statements`.

| #    | Repo raw bytes | Prod stored bytes | Raw Δ  | **Normalized md5 (repo == prod)**  | Normalized len |
| ---- | -------------- | ----------------- | ------ | ---------------------------------- | -------------- |
| 0023 | 76 342         | 67 859            | +8 483 | `f7ac093f…` **= =** `f7ac093f…` ✅ | 59 679         |
| 0024 | 88 871         | 88 840            | +31    | `984e33a8…` **= =** `984e33a8…` ✅ | 68 533         |
| 0025 | 70 771         | 70 736            | +35    | `6d9642bd…` **= =** `6d9642bd…` ✅ | 54 749         |
| 0026 | 58 149         | 58 118            | +31    | `56d7affd…` **= =** `56d7affd…` ✅ | 42 046         |
| 0027 | 14 825         | 14 795            | +30    | `386591ed…` **= =** `386591ed…` ✅ | 7 165          |

**All five normalized md5s match exactly.** The raw-byte differences are explained by:

- the repo files carry the required `-- rollback:` comment block and header comments
  (enforced by `scripts/check-migrations.sh`) that Supabase's stored `statements` do
  not retain — this accounts for the uniform ~30-byte deltas on 0024–0027;
- **0023** carries a larger comment/whitespace delta (+8 483 raw bytes) but its
  **normalized SQL is identical** — the extra bytes are comments/formatting, not SQL.

Corroborating structural evidence (XI-2E, live query): production's schemas and table
counts (`discovery` incl. blueprint tables, `sales`/`provisioning`, `hlvs` 19 tables,
`bti` 14 tables) are exactly what these five migrations produce. The **resulting
schema is equivalent**, independent of the text comparison.

## Why the drift arose (mechanism)

**Unverified / strongly inferred.** The repo files for `0023–0027` appear to have been
re-timestamped (renamed) at some point after production applied them — production
recorded the versions it applied (`20260728…`), while the repo now carries earlier
version strings (`20260727…`). Production's applied history is authoritative and
unchanged; I cannot see production's pre-current bookkeeping to prove the exact
sequence of events, so the _mechanism_ is inferred while the _current divergence_ is
verified.

## Consequence

`supabase db push`/`migration list` key on the version string. Because the repo's
`0023–0027` versions are **not** in production's `schema_migrations`, the tooling would
treat them as pending and try to **re-apply** them (objects already exist → failure),
and would not cleanly reach `0028`. **This must be repaired before 0028 can be applied
through the governed path.** Repair strategy: [03-migration-repair-strategy.md](03-migration-repair-strategy.md).

## Authoritativeness

Production's applied history is **authoritative** (it is what actually ran and what the
live schema reflects). The repair therefore aligns the **repository** to production —
not the other way around — via an approved forward-only mechanism, never by rewriting
production's history.
