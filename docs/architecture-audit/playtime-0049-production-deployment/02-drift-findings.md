# Drift found during the 0049 pre-flight read

**Date:** 2026-09-17 · Read-only inspection of canonical production before applying
migration 0049.

**None of this was caused by the 0049 apply, and none of it touches the `playtime` schema.**
It is recorded here, and in `knownMigrationDrift` in `.hlbos/canonical.json`, because until
now most of it existed only as prose in a milestone blocker — where no check could see it.

## This was already known, and has grown

A previous session recorded a blocker titled _"Production has drifted from the repository,
and the safe apply path is blocked"_, describing roughly forty out-of-band migrations in
three naming schemes. That was accurate. Re-measured now:

|                                  | Then (approx.) | Now (measured)                                               |
| -------------------------------- | -------------- | ------------------------------------------------------------ |
| Migrations applied to production | ~68            | **99**                                                       |
| Accounted for by this repository | ~28            | **49**                                                       |
| Applied out of band              | ~40            | **50**                                                       |
| Foreign naming schemes           | 3              | **6** — `dma`, `disco`, `jobscout`, `hlvs`, `ingest`, `temp` |

`canonical.json` recorded `migrationsApplied: 27`. It has been corrected to 99, with a note
explaining that the stale number is what let the divergence hide.

## Finding 1 — migration 0048 is applied, and the repository said it was not

The `ats` schema has existed in canonical production since **2026-09-16**, applied out of
band at version `20260916190643`. The repository carries 0048 at `20260916120000`, and the
ledger was never reconciled.

Until this read, **three places stated that 0048 was UNAPPLIED**: the Control Center's
portfolio panel, the Enterprise Catalog, and the milestone task list. All three have been
corrected.

The ATS Resume Optimizer application itself is unchanged: it still writes to a local JSON
file and its Settings page still tells a user exactly that. So the schema is applied but
unused — which is a coherent state, just not the one the repository was describing.

**The two SQL bodies have not been diffed.** Whether production's 0048 is the same SQL as
the repository's is unknown and should be established before anything relies on it.

## Finding 2 — the ordinal counters have collided

Production holds:

| Ordinal | Version          | Name                                               |
| ------- | ---------------- | -------------------------------------------------- |
| 0048    | `20260909203027` | `hlbos_0048_barberos_capability_catalog`           |
| 0048    | `20260916190643` | `hlbos_0048_ats_resume_optimizer`                  |
| 0049    | `20260909203607` | `hlbos_0049_transform_audit`                       |
| 0049    | `20260916210000` | `hlbos_0049_playtime_tracker` ← applied 2026-09-17 |

Ordinals 0048–0058 in production belong to a lineage this repository has never seen
(barberos, transform audit, proposal, discovery call, shop API, product map, client CRM).

This matters because of what the `hlbos_` prefix scheme was _for_. From the header of
`scripts/check-migrations.sh`:

> the production database carries 52 migrations applied from OUTSIDE this repository, using
> four inconsistent naming schemes, with two independent counters that both use the
> 0009–0017 range. Ordinal prefixes there are decorative and actively misleading.
> **HL-BOS migrations are prefixed `hlbos` and validated here so that problem is not
> reproduced.**

It has been reproduced, inside the `hlbos_` namespace itself.

### The part that concerns the approval

The approval for 0049 was given without this being visible. Applying it added the **second**
`hlbos_0049`. That was a judgement call and it is flagged rather than buried:

- The apply was **functionally safe** — `playtime` is a new schema, the version
  `20260916210000` is unique and monotonically after the previous row, and the ledger is
  internally consistent.
- The cost is a **labelling ambiguity** in a ledger that already had one at 0048.
- The alternative — renumbering 0049 in the repository — would have broken this repo's own
  sequential-ordinal rule and failed `pnpm lineage`.

Blocking a delivery on a label, in a ledger already carrying fifty out-of-band migrations,
was not the right trade. But it is the CEO's platform and his call to make, so it is written
down here rather than absorbed silently.

## Finding 3 — the online drift check has evidently never run against production

`scripts/check-lineage-drift.mjs` exists exactly for this and states its own purpose:

> It DOES fail when … the remote has an applied version the repo does not know about
> (foreign / out-of-band)

There are fifty such versions. The check would fail on the first run. It is gated behind the
`db-migrate` workflow, which the milestone blocker records as unusable _because_ of the
drift — a loop where the control that would report the problem is disabled by the problem.

This is the one finding with a cheap first step: run the drift check in report-only mode,
outside the gated workflow, so the number is visible without needing the workflow to be
safe first.

## What is needed

Reconciling two forked lineages is an architectural decision about the platform, not a
cleanup task, and the repository's own history (phases XI-2F through XI-2I) shows how
expensive it is to get wrong. The options are, broadly:

1. **Adopt** the other lineage into this repository and renumber to a single counter.
2. **Separate** it into its own Supabase project, so two products stop sharing one ledger.
3. **Declare** this repository non-canonical for those schemas and stop asserting otherwise.

Each has real consequences. None should be chosen by an engineer on their own.
