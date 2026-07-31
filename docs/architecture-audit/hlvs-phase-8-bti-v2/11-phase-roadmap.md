# HL-BTI v2 — Phase Roadmap (Decisions, Not Chores)

## In plain language

The v2 engine is **built and tested, but not deployed and not live**. All 41 tests
pass; nothing has been shipped to any environment; no database has been touched.
This roadmap lays out the path from "built, un-deployed" to "running behind the
Executive Portal login" as a short series of **CEO decisions**. Each phase says
what it unlocks, the one decision it needs from you, and the hard gates that
protect you. You never run a command; you approve, or you don't.

### Where we are today

- The engine works, over a clearly-labelled **sample**, entirely in the browser.
- No customer data flows through it yet.
- **Nothing is deployed. No database has been migrated. No customer app was
  changed.** Those are the standing gates for this whole phase, and they hold until
  you say otherwise.

---

## The gates that never move

Three rules sit above every phase below:

1. **No deploy without your approval.**
2. **No database migration is applied without your explicit approval** — not to
   production, not to staging, not anywhere.
3. **No customer app is modified** as part of shipping v2.

If any phase seems to require breaking one of these, it stops and comes back to you
as a decision.

---

## Phase 1 — Merge the v2 package + portal section

**What it unlocks:** the tested engine and its Executive Portal section become part
of `main`, so the work is preserved and reviewable. The portal shows the full
five-answer analysis over the **sample** assessment — real capability, honestly
labelled as a demonstration.

**The decision you make:** approve the pull request. The console shows you green
checks in plain English; you click approve, or you send it back.

**Hard gates:** this is a code merge only. **No deploy, no migration, no customer
app change.** The sample stays a sample.

**Done when:** the PR is merged with green checks, and the portal renders the
sample analysis.

---

## Phase 2 — Approve optional v2 persistence (CEO-gated)

**What it unlocks:** the ability to _save_ a v2 run so it reopens on any device and
can feed the cross-business CEO dashboard. Today the engine produces results but
keeps none; this phase would give it a place to store them.

**The decision you make:** approve authoring a migration for the **proposed** v2
tables described in `07-database-design.md` (`bti.transformation_runs`,
`bti.recommendations_v2`, `bti.approvals`, `bti.gov_opportunities`,
`bti.gov_assessments`) and their permission keys. This is a **business decision
about persistence**, and it is the one thing only you can grant.

**Hard gates:** the design in `07-database-design.md` is **PROPOSED and un-applied**
— it is not in `supabase/migrations/` and has never been run. Approving this phase
authorizes _writing_ a real migration for review; it does **not** apply anything.
Applying it is a further, explicit approval after you have seen the migration and
its plain-English summary.

**Done when:** you have either approved authoring the migration (which then returns
to you for a second approval to apply), or declined — in which case the engine
keeps working exactly as it does today, without persistence.

> **This phase is entirely optional.** The engine does not need it to function. If
> you never approve it, v2 still runs; it simply does not save.

---

## Phase 3 — Wire live, read-only assessment data (replace the sample)

**What it unlocks:** the portal runs the engine over a **real** completed
assessment instead of the sample, turning the demonstration into a genuine
executive analysis for a real business in the portfolio.

**The decision you make:** approve reading real assessment data (the existing
`bti.assessments` / scores) into the engine. Because this is **read-only** — the
engine consumes ratings, it does not write them — the risk is low, and honesty is
preserved: any business without a completed assessment shows as _no data_, never a
fabricated result.

**Hard gates:** read-only. **No deploy of new write paths, no migration** (this uses
data that already exists). The `sample` flag is set to false **only** for genuine
runs; sample runs stay labelled.

**Done when:** the portal produces a live analysis from real ratings for at least
one real business, with empty states that explain themselves.

---

## Phase 4 — Connect a government-opportunity data source

**What it unlocks:** the Government Contracts intelligence runs against real
opportunities (title, required capabilities, and — when known — contract value)
instead of hand-entered examples, producing win-probability, capability gaps and a
CEO bid/no-bid recommendation for actual solicitations.

**The decision you make:** approve where government opportunities come from —
manual CEO entry to start, or a feed later — and authorize the (optional) storage
from Phase 2 for `bti.gov_opportunities` / `bti.gov_assessments`.

**Hard gates:** the engine still **decides nothing** — every bid carries a required
CEO spend approval, and profit stays `null` until a contract value is supplied. **No
deploy or migration beyond what Phase 2 already approved.**

**Done when:** you can assess a real opportunity and receive an honest, CEO-gated
recommendation.

---

## Phase 5 — Deploy behind the Executive Portal login

**What it unlocks:** the whole thing goes live for signed-in executives, behind
authentication, reachable from anywhere — the point at which v2 stops being local
and becomes a running capability.

**The decision you make:** approve the deployment. This reuses the **Phase VII
Executive Portal deploy runbook** already written and validated
(`docs/architecture-audit/hlvs-phase-7-executive-portal/`), so there is no new
engineering ceremony — the console follows the existing steps and shows you the
result in plain English.

**Hard gates:** deploy only happens on your explicit approval. Access is gated by
Supabase Auth and `identity.has_permission(...)` (the publishable/anon key is not a
security boundary — RLS and the permission-checked RPCs are). Any database the
portal reads must already have been migrated under a prior, explicit approval.

**Done when:** an authorized executive can log in and run a live transformation
analysis, and you have approved that it is live.

---

## The whole path at a glance

| Phase  | Unlocks                                             | Your decision                                 | Deploy?              | Migration?                                |
| ------ | --------------------------------------------------- | --------------------------------------------- | -------------------- | ----------------------------------------- |
| **P1** | v2 code + portal section on `main`, sample analysis | Approve the PR                                | No                   | No                                        |
| **P2** | Optional persistence of v2 runs                     | Approve authoring the migration               | No                   | Only after a **second** explicit approval |
| **P3** | Live read-only real analysis                        | Approve reading real assessment data          | No                   | No (uses existing data)                   |
| **P4** | Real government-opportunity assessment              | Approve the opportunity source                | No                   | Only what P2 approved                     |
| **P5** | Live behind login                                   | Approve the deploy (reuses Phase VII runbook) | **Yes, on approval** | Only what was pre-approved                |

Every step is a decision you can make with one click, or decline. Nothing on this
roadmap asks you to open a terminal, run Git, or touch a database — those remain
the engineer's job, hidden behind the console. And nothing moves to deploy or
migration without your explicit, plain-English approval.
</content>
