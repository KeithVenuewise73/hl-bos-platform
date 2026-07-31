# XI-2E · Risk, gap analysis, reconciliation options, recommendation, KG impact, containment

## 1. Production-data & operational-risk assessment

| Risk                                                                                                                       | Severity              | Urgency                        | Basis                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| **Tail migration-identity drift (0023–0027)** blocks the governed apply path and could trigger re-application/drift errors | **High**              | **High**                       | Repo versions ≠ production applied versions (doc 02 §1b) **[V]**         |
| **Stale `hlbos-m1-portfolio` branch** mistaken for a faithful preview (it caused the XI-2D mis-inference)                  | Medium                | Medium                         | Branch carries an abandoned foreign lineage; `with_data=false` **[V]**   |
| Production customer-data loss                                                                                              | **Low**               | Low                            | Production has 1 bootstrap user, seed data, **no customer rows** **[V]** |
| Root `README.md` states "no schema / not deployed" — **contradicts** live production                                       | Medium                | Medium                         | Stale doc **[C]**                                                        |
| Legacy `bkfsjhhclbqrhaolvhmz` (open security findings)                                                                     | Medium                | Low (contained)                | Unreachable, out of scope **[SI]**                                       |
| Number collisions A↔B if branch ever combined                                                                              | High (if it happened) | Low (won't, if branch deleted) | Doc 02 §1a **[V]**                                                       |

## 2. Repository-to-production gap analysis

| Item                   | Repo (`main`)            | Production                      | Gap                                          |
| ---------------------- | ------------------------ | ------------------------------- | -------------------------------------------- |
| Migrations 0001–0022   | present                  | applied, **same versions**      | none                                         |
| Migrations 0023–0027   | present                  | applied, **different versions** | **version-identity drift** (repair needed)   |
| Migration 0028 (graph) | present (corrected keys) | not applied                     | forward-only apply pending drift repair      |
| Schemas                | 18 module + graph        | 17 module live (no graph)       | graph not yet applied                        |
| Data                   | n/a                      | 1 owner + seed                  | repo has no data expectations                |
| Apps/edge runtime      | built                    | 0 deployed                      | deployment is a later, separately-gated step |

**Headline:** repo and production are the **same lineage**, aligned through 0022 and
name-aligned 0023–0027 with only a **version-string drift**. This is a _repair_, not a
_reconciliation of divergent applications_.

## 3. Reconciliation options (reframed against the verified finding)

> The XI-2D fear — two divergent applications competing to be HL-BOS — **did not
> materialize.** Production already **is** the repo lineage. So the five brief options
> collapse toward "the platform is already canonical; clean up the edges."

| Option                                          | Fit to reality                                                                                                            | Safety | Effort  | Verdict                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ------- | -------------------------------------------------------------------------------------------------------- |
| **1 — Single canonical DB**                     | **Already essentially true** (prod = repo lineage). Remaining work = repair tail-drift, apply forward.                    | High   | **Low** | **RECOMMENDED (as "confirm & clean")**                                                                   |
| 2 — Bounded databases                           | Applies to _govcon/HSCS-GLP as a separate vertical_, not to the platform itself                                           | High   | Medium  | Adopt **only** for HSCS-GLP domain (see below)                                                           |
| 3 — Promote production, absorb repo modules     | N/A — production **is** the repo modules                                                                                  | —      | —       | Not applicable                                                                                           |
| 4 — Promote repo, migrate production domains in | N/A — the portfolio/govcon "domains" aren't in production (branch only, no data)                                          | —      | —       | Not applicable                                                                                           |
| 5 — Separate products intentionally             | Correct frame for **HSCS-GLP/govcon**: a distinct government-logistics product, briefly prototyped on Core then split off | High   | Low     | Adopt for HSCS-GLP; **does not** conflict with one-platform vision if HL-BOS is the shared control plane |

## 4. Recommended canonical architecture

**One platform, one canonical database, verticals as separate products on top.**

- **Canonical platform lineage = repo `hl-bos-platform` ↔ production `mvvtngiopdrgiedjmhfb`.** Already ADR-0001; this assessment verifies it against the live DB. **Affirm it.**
- **Migration strategy:** forward-only. **First repair the 0023–0027 version drift** (align repo file versions to production's applied versions, or `supabase migration repair` the remote history to the repo versions — decided in a dedicated, authorized phase), **then** `0028` applies cleanly as the next forward migration. **No renumbering of 0028** — it is correctly the next number for this lineage (production is at 0027, no `graph` schema, no collision). **[V]**
- **Repository strategy:** `hl-bos-platform` stays the single canonical monorepo/control plane. `HSCS-GLP` remains its **own product repo** (Option 5) — if/when it needs a database, it gets its **own bounded database federated through HL-BOS identity** (Option 2), never merged into the platform DB.
- **Stale branch:** treat `hlbos-m1-portfolio` as an **abandoned artifact** of a superseded milestone; delete it in a later authorized step. Do **not** use it as a validation target.
- **Legacy `bkfsjhhclbqrhaolvhmz`:** stays out of scope (unreachable, security findings).

**Why superior:** it matches verified reality, requires the least change, preserves the one
genuinely data-bearing environment (production) untouched, keeps forward-only discipline,
and keeps a clean separation between the platform and its verticals.

## 5. Knowledge Graph impact (migration 0028 / Phase XI-2C)

| Question                                          | Answer                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep 0028 in its current repo sequence?           | **Yes.** Production is at 0027 with no `graph` schema; 0028 is the correct next number. The apparent "collision" was only against the abandoned branch. **[V]**                                                                                                           |
| New migration identity in canonical lineage?      | **No renumber needed.** But 0028 can only be _applied_ after the 0023–0027 tail-drift is repaired (else `db push` won't reach it).                                                                                                                                        |
| Can the graph project across multiple databases?  | Not needed now — the graph projects the **in-code catalog**, which describes one platform. Multi-DB projection is a future concern only if HSCS-GLP becomes a federated vertical.                                                                                         |
| Should graph persistence wait?                    | **Yes — until (a) tail-drift repaired and (b) a faithful preview exists.**                                                                                                                                                                                                |
| Is a disposable faithful preview still justified? | **Changed:** a brand-new project is **no longer required**. After tail-drift repair, cut a **fresh preview branch from current production** — it will be a faithful copy of the real lineage (unlike the stale one). Cheaper and truer than XI-2D's "new project" option. |
| Can the graph help inventory this divergence?     | Yes, as a **non-authoritative** aid — nodes for repos/projects/branches/lineages would make this exact map queryable. Future, optional.                                                                                                                                   |

**Do not apply or renumber 0028 in this phase.** (Not done.)

## 6. Immediate containment (recommendations — not implemented here except harmless docs)

| Control                                       | Action                                                                                                                                                         | Status                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Canonical references recorded                 | Affirm ADR-0001 + `docs/operations/environments.md` as the environment registry                                                                                | Exists; **affirm**                   |
| Freeze remote migrations until drift repaired | `db-migrate.yml` is already inert until CEO-armed — **keep it unarmed** until XI-2F                                                                            | Already frozen                       |
| **Migration-drift check in CI**               | Add a `supabase migration list` comparison (repo vs production applied versions) to the existing `drift-check` job so tail-drift can't silently break an apply | **Recommend** (build in XI-2F)       |
| Label the stale branch                        | Mark `hlbos-m1-portfolio` as abandoned so it is never used as a validation target                                                                              | **Recommend** (delete in XI-2F)      |
| Fix stale root `README.md`                    | It claims "no schema / not deployed"; production has 27 migrations. Harmless doc correction                                                                    | **Recommend** (safe quick follow-up) |
| Correct XI-2D production-lineage inference    | Add correction banner pointing here                                                                                                                            | **Done in this phase** (docs-only)   |

## 7. Phased execution plan (nothing here executed this phase)

1. **XI-2E (this phase):** read-only assessment + corrections. ✅
2. **CEO decisions** (doc README §CEO decisions).
3. **XI-2F — Controlled history reconciliation & faithful preview:** repair the 0023–0027 version drift on the _governed_ path; cut a **fresh preview branch from current production**; delete the stale `hlbos-m1-portfolio` branch; add the CI drift-check. Preview/read only until armed.
4. **XI-2G — Graph apply + runtime validation on the faithful preview:** apply 0028 to the fresh preview; run the real RLS/tenant-isolation/RPC/portal validation that XI-2D could not.
5. **Later, separately gated:** production apply of 0028; app/edge deployment; HSCS-GLP vertical federation decision.
