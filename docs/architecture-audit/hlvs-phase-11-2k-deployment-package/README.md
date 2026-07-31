# Phase XI-2K · Production readiness & deployment package — migration 0028

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`

**This is a reviewable deployment package, not a deployment.** Nothing was applied, merged,
or changed in production during this phase. The objective was to hand you a complete,
inspectable plan so you can make an informed go/no-go decision on putting the Knowledge
Graph (migration `0028`) into production. **The decision is yours; the button is not armed.**

---

## In plain language

Everything needed to deploy the Knowledge Graph safely is now written down and cross-checked:
how to apply it, how to undo it, exactly what to verify at each step, the one known tooling
footnote, and a plain-English decision page for you. The change was already validated on a
faithful throwaway copy of production in the previous phase (a real bug was found and
fixed). This phase turns that into an operational package. **No part of it runs until you
approve.**

## The package (what's in this folder)

| #   | Document                                                                       | For whom    | What it is                                                                                                                |
| --- | ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | [01-deployment-runbook.md](01-deployment-runbook.md)                           | Engineer/CI | Exact steps to apply `0028` via the gated `db-migrate` workflow — target, pre-flight, arming, apply sequence, enablement. |
| 2   | [02-rollback-runbook.md](02-rollback-runbook.md)                               | Engineer/CI | How to reverse it — failed-apply, projection-only, and full-schema reversal, each with verified outcomes.                 |
| 3   | [03-production-validation-checklist.md](03-production-validation-checklist.md) | Reviewer    | Concrete pre-apply, post-apply structural, fail-closed, and enablement checks — each a query with an expected result.     |
| 4   | [04-ops-issue-supabase-branching.md](04-ops-issue-supabase-branching.md)       | Operations  | The Supabase branch-provisioner ordering issue — reproduction, root cause, workaround, and whether to file upstream.      |
| 5   | [05-executive-deployment-checklist.md](05-executive-deployment-checklist.md)   | **You**     | Plain-language decision page — what you're approving, what each decision unlocks, how you'll know it worked.              |
| 6   | this file                                                                      | **You**     | Final readiness report + index.                                                                                           |

## Production-readiness assessment

**Migration 0028 is READY FOR PRODUCTION — pending your approval to arm and apply.**

- **It works under real conditions.** Validated on a faithful production-cut copy (XI-2J):
  migration apply (11/11 structural), runtime authorization, RLS/tenant isolation,
  publisher/versioning, all 7 RPCs executed on real multi-hop data, and rollback.
- **The one bug found is fixed and guarded.** `graph_find_blast_radius` had an
  ambiguous-column error (no prior test ever _executed_ the RPCs). Fixed, re-verified, and
  covered by a new pgTAP execution test so it can't recur.
- **The lineage is reconciled.** Production is at `0027`; repo and production identities
  match (XI-2I); `0028` is the correct, only pending migration. `supabase db push` applies
  just `0028` forward onto the existing foundation.
- **It's reversible with no data loss.** 0028 is purely additive to an isolated `graph`
  schema; the tested rollback removes it cleanly and leaves `0001–0027` intact. Any
  projection is re-derivable from source.
- **Deployment is gated, not automatic.** The apply path (`.github/workflows/db-migrate.yml`)
  never auto-runs: it requires a manual dispatch, canonical-target guards, a drift check
  against production, and a required-reviewer approval on a `production` environment.

## Gates (verified this phase)

`pnpm format:check` / `lint` / `typecheck` / `check-migrations` / `lineage` — **clean**;
`pnpm test` — **247/247**. `0028` remains `notYetApplied` in `.hlbos/migration-lineage.json`
(sha256 `f750be18…`) until the approved production apply. The CI `database-tests` job runs
the pgTAP suite (including the new graph execution regression test) on the PR.

## Objectives (against the phase brief)

| #   | Objective                                              | Where                                            | Status |
| --- | ------------------------------------------------------ | ------------------------------------------------ | ------ |
| 1   | Production deployment runbook                          | [01](01-deployment-runbook.md)                   | ✅     |
| 2   | Rollback runbook                                       | [02](02-rollback-runbook.md)                     | ✅     |
| 3   | Production validation checklist                        | [03](03-production-validation-checklist.md)      | ✅     |
| 4   | Post-deployment validation checklist                   | [03](03-production-validation-checklist.md) §B–D | ✅     |
| 5   | Document the Supabase branching issue                  | [04](04-ops-issue-supabase-branching.md)         | ✅     |
| 6   | Governance docs reference the final production process | verified — see below                             | ✅     |
| 7   | CI gates green                                         | verified — see Gates                             | ✅     |
| —   | Executive deployment checklist                         | [05](05-executive-deployment-checklist.md)       | ✅     |

### Objective 6 — governance alignment (verified)

The final production process is the gated `db-migrate.yml` workflow (manual dispatch →
canonical-target guards → offline `check-lineage` → online `check-lineage-drift` against
production → required-reviewer approval → `supabase db push`). This package's runbook (01)
describes exactly that mechanism, and the standing governance documents reference the same
process consistently:

- **ADR-0002** (`docs/architecture/decisions/0002-migration-lineage-governance.md`) — names
  `db-migrate.yml` target guards, the drift-check job, and `supabase db push` as the apply
  path.
- **`.github/workflows/db-migrate.yml`** — the executable process: forward-only, never
  auto-applies, canonical-ref-guarded, reviewer-gated.
- **XI-2F deployment-governance spec** and **XI-2I preview-readiness checklists** — describe
  the same gated apply and drift verification.

No governance document contradicts the final process; no update was required.

## CEO decisions required (summary — full detail in [05](05-executive-deployment-checklist.md))

1. **Arm the deploy path** (3 one-time trust grants): a `production` environment with
   required reviewers, the `SUPABASE_ACCESS_TOKEN` secret, and the `SUPABASE_PROJECT_REF`
   variable set to the canonical project. Until all three exist, the workflow is inert.
2. **Approve the production apply** of `0028` via the reviewer-gated `db-migrate` workflow.
3. **Later/separate:** authorize granting graph permissions and publishing the first
   projection to make the feature live (it ships sealed/fail-closed).

## What remains untouched

Production was **not** modified this phase. No migration applied, no merge, no deploy, no
secrets, no DNS. `0028` is still `notYetApplied`. The stale `hlbos-m1-portfolio` branch
remains archived (deletion still pending your approval). This package is documentation only,
committed to `claude/hlvs-architectural-assessment-ltqs1b`.

## Recommendation

Proceed to a **gated production apply of 0028** when you're ready: arm the path (Decision
1), then approve the apply (Decision 2). Feature activation (Decision 3) can follow at your
pace. If you'd prefer to trigger these from the Development Control Center rather than from
documents, say so and I'll surface Decisions 1–3 as approval-gated buttons there.
