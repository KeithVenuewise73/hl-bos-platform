# Phase XI-2G · Migration Reconciliation Strategy — Completion report

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Planning only. Nothing renamed, no production touched, no history rewritten, no repair executed, no deploy, no merge.**

Annexes: [01-options-analysis.md](01-options-analysis.md) · [02-preview-and-activation-plan.md](02-preview-and-activation-plan.md)

---

## In plain language

The five-migration label mismatch (0023–0027) is harmless — same SQL, same schema, proven
in the last phase. This phase asked one question: **what is the safest way to tidy it up?**
I evaluated four methods against production safety, repo integrity, git history, developer
workflow, CI, maintainability, and rollback. The clear winner **touches nothing on the
live database at all** — it aligns the five repository filenames to what production
actually recorded, and git keeps their history intact. I did **not** execute it; this is
the recommendation for your approval.

## Strategy comparison matrix

Score key: ✅ strong · ⚠️ caveat · ❌ weak.

| Criterion                       | A · Metadata repair  | B · Compat manifest  | C · Forward migration  |   **D · Repo rename**    |
| ------------------------------- | :------------------: | :------------------: | :--------------------: | :----------------------: |
| Production safety               | ⚠️ edits prod ledger |       ✅ none        | ❌ SQL on system table |       ✅ **none**        |
| Repository integrity            |          ✅          |          ✅          | ⚠️ adds odd migration  |   ✅ content identical   |
| Git history preservation        |          ✅          |          ✅          |           ✅           |   ✅ (rename-tracked)    |
| Developer workflow              |          ✅          | ❌ permanent mapping |      ❌ foot-gun       |     ✅ **cleanest**      |
| CI compatibility                |          ✅          |     ⚠️ ours only     |           ❌           |            ✅            |
| Future maintainability          |  ⚠️ fictional times  |   ❌ drift forever   |           ❌           | ✅ **one clean lineage** |
| Rollback complexity             |   ⚠️ 10 prod edits   |          ✅          |           ❌           |  ✅ **revert 1 commit**  |
| Operational simplicity          |  ⚠️ armed prod path  |          ✅          |           ❌           |   ✅ **1 repo commit**   |
| **Unblocks `db push` to 0028?** |          ✅          |          ❌          |           ❌           |            ✅            |

Only **A** and **D** actually unblock the governed tooling. **B** documents the drift but
the Supabase CLI ignores our manifest, so it never advances; **C** doesn't fix the
ordering and needs a dangerous ledger mutation to even pretend to. Full analysis with
per-criterion reasoning: [01-options-analysis.md](01-options-analysis.md).

## Recommendation — Option D (repository filename reconciliation)

**Align the repo's `0023–0027` filenames to production's applied versions** (content
byte-identical), regenerate the checksum manifest, and clear the recorded drift.

Why D over A (the only other option that works):

- **Least invasive where it matters most:** D touches **nothing** on production; A edits
  production's authoritative migration ledger 10 times.
- **Correct direction of truth:** production is canonical (ADR-0001, verified). D aligns
  the _follower_ (repo) to the _source of truth_. A does the reverse — editing the
  authoritative record to match the repo that drifted.
- **Preserves honesty:** A would stamp production's ledger with applied-at times
  (`20260727…`) that are fictional (the SQL actually ran `20260728…`). D leaves
  production's truthful record untouched.
- **Git history is preserved:** identical content ⇒ a 100%-similarity rename; `git log
--follow` tracks each file across it. This is a normal forward commit, **not** a
  history rewrite.
- **Simplest and safest rollback:** one commit to revert vs ten production edits.

Recommended complement: keep the XI-2F governance manifest + a short ADR note as the
permanent audit record of _why_ the rename happened (this is Option B used correctly — as
documentation, not as the fix).

## Knowledge Graph (migration 0028)

**Confirmed unchanged** — checksum `07b9276e…`, `notYetApplied=true` in the lineage
manifest; the only edit it ever had was the XI-2D permission-key correction. It becomes
safe to apply **after** (1) Option D reconciliation and (2) a green runtime validation on
a fresh faithful preview cut from current production. Sequenced activation plan:
[02-preview-and-activation-plan.md](02-preview-and-activation-plan.md).

## Preview strategy (designed, not created)

After reconciliation, cut a disposable preview branch **from current canonical
production** (not the abandoned branch) — it then shares one lineage with the repo, so
`0028` applies cleanly on it and the real RLS / tenant-isolation / RPC / portal checks can
run. Design: [02-preview-and-activation-plan.md](02-preview-and-activation-plan.md) Part 1.

## Executive decision matrix

| Decision                         | Options                                                 | Recommendation                         | Consequence if approved                                                                                                 |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Reconciliation mechanism**     | A repair · B manifest · C forward · **D rename**        | **D**                                  | Next phase renames 5 repo files (content identical), regenerates the manifest, clears the drift — production untouched. |
| **When to reconcile**            | now-next-phase · defer                                  | Next authorized phase                  | Unblocks the path to validate & apply 0028.                                                                             |
| **Preview after reconciliation** | new branch from prod · reuse stale branch · new project | **New branch from current production** | Faithful, disposable, no new paid project.                                                                              |
| **0028 activation**              | per the sequenced plan                                  | Approve the plan; execute gate-by-gate | 0028 validated on preview, then applied to production only via the reviewer-gated workflow.                             |

Smallest set of approvals needed to proceed: **(1)** adopt **Option D**; **(2)** authorize
the next phase to execute the rename + cut the faithful preview (preview/read-only until
you arm the production apply).

## Feasibility, risk & impact (summary)

- **Technical feasibility:** D is fully feasible with standard git; verified that the new
  versions preserve ordering (after `0022`, before `0028`) and that `supabase db reset`
  (empty-DB apply, used in CI) is unaffected. Detail: [01](01-options-analysis.md).
- **Risk:** production risk = **none** under D (no contact). Repo risk = a reviewable
  rename commit; rollback = revert. CI risk = none (manifest regenerated; checks pass).
- **Repository impact:** 5 filenames change; SQL identical; manifest updated; drift entry
  removed. **Production impact:** zero. **CI impact:** lineage + drift checks continue to
  pass with aligned versions.

## Next-phase recommendation (do not begin)

**Phase XI-2H — Execute Option D reconciliation** (rename repo `0023–0027` to production
versions, regenerate manifest, clear drift; PR + CI green), **then cut the faithful
preview and run the 0028 runtime validation.** Production apply of 0028 remains a
separate, reviewer-gated step. Nothing starts until you approve Option D.

## What remains untouched

No migration renamed or applied, no production contact, no repair executed, no Git
history rewritten, no branch created or deleted, no deploy, no merge, no secrets, no DNS.
Migration 0028 remains checksum-locked and unapplied. Production remains exactly as found.
