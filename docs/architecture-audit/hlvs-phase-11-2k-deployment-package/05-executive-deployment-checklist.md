# XI-2K · Executive deployment checklist — Knowledge Graph (migration 0028)

**For:** Keith Herman, CEO · **Date:** 2026-07-31
**This is a decision package, not an action already taken.** Nothing has been deployed,
merged, or changed in production. This page tells you — in plain language — what you're
approving, what each decision unlocks, and how you'll know it worked.

## In one paragraph

The Knowledge Graph change (called "migration 0028") has been built, and tested on a
throwaway copy of the real production database. It works, one real bug was found and fixed
during that testing, and the platform's own quality checks are all green. It is **ready to
go into production — but only when you say so.** Putting it live is deliberately **not**
automatic. It takes three one-time trust decisions from you to even make the deploy button
work, then one approval to actually run it. You never touch a terminal — the deploy runs
itself through a gated workflow after you approve.

## What you are approving (and what each unlocks)

Think of it as **arm the button**, then **press the button**, then (later, separately)
**turn the feature on**.

### Decision 1 — Arm the deploy path (3 one-time trust grants) 🔑

These are access decisions only you can make. Until all three exist, the deploy workflow is
**inert** — it literally cannot change production.

- [ ] **Create a `production` approval gate** — a GitHub "Environment" named `production`
      with you (or a trusted reviewer) as required approver. _This approval gate is what
      makes the deploy pause and wait for your yes._
- [ ] **Add the Supabase access token** — a secret key that lets the workflow talk to the
      database. _It never appears in the code or logs._
- [ ] **Set the target to the canonical project** (`mvvtngiopdrgiedjmhfb`). _Built-in guards
      refuse to run against anything else, so it can't hit the wrong database._

**What this unlocks:** the ability to deploy — nothing deploys yet.

### Decision 2 — Approve the deploy 🔑

- [ ] After the automated checks pass, the workflow **pauses and asks for your approval.**
      Approving runs the one pending change (`0028`) onto production. _This applies the
      change forward-only; it does not rebuild or disturb the existing database._

**What this unlocks:** the Knowledge Graph structure exists in production — but is still
**sealed** (no one can use it yet, by design).

### Decision 3 — Turn the feature on (later, optional, separate) 🔑

- [ ] Authorize granting the graph permissions to the platform-owner role and publishing
      the first graph snapshot (145 nodes / 427 edges). _Until you do this, the feature is
      installed but dormant — fail-closed on purpose._

**What this unlocks:** the Knowledge Graph is live and readable.

## Why you can trust "it works"

| Question                            | Answer                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Was it tested on the real thing?    | On a **faithful throwaway copy** of production — real security, real identity, real queries. Production itself was never touched.                                |
| Did testing actually find anything? | **Yes** — a real bug in one graph query. It's **fixed**, re-tested, and now has a permanent test guarding it.                                                    |
| Could it damage existing data?      | No. The change **only adds** an isolated new area. It changes nothing in the existing 27 pieces of the database. Production also has **no customer data** today. |
| Can it be undone?                   | Yes — a rollback was **tested on the copy** and cleanly removed everything, leaving the foundation intact. See the rollback runbook.                             |
| Are the platform's checks green?    | Yes — all automated quality gates pass; full test suite **247/247**.                                                                                             |

## What could go wrong, and the answer

- **The deploy errors partway.** The change is applied in a single all-or-nothing
  transaction — a failure rolls itself back and production stays at its current state. We
  diagnose, fix in the repo, and re-run through the same gate.
- **A future preview copy fails to build.** Supabase's copy-making tool mis-orders our
  files when cloning from scratch (documented separately). This affects **making test
  copies**, not this production deploy, and we have a workaround. It's a known, contained
  footnote.
- **The graph data looks wrong after go-live.** The data can be **rolled back to the prior
  snapshot** without touching the structure, and any snapshot is fully re-derivable from
  source. No irreplaceable data lives in the graph.

## The one honest caveat

Fixing the bug changed the content of `0028`, so its checksum is different from the version
that existed before testing. That's expected — the version now queued for production is the
**tested, fixed** one, and the governance manifest reflects it. Nothing stale ships.

## Your decision

- [ ] **Approve arming the deploy path** (Decision 1) — or ask questions first.
- [ ] **Approve the production deploy of 0028** (Decision 2) — after arming.
- [ ] **Defer feature activation** (Decision 3) to a later, separate approval.

If you want any of the underlying detail, the full runbooks and checklists are in this same
folder (see [README.md](README.md)). If you'd rather not decide from a document, say so and
I'll surface these as buttons in the Development Control Center instead.

**Nothing happens until you check a box above and tell me to proceed.**
