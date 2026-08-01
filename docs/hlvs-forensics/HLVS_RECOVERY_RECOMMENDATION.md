# HLVS Recovery Recommendation

**Companion to:** `HLVS_FORENSIC_TRACE.md`, `HLVS_ASSET_INVENTORY.md`, `HLVS_MIGRATION_REALITY_MATRIX.md`
**For:** Keith Herman, CEO / Product Owner · **Date:** 2026-08-01 · **Read-only. No code, no migration, no build.**

---

## Recommendation (exactly one)

# ▶ RETIRE PERMANENTLY

**Formally retire the legacy HLVS Venture Studio as a running application** — with one guardrail: a separate, CEO-approved, **read-only legacy-data recovery pass** first, in case any legacy row data has residual business value. The retirement is of the _legacy artifact_, not the _idea_: the idea already succeeded as fresh, tested capabilities in HL-BOS Core.

The four options not chosen, and why:

| Option                         | Verdict                  | Why not                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore original application   | ✗                        | Reintroduces the legacy single-org auth and its **open security findings** (SEC-1 ~2,481 rows anon-readable; SEC-2 cross-tenant). Restoring a known-insecure app is a step backward.                                                                                        |
| Restore and modernize          | ✗                        | "Modernize" already happened **by rebuild**. Reviving legacy code to then replace it duplicates work already done in HL-BOS Core.                                                                                                                                           |
| Complete interrupted migration | ✗                        | **There was no interrupted migration to complete.** No `venture_studio` object ever existed; the "migration sequence" (doc 72) is _proposals only_. There is no half-finished path to resume.                                                                               |
| Rebuild using recovered assets | ✗ (largely already done) | The capabilities (identity, discovery/research, recommendation, scoring, comms, storage, factory) are **already rebuilt and live**. A further rebuild is only warranted if a _specific_ legacy feature is found valuable and missing — a targeted follow-up, not a program. |

---

## Evidence supporting permanent retirement

1. **The capabilities already live on, freshly built.** HL-BOS Core contains `identity` (8), `discovery` (19, incl. recommendation + scoring + research successors), `comms` (7), `storage_meta`/`storage`, and the new `hlvs` **Factory** (19). _(Verified live query.)_ Retiring the legacy costs the platform **no capability**.
2. **Restoring reintroduces known defects.** The legacy estate's SEC-1/SEC-2 findings are documented in `docs/architecture-audit/hlvs-phase-1-atlas/04-database-assessment.md`. The current platform "fixed them by construction."
3. **Nothing to complete.** `git log --all -S "venture_studio"` = 0; no schema, no app, no branch, no removal commit. The plan never became execution. _(Verified.)_
4. **The IP is preserved.** The legacy domain model, feature inventory, and engine designs are captured in the Atlas Phase 1 assessment and docs 46/68–72 — reusable without the legacy runtime.
5. **The legacy is already governed as out-of-scope.** `.hlbos/canonical.json` marks project `bkfsjhhclbqrhaolvhmz` as `legacy-unreachable`, `authoritative: false`; `CLAUDE.md` names the legacy project out of scope. Retirement **formalizes the status quo** rather than changing course.

---

## The one guardrail before retirement: read-only legacy data recovery

Because the 59-table legacy `hlvs` schema is **unreachable from this environment**, its current contents and any business value are **UNKNOWN**. Before permanent retirement, run a **separate, explicitly approved** exercise:

- Restore read-only access to the legacy project **under an approved plan** (it carries open security findings — treat with care; do not expose it publicly).
- Inventory and, if warranted, **export** any business-critical data (customers, contracts, media) to a governed location on the HL-BOS spine.
- Then decommission the legacy project.

This guardrail is **due diligence before disposal**, not a "restore." It does not reopen the modernization.

---

## What NOT to do

- Do **not** wire the legacy `hlvs` schema into HL-BOS Core or any live app.
- Do **not** create a `venture_studio` schema/app to "finish the plan" — there is no plan state to finish.
- Do **not** treat the new `hlvs` Factory as a continuation of the legacy Venture Studio; they are different systems that share a name.
- Do **not** deploy or expose the legacy project during any recovery pass.

---

## Sequenced next actions (all CEO-gated)

1. **Accept** this forensic finding: HLVS Venture Studio is a parked legacy system, superseded by rebuild, not deleted.
2. **Authorize** (optional, recommended) a one-time read-only legacy-data recovery assessment under a separate approved plan.
3. **Retire** the legacy project permanently once recovery (if any) is complete.
4. **Reduce naming confusion**: going forward, refer to the current system as the **"HLVS Software Factory"** and reserve "HLVS Venture Studio (legacy)" strictly for the retired artifact.

Each of these is a business/trust decision for the CEO; none requires the CEO to run engineering commands. The engineer executes on approval.
