# XI-2K · Operations issue report — Supabase Branching provisioner mis-orders migrations

**Status:** Documented; workaround in hand. **Does NOT block the production apply of 0028.**
This report exists so the finding is on record and the future-preview path is clear.

## Summary

When Supabase Branching provisions a **preview branch from scratch** by replaying the full
migration set, it applies our migrations **out of dependency order**, producing a failed,
inconsistent clone. Our migrations are correctly numbered and apply cleanly in version
order via `supabase db push` / `db reset` (and in CI's `database-tests` job). The defect is
in the **branch provisioner's ordering**, not in our migrations and not in `0028`.

## Environment / reproduction

| Field           | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| Observed during | Phase XI-2J (Knowledge Graph preview validation), 2026-07-31   |
| Parent project  | `mvvtngiopdrgiedjmhfb` (canonical production, 27 migrations)   |
| Preview branch  | `hlbos-graph-preview` (`adpqczccoququtroetzc`) — since deleted |
| Mechanism       | Supabase Branching "create branch" full-clone provisioner      |

**Repro:** Create a preview branch from a parent that has migrations `0001–0027` applied.
The branch build reports **`MIGRATIONS_FAILED`**.

**Postgres log (root failure):**

> `ERROR: schema "workflows" does not exist` — raised while creating `comms.messages`
> (migration `0019`, `20260726090400`), whose `approval_instance_id` column references
> `workflows.instances` (created by migration `0013`, `20260725100400`).

**Resulting state:** the branch ledger recorded `0001–0018` as applied, but only a subset
of schemas had actually materialised (`audit`, `identity`, `platform`, `storage_meta`) —
`events`, `workflows`, `billing`, and others were **absent**. The clone was internally
inconsistent, confirming the provisioner did not apply migrations in a single correct
sequence.

## Affected migrations

- **Trigger of the visible failure:** `0019_communications` (`20260726090400`) referencing
  `workflows.instances` from `0013_workflows_gate` (`20260725100400`).
- **Range at risk in a from-scratch branch build:** any migration that depends on an
  earlier schema the provisioner has not yet materialised — in practice the whole
  cross-schema tail `0009–0028` (everything after the `0001–0008` identity/platform
  foundation, which provisioned correctly). The foundation `0001–0008` is self-contained
  and always came up cleanly.
- **`0028` itself is not implicated:** it references only the `0001–0008` foundation
  (`identity`/`platform`/`auth`) plus its own new `graph` schema. On the faithfully-built
  foundation, `0028` applied and validated 11/11 structurally and at runtime.

## Root cause (assessment)

The migrations are **correctly ordered by version identifier** — the timestamp prefix
strictly increases with dependency order (`0013` = `20260725100400` < `0019` =
`20260726090400`). `supabase db reset` and `supabase db push` honour this order and apply
cleanly (proven continuously in CI). The branch provisioner, by contrast, did **not** apply
them in that monotonic order (or did not run each to completion before the next), so a
cross-schema foreign-key reference resolved before its target existed. This is a
**provisioner ordering/consistency defect on Supabase's side**, exercised by a legitimate,
correctly-ordered migration set.

We ruled out a defect on our side:

- Numeric ordinals are sequential `0001…0028` (enforced by `scripts/check-lineage.mjs`).
- Version identifiers are strictly monotonic (same check).
- The identical set applies from empty via `db reset` in CI `database-tests` — green.
- `0013` precedes `0019` by both ordinal and version.

## Workaround (validated)

For XI-2J we validated `0028` on the **faithfully-provisioned `0001–0008` foundation**
(the branch's identity/auth context came up correctly), which is the exact context 0028's
authorization depends on — real `has_platform_permission(citext)`,
`has_permission(uuid,citext)`, the production `permissions_key_format` constraint,
`platform.tenants`, `auth.users`. That was sufficient to validate 0028 end-to-end.

For any **future** full-clone preview, build it in-order instead of via the branch
provisioner:

1. **`supabase db push` / `db reset` into a fresh project** — applies migrations in version
   order, matching CI; **recommended**, or
2. **Apply migrations in numeric order through the MCP** (`apply_migration` `0001…N`).

Both honour dependency order and avoid the provisioner's mis-ordering.

## Impact on the production apply of 0028 — none

The production apply uses **`supabase db push`** against a project that **already has
`0001–0027` applied**. `db push` applies only the single pending `0028`, in order, onto the
existing foundation. It does **not** invoke the branch provisioner and does **not** rebuild
from scratch. The provisioner defect therefore has **no bearing** on the 0028 production
deployment. It is purely a **preview-tooling** consideration.

## Operational recommendation

- **Do not** rely on Supabase Branching's from-scratch provisioner for full-clone previews
  of this repo until the ordering behavior is confirmed fixed. Use the in-order workaround
  (above). Record this in the preview runbook so future phases don't re-hit it.
- **Upstream issue: recommended, low priority.** This is a plausible Supabase-side defect
  (a correctly-ordered, standard migration set with legitimate cross-schema FKs produced an
  out-of-order replay). An upstream report would help other users and possibly get it
  fixed. However:
  - It is **not on the critical path** — our production apply and CI are unaffected, and we
    have a validated workaround.
  - Filing requires a **minimal public reproduction** (two migrations, one FK across
    schemas) — our real migrations should **not** be attached (they describe unreleased
    platform internals). Build a sanitized 2-migration repro first.
  - Because it touches an **external service** and would disclose that we use Supabase
    Branching in a specific way, opening it is a **🔑 CEO decision**, not something to do
    unilaterally. Recommend: prepare the sanitized repro, then ask Keith whether to file.

## Cross-references

- Original finding + evidence: XI-2J
  [01-migration-and-provisioning.md](../hlvs-phase-11-2j-preview-validation/01-migration-and-provisioning.md).
- The from-scratch order-of-truth (version-monotonic) is enforced by
  `scripts/check-lineage.mjs`; drift vs. production is checked by
  `scripts/check-lineage-drift.mjs`.
