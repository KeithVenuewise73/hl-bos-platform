# Phase XI-2H · Supabase Migration Governance Alignment — Completion report

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Research/planning only. No repository change, no migration rename, no production contact beyond reading official docs, no deploy, no merge.**

Evidence (verbatim quotes + citations): [01-supabase-evidence.md](01-supabase-evidence.md).

---

## In plain language

Before we touch anything, I checked what **Supabase officially recommends** for exactly
our situation (same SQL, different version labels, production authoritative). The good
news: **our chosen direction — align the repository to production — is the direction
Supabase's own documentation uses.** The nuance: Supabase's literal command for that
(`db pull`) would _replace_ our carefully hand-written migration files with a
machine-generated schema dump, throwing away our comments and rollback notes. So the
right move is to keep our authored files and reach the same end-state Supabase intends,
by renaming them — with Supabase's `migration repair` / `db pull` recorded as the
sanctioned tools for any future drift where the roles are reversed.

## 1. Official Supabase guidance summary

| Topic                            | Official position                                                                                                                                                                                            | Source       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| History drift tool               | **`supabase migration repair`** repairs the **remote** history table; `--status applied` inserts a record, `--status reverted` deletes one — for when "local and remote migration history goes out of sync." | repair ref   |
| Mutating history                 | `db push` says: to "mutate the migration history table … without actually running the migration, use the `migration repair` command." The version **timestamp is the unique id**.                            | db-push ref  |
| Sync local from remote           | **`supabase db pull`** regenerates a local migration file reflecting the **remote** schema; the official drift example **deletes the local file** then `db pull`s it back at the remote's version.           | repair ref   |
| Direction of truth               | The documented flow treats **remote as the source of truth** and adjusts the **local** side to match.                                                                                                        | repair ref   |
| Branching                        | Branching 2.0 uses **current migration files** (not a schema dump); files must be **synced (`db pull`) first**.                                                                                              | branching TS |
| Renaming a migration             | **Not a documented command.** The docs manipulate local files with `rm` + `db pull`, never a "rename".                                                                                                       | (absence)    |
| Mutating history via a migration | **Not endorsed** — routed through `migration repair`.                                                                                                                                                        | db-push ref  |

**Bottom line:** Supabase officially supports `migration repair` (remote history), `db
pull` (regenerate local from remote), and `migration list` (see drift). Its documented
recovery, when remote is authoritative, is to **align the local side to remote**.

## 2. Mapping official guidance to the XI-2G options (+ a new Option E)

| Option                                                       | What it is                                   | Official status                                                         | Why                                                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — `migration repair` remote → repo versions            | Uses the official `migration repair` command | **Supported command, non-standard direction**                           | Repair is official, but here it would mutate the **authoritative remote** to match the drifted repo — the reverse of every documented example (which treats remote as truth).                   |
| **B** — external compatibility manifest                      | Our own registry maps equivalence            | **Outside Supabase's model**                                            | Supabase has no concept of an external equivalence map; neither supported nor prohibited — purely our governance layer. Does not unblock the CLI.                                               |
| **C** — forward migration mutating `schema_migrations`       | A migration edits the history table          | **Discouraged / unsupported**                                           | Docs explicitly say use `migration repair`, **not** a migration, to change history.                                                                                                             |
| **D** — rename repo `0023–0027` to remote versions           | Content-preserving file rename               | **Consistent with official direction & end-state; not a named command** | Reaches the **same end-state** as the official `db pull` flow (local files carry the remote versions), but preserves our authored SQL + rollback blocks instead of a schema dump.               |
| **E** — `db pull` regenerate (**newly surfaced this phase**) | The literal vendor command                   | **Fully vendor-native, but repo-incompatible**                          | `db pull` writes a **schema-dump** migration — it would discard our hand-authored, per-module, rollback-annotated `0023–0027` files (and `check-migrations.sh` requires `-- rollback:` blocks). |

## 3. Risk comparison (with the official-alignment axis added)

| Option              |                   Production safety                   |         Vendor alignment          | Preserves authored migrations  | Unblocks CLI | Net                                         |
| ------------------- | :---------------------------------------------------: | :-------------------------------: | :----------------------------: | :----------: | ------------------------------------------- |
| A repair-remote     |                 ⚠️ writes prod ledger                 | ⚠️ supported cmd, wrong direction |               ✅               |      ✅      | Works, but mutates the authoritative record |
| B manifest          |                        ✅ none                        |         ⚠️ outside model          |               ✅               |      ❌      | Audit aid only                              |
| C forward-migration |                     ❌ dangerous                      |          ❌ discouraged           |               ⚠️               |      ❌      | Rejected                                    |
| **D rename-local**  |                      ✅ **none**                      |   ✅ **direction + end-state**    |           ✅ **yes**           |      ✅      | **Best fit**                                |
| E db-pull           | ✅ none (local) + ⚠️ prompts to update remote history |        ✅ literal command         | ❌ **destroys authored files** |      ✅      | Vendor-pure but violates repo conventions   |

## 4. Recommended Herman Legacy approach

**Option D — rename the repo's `0023–0027` files to production's applied versions —
reframed as the content-preserving realization of Supabase's official
"sync-local-to-authoritative-remote" recovery.**

- It matches the **direction** Supabase documents (remote is truth; local is adjusted).
- It reaches the **same end-state** as the official `db pull` (local files carry the
  remote version ids) — verified in XI-2F that the SQL is byte-identical, so no content
  is lost by keeping our files instead of pulling a dump.
- It preserves the repo's **hand-authored migrations + `-- rollback:` blocks**, which the
  vendor-pure `db pull` (Option E) would destroy.
- It touches **nothing** in production — strictly safer than Option A, which uses the
  official command but against its documented grain (mutating the authoritative ledger).

**`migration repair` is not needed for this reconciliation** because production's history
is already correct — it is the repo that drifted. `migration repair` (and `db pull`) are
recorded as the **sanctioned tools for the reverse scenario**: a future case where the
**remote** history is wrong and must be corrected.

## 5. Required governance updates (documentation-only; execute in the next phase)

1. **ADR-0002 addendum:** record the vendor-alignment finding — repo-side rename is the
   content-preserving form of Supabase's align-local-to-remote guidance; `migration
repair`/`db pull` are the sanctioned tools for remote-side drift.
2. **Repair runbook (XI-2F 03):** add a one-line note that Option D == official direction,
   with `db pull` (Option E) explicitly rejected for destroying authored migrations.
3. **Preview plan (XI-2G 02):** cite the Branching-2.0 requirement that migration files be
   in sync before branching — reinforces "reconcile first, then cut the preview," and note
   `db pull --linked` as the vendor tool to verify sync.
4. **No code changes this phase** — these are edits for the execution phase (XI-2I).

## 6. Decision matrix

| Decision                               | Options                                                        | Recommendation                                            | Rationale                                                                      |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Reconciliation mechanism               | A repair · B manifest · C migration · **D rename** · E db-pull | **D**                                                     | Vendor-aligned direction/end-state, production-safe, preserves authored files. |
| If we ever must fix **remote** history | `migration repair` · manual SQL                                | **`migration repair`**                                    | The one officially-supported way to mutate `schema_migrations`.                |
| Regenerate local from remote (future)  | `db pull` · manual                                             | **`db pull`** — but only when a schema dump is acceptable | Not acceptable for our authored 0023–0027; fine for greenfield sync.           |
| Preview creation ordering              | reconcile-then-branch · branch-now                             | **Reconcile then branch**                                 | Branching 2.0 relies on synced migration files.                                |

## 7. Executive recommendation

**Proceed with Option D**, now confirmed to **align with official Supabase guidance** in
direction and end-state, while preserving Herman Legacy's authored-migration conventions
and touching nothing in production. Adopt `migration repair` / `db pull` as the sanctioned
tools for the _reverse_ drift scenario. No implementation in this phase.

- Confidence in D: **raised** — it is not merely the safest option, it is the
  vendor-aligned one for a repo that hand-authors migrations.
- The only strictly "more official" mechanisms (A's `repair`, E's `db pull`) each carry a
  disqualifying cost here (mutating the authoritative ledger / destroying authored files).

## Next-phase recommendation (do not begin)

**Phase XI-2I — Execute Option D reconciliation** (rename repo `0023–0027` to production
versions, `pnpm lineage:write`, clear the drift, apply the governance-doc updates in §5),
open a PR, and confirm CI green — then cut the faithful preview and run the 0028 runtime
validation. Production apply of 0028 remains a separate, reviewer-gated step.

## What remains untouched

No repository change, no migration renamed or applied, no production contact beyond
reading official docs, no history rewrite, no branch created/deleted, no deploy, no merge,
no secrets. Migration 0028 remains checksum-locked and unapplied.
