# Phase XI-2D · Preview validation of the Knowledge Graph read model — Completion report

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Production-readiness recommendation: NOT READY FOR PRODUCTION MIGRATION.**
Nothing was applied to any remote database. Production was not touched. No merge.

---

## In plain language

I was asked to prove the new "knowledge graph" database change (migration 0028)
works safely by trying it on a **throwaway copy** of the database before anyone
considers production. Doing that carefully surfaced **two things worth stopping
for** — one a real bug in our own change, one a bigger surprise about our
database. I fixed the bug, proved the fix, and I'm bringing you the surprise
rather than plastering over it.

### 1. A real bug in migration 0028 — found and fixed

Our platform has a **frozen rule** (set back in migration 0003) for how a
permission is named: it must be three parts, `area.thing.action`, e.g.
`billing.invoice.read`. The knowledge-graph change tried to create two
permissions named `graph.read` and `graph.manage` — only **two** parts. The
database's own rule **rejects** those. This means the change, as written in the
previous phase, **would have failed the moment it hit a real database.**

Why didn't we catch it before? The previous phase tested against a **simplified
stand-in** for our security tables that didn't include this rule. The stand-in
was more forgiving than the real thing. This phase's entire job is to catch
exactly that gap — and it did.

**Fixed:** the two names are now `graph.projection.read` and
`graph.projection.manage` (three parts, valid). I re-tested against a stand-in
that **does** enforce the real rule, and everything passes — publish, activate,
roll back, and all the safety rejections. I also confirmed the stricter test now
**rejects the old names and accepts the new ones**, so this can't slip through
again.

### 2. The reachable database is a _different build_ than this codebase

This is the bigger finding. The only non-production database I can reach is a
**preview copy of HL-BOS Core production**. When I compared it to this
repository, they **agree for the first eight migrations and then completely
diverge**:

- **This codebase** builds: events, billing, visibility, communications,
  discovery, the HLVS factory, BTI, and so on.
- **The reachable production database** builds: a **portfolio** module and a
  **govcon** (government-contracting) suite — none of which is in this
  repository — and it is **two migrations further along** than this repo knew.

In other words, **the database this repository describes is not the database
that is actually running as HL-BOS Core.** They share a common ancestor and then
became two different applications. There is no reachable "preview of _this_
codebase" to validate against, because a preview is always a copy of production —
and production is the other build.

I did **not** apply our graph change to that foreign preview. It would have
written unrelated tables into someone else's milestone and produced a
"successful" result that wouldn't actually tell us how _our_ production would
react. That is the kind of green light that lies, and the phase's own stop
conditions say to halt and report here.

---

## What I did / did not touch

| Did                                                                                    | Did **not**                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Read-only inspection of the preview branch (branches, migrations, schema, constraints) | Apply migration 0028 to **any** remote DB       |
| Fixed the permission-key defect in migration 0028                                      | Touch production (`mvvtngiopdrgiedjmhfb`)       |
| Re-validated on a **constraint-faithful** throwaway local Postgres                     | Change production permissions / data / auth     |
| Corrected the affected XI-2C docs                                                      | Publish any projection to a remote DB           |
| Ran all quality gates                                                                  | Merge anything · connect the portal to a remote |

## Evidence

- Environment determination + the lineage divergence: [01-environment-determination.md](01-environment-determination.md)
- The defect, the fix, and the faithful re-validation (10/10 + negative control): [02-permission-key-defect.md](02-permission-key-defect.md)

## Quality gates (exact results)

| Gate                                                   | Result                                              |
| ------------------------------------------------------ | --------------------------------------------------- |
| `pnpm format:check`                                    | ✅ clean                                            |
| `pnpm lint`                                            | ✅ clean                                            |
| `pnpm typecheck`                                       | ✅ clean (8 projects, TS 6.0.3)                     |
| `pnpm test`                                            | ✅ **247 / 247**                                    |
| Constraint-faithful local validation of corrected 0028 | ✅ applied + T1–T10 pass; negative control confirms |

## Why "NOT READY FOR PRODUCTION MIGRATION"

Two independent reasons, either sufficient on its own:

1. **No faithful environment exists yet.** There is no reachable preview of this
   repository's own schema, so the runtime behaviours that only a real Supabase
   environment can prove — RLS enforcement, real `has_permission` role wiring,
   tenant isolation, PostgREST exposure, the portal talking to live `graph_*`
   RPCs — remain **unproven end-to-end**. (The migration's _shape_ and its
   publish/activate/rollback/integrity logic are proven locally; its _authz
   enforcement in a real cluster_ is not.)
2. **The repo↔production divergence must be resolved first.** Applying a
   migration numbered `0028` to a production whose `0028`/`0029` are already
   different (govcon) migrations, on a schema this repo doesn't match, is not a
   safe production step. That divergence is a governance question, not an
   engineering detail I should silently work around.

## The one decision for you

**How should we get a faithful, disposable place to validate this — and which
database is the real HL-BOS Core going forward?**

I am **not** asking you to run any commands. I'm asking you to choose the path;
I'll do the engineering:

- **Option A — dedicated validation project.** Authorize me to stand up one
  **new, disposable Supabase project** (a cost decision — it bills a small hourly
  amount while it exists) seeded **only** with this repository's own migrations
  0001→0028 and synthetic test identities. That gives a faithful, isolated place
  to finish the runtime validation (RLS, tenant isolation, portal wiring) with
  **zero** production exposure, and I tear it down afterward.
- **Option B — reconcile lineages first.** Treat the repo↔production divergence
  as the priority: I produce a reconciliation assessment (what production
  actually is, how it drifted from this repo, and how to bring them back into one
  source of truth) before any graph work touches a real HL-BOS database.

Either way, **the corrected migration is now safe to sit in a PR** — it is
demonstrably valid against the real permission-key rule, and it changes nothing
until an approved apply.

## Deliverables map (against the phase brief)

| Intended deliverable                          | Status this phase                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Pre-apply checkpoint / environment report     | ✅ [01-environment-determination.md](01-environment-determination.md)                                           |
| Apply 0028 to a verified preview              | ⛔ **Correctly not done** — no faithful, in-lineage preview reachable                                           |
| Real identity/authorization validation        | ◑ Partial — function-gate + constraint validation done locally; RLS/role wiring needs a real in-lineage cluster |
| Publish / activate / rollback demonstration   | ✅ Demonstrated on the constraint-faithful cluster (T4/T7/T8)                                                   |
| Integrity & negative tests                    | ✅ T3/T5/T6 (integrity-false, dangling-edge, self-edge)                                                         |
| Parity (in-code ↔ DB)                         | ◑ Structural parity holds by construction; full-graph parity needs the real cluster                             |
| Tenant isolation / cross-tenant non-inference | ⛔ Requires real RLS (superuser bypass locally) — deferred to a faithful env                                    |
| Portal runtime integration to live RPCs       | ⛔ **Correctly not done** — no in-lineage preview + no browser service-role                                     |
| Defect discovery + remediation                | ✅ Permission-key defect found, fixed, re-validated                                                             |
| Production-readiness recommendation           | ✅ **NOT READY** (this document)                                                                                |
| Activation/rollback safety                    | ✅ Atomic activate + rollback proven (T7/T8)                                                                    |

## What remains untouched

No production migration, deployment, permission change, data change, portal
connection, merge, DNS change, auth change, autonomous refresh, Factory
enforcement, Discovery/Transportation work. Existing Catalog / Capability Library
/ Application Registry / portal consumers unchanged and passing (247/247).
