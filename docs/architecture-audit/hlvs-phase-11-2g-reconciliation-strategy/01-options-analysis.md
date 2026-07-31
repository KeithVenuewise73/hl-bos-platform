# XI-2G · Reconciliation options — feasibility, risk, and impact analysis

**Planning only.** Nothing renamed, no production touched, no history rewritten, no
repair executed. This evaluates every technically valid way to reconcile the
`0023–0027` version-identifier drift established in XI-2F (SQL identical; production
authoritative; production applied `20260728181327…182949`, repo files carry
`20260727090000…20260728090000`).

## The precise problem to solve

`supabase db push` and `supabase migration list` key on the **version string**. The
repo's `0023–0027` versions are **not** in production's `schema_migrations`, so the CLI
treats them as pending and would try to **re-apply** them (objects exist → error),
never reaching `0028`. A valid strategy must make the CLI see `0023–0027` as already
applied so it advances cleanly to `0028` — **without** re-running their SQL.

A second, quieter requirement: the chosen end-state should not institutionalise a
permanent mismatch that every future developer and every `migration list` must
re-interpret forever.

---

## Option A — Metadata reconciliation only (`supabase migration repair`, no repo rename)

**Mechanism.** For each of `0023–0027`, mark production's applied version as reverted and
the repo's version as applied in `supabase_migrations.schema_migrations`
(`supabase migration repair --status reverted 20260728181327`, then
`--status applied 20260727090000`, ×5). No SQL re-runs; only the ledger changes.

| Criterion                | Assessment                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production safety        | ⚠️ **Writes to production** — 10 edits to the authoritative migration ledger. Bookkeeping only (no schema/data), but it is a production mutation and needs armed prod credentials via the gated workflow.        |
| Repository integrity     | ✅ Repo files untouched.                                                                                                                                                                                         |
| Git history preservation | ✅ Perfect (no file changes).                                                                                                                                                                                    |
| Developer workflow       | ✅ Unchanged after the one-time repair.                                                                                                                                                                          |
| CI compatibility         | ✅ After repair, canonical.json expected-set = repo versions; drift-check passes.                                                                                                                                |
| Future maintainability   | ⚠️ Production's ledger would then record `20260727…` "applied" times that are **fictional** — the SQL actually ran at `20260728…`. That fabricates the applied-at record (mild honesty problem vs Principle 10). |
| Rollback                 | ⚠️ Moderate — repair back to production versions (another 10 prod edits).                                                                                                                                        |
| Operational simplicity   | ⚠️ Requires linking + repairing production through the reviewer-gated path.                                                                                                                                      |

**Verdict:** Feasible, preserves repo files — but it **edits production's authoritative
ledger to match the drifted repo**, inverting "production is canonical," and it inserts
untrue applied-at timestamps. Higher-consequence than the problem warrants.

---

## Option B — Compatibility manifest (permanent equivalence mapping, no changes anywhere)

**Mechanism.** Leave both sides as-is; record the equivalence permanently in the lineage
registry (already present: `knownMigrationDrift` + `productionAppliedVersion`) and teach
**our** governance to treat repo↔prod versions as equivalent.

| Criterion                | Assessment                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production safety        | ✅ Nothing touched.                                                                                                                                                                                      |
| Repository integrity     | ✅ Files unchanged.                                                                                                                                                                                      |
| Git history preservation | ✅ Perfect.                                                                                                                                                                                              |
| Developer workflow       | ❌ Every `supabase migration list` shows drift rows **forever**; every developer must learn the mapping.                                                                                                 |
| CI compatibility         | ✅ Our checks already tolerate it.                                                                                                                                                                       |
| Future maintainability   | ❌ **Institutionalises the drift permanently.**                                                                                                                                                          |
| Rollback                 | ✅ n/a.                                                                                                                                                                                                  |
| Operational simplicity   | ❌ Does **not** unblock the standard `db push` — the Supabase CLI does not read our manifest, so it would still try to re-apply `0023–0027`. 0028 could only be applied by a bespoke, non-standard path. |

**Verdict:** Insufficient **alone** — it documents the drift but does not unblock the
governed tooling. Valuable only as a **complement** (an audit record), which we already
have. Not a reconciliation.

---

## Option C — Forward-only compatibility migration (a new migration establishes equivalence)

**Mechanism.** Add a new migration (e.g. `0029`) intended to "establish equivalence."

| Criterion                | Assessment                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production safety        | ❌ To actually reconcile, the new migration would have to `UPDATE supabase_migrations.schema_migrations` — SQL mutating the migration ledger, the least reviewable and most dangerous form of a production write. |
| Repository integrity     | ⚠️ Adds a permanent, confusing "reconciliation" migration.                                                                                                                                                        |
| Git history preservation | ✅ Additive.                                                                                                                                                                                                      |
| Developer workflow       | ❌ A migration that exists only to patch bookkeeping is a lasting foot-gun.                                                                                                                                       |
| CI compatibility         | ❌ `db push` still sees `0023–0027` repo versions as pending **before** it reaches `0029` — so it does not even unblock the path.                                                                                 |
| Future maintainability   | ❌ Poor.                                                                                                                                                                                                          |
| Rollback                 | ❌ Hard (it ran SQL against a system table).                                                                                                                                                                      |

**Verdict:** **Rejected.** It does not solve the ordering problem, and the only way to
make it "work" is a dangerous ledger mutation disguised as schema change.

---

## Option D — Repository filename reconciliation (rename repo `0023–0027` to prod versions)

**Mechanism.** `git mv` the five repo files to production's applied version prefixes
(content byte-identical), regenerate the checksum manifest, and remove the resolved
`knownMigrationDrift` entry. Production is never contacted.

| Criterion                | Assessment                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production safety        | ✅ **Production is never touched** — the strongest possible safety posture.                                                                                                                                      |
| Repository integrity     | ✅ SQL content byte-identical (proven in XI-2F); only the filename version prefix changes; manifest regenerated.                                                                                                 |
| Git history preservation | ✅ **Preserved.** A rename with identical content is a 100%-similarity rename; `git log --follow` tracks each file across it. This is a normal forward commit, **not** a history rewrite (no rebase/force-push). |
| Developer workflow       | ✅ **Best** — after one commit, file version == applied version; `migration list` is clean; no mapping to remember, ever.                                                                                        |
| CI compatibility         | ✅ New versions still sort after `0022` and before `0028`; `supabase db reset` (empty-DB apply) unaffected; lineage + drift checks pass with the aligned versions.                                               |
| Future maintainability   | ✅ **Best** — one clean lineage, no permanent divergence.                                                                                                                                                        |
| Rollback                 | ✅ **Trivial** — revert the single rename commit.                                                                                                                                                                |
| Operational simplicity   | ✅ **Simplest** — one repo commit; no armed credentials, no production interaction.                                                                                                                              |

**Verdict:** Aligns the **follower (repo)** to the **source of truth (production)** —
the philosophically correct direction — while leaving production's honest applied-at
record intact. Only "cost" is a one-time file rename, and git rename-tracking preserves
history.

> Boundary note: this phase does **not** execute the rename ("Do not rename migrations").
> Option D is a _recommendation_ for a later authorised step.

---

## Cross-cutting: which options actually unblock `db push` to 0028?

| Option              | Unblocks standard `db push`?  | Touches production? |        End-state clean?        |
| ------------------- | :---------------------------: | :-----------------: | :----------------------------: |
| A metadata repair   |              ✅               |   ⚠️ yes (ledger)   | ⚠️ fabricated applied-at times |
| B compat manifest   | ❌ (CLI ignores our manifest) |        ✅ no        |       ❌ permanent drift       |
| C forward migration |              ❌               |    ❌ dangerous     |          ❌ confusing          |
| **D repo rename**   |              ✅               |      ✅ **no**      |           ✅ **yes**           |

Only **A** and **D** truly unblock the governed path. Between them, **D touches nothing
in production and preserves the truthful production ledger**, while **A edits the
authoritative ledger to match the drifted repo**. D is strictly less invasive where it
matters most.
