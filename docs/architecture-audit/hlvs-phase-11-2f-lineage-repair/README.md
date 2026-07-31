# Phase XI-2F · Migration Lineage Repair & Deployment Governance — Completion report

**For:** Keith Herman, CEO · **Date:** 2026-07-31 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**No production migration, no deploy, no merge, no destructive op, no history rewrite. The stale branch was archived, NOT deleted.**

---

## In plain language

Two things came out of the earlier reviews: a small **bookkeeping mismatch** on five
migrations (0023–0027), and the risk that this kind of drift could happen again unseen.
This phase (1) **proved the mismatch is harmless** — the actual SQL is identical, only a
version label differs — and wrote down exactly how to fix it safely; and (2) **built
automatic guardrails** so the lineage checks itself on every change and deployments can
only ever point at the real database. I changed **nothing** on the live systems.

## What I found (0023–0027)

The five migrations have the same names and produce the same schema in the repo and in
production; they differ only in their **version identifier** (and cosmetic comments).
I proved the SQL is identical by comparing comment/whitespace-normalized hashes on both
sides — **all five match exactly**. So this is a label mismatch, not two different
databases. It still must be reconciled before the next migration (0028, the Knowledge
Graph) can be applied through the normal path. Details + checksum table:
[01-migration-drift-report.md](01-migration-drift-report.md).

## What I built (guardrails — implemented + tested, offline)

- **A canonical registry** (`.hlbos/canonical.json`) — one file naming the canonical
  repo, the canonical database, every environment, and the recorded drift.
- **A checksum-locked lineage manifest** (`.hlbos/migration-lineage.json`) — every
  migration's fingerprint; editing one without regenerating fails CI.
- **An offline lineage check** (`scripts/check-lineage.mjs`, wired into CI) — enforces
  sequential numbers, increasing versions, the checksum lock, and registry consistency.
  Verified it **passes clean** and **fails** on a tampered file and a duplicate number.
- **An online drift check** (`scripts/check-lineage-drift.mjs`, in the gated migrate
  workflow) — makes production's applied set match the registry; **fails** on a foreign
  or out-of-band migration. Verified against a realistic fixture (pass) and two failure
  cases.
- **Target guards** — the migrate workflow now refuses to link or apply to any database
  that isn't the canonical one.

Full spec: [02-deployment-governance-spec.md](02-deployment-governance-spec.md) · governance decision: [ADR-0002](../../architecture/decisions/0002-migration-lineage-governance.md).

## The repair (planned, not executed)

Recommended: **align the repo's five filenames to production's applied versions**
(content unchanged), regenerate the manifest, and clear the recorded drift. Zero remote
risk, no history rewrite. It is an explicit, approved step for the next phase — I did
not do it here (boundary: no history rewrite this phase). Strategy + the readiness
checklist for eventually applying 0028: [03-migration-repair-strategy.md](03-migration-repair-strategy.md).

## The stale branch (archived, not deleted)

`hlbos-m1-portfolio` is recorded in full (metadata, 29-migration inventory, schema
inventory, inferred purpose, confidence) so it can be safely deleted later. It holds no
data and is authoritative for nothing. Archive: [04-preview-branch-archive.md](04-preview-branch-archive.md).

## Knowledge Graph (migration 0028) status

Unchanged except for the XI-2D permission-key correction — confirmed by the checksum
lock. It stays in the repo at its correct number and is **not** applied. It becomes safe
to apply once the tail drift is repaired **and** it has been validated on a fresh,
faithful preview cut from current production. The registry marks it `notYetApplied`.

## Quality gates (exact results)

| Gate                   | Result                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- |
| `pnpm format:check`    | ✅ clean                                                                     |
| `pnpm lint`            | ✅ clean                                                                     |
| `pnpm typecheck`       | ✅ clean (8 projects)                                                        |
| `pnpm lineage` (new)   | ✅ 28 migrations sequential, monotonic, checksum-locked, registry-consistent |
| lineage negative tests | ✅ catches tampered file + duplicate ordinal                                 |
| drift-check fixture    | ✅ passes reality; fails on foreign/missing versions                         |
| `pnpm test`            | ✅ **247 / 247**                                                             |

## Outputs (against the phase brief)

| #   | Output                              | Location                                                                      |
| --- | ----------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Migration drift report              | [01-migration-drift-report.md](01-migration-drift-report.md)                  |
| 2   | Checksum comparison                 | [01](01-migration-drift-report.md) (normalized md5 table)                     |
| 3   | Deployment governance specification | [02-deployment-governance-spec.md](02-deployment-governance-spec.md)          |
| 4   | Environment registry                | `.hlbos/canonical.json` · [02](02-deployment-governance-spec.md)              |
| 5   | Canonical project registry          | `.hlbos/canonical.json` · [02](02-deployment-governance-spec.md)              |
| 6   | CI lineage verification             | `scripts/check-lineage*.mjs` + `ci.yml`/`db-migrate.yml`                      |
| 7   | Preview archive                     | [04-preview-branch-archive.md](04-preview-branch-archive.md)                  |
| 8   | Migration repair strategy           | [03-migration-repair-strategy.md](03-migration-repair-strategy.md)            |
| 9   | Production readiness checklist      | [03](03-migration-repair-strategy.md)                                         |
| 10  | ADR — permanent governance          | [ADR-0002](../../architecture/decisions/0002-migration-lineage-governance.md) |
| 11  | Completion report                   | this file                                                                     |

## CEO decisions required

1. **Approve the repair mechanism** (recommended: Option R1 — rename the repo's
   `0023–0027` files to production's applied versions; content-safe, no remote change),
   to be executed in the next phase.
2. **Approve deleting the archived `hlbos-m1-portfolio` branch** (archive now exists).

## Next-phase recommendation (do not begin)

**Phase XI-2G — Execute the tail-drift repair (R1) + cut a fresh faithful preview from
current production + validate migration 0028 there.** Then, separately gated, the
production apply of 0028. Preview/read only until CEO-armed.

## What remains untouched

No production migration, no deploy, no merge, no destructive op, no migration renamed or
renumbered, no Git history rewritten, no branch deleted, no remote schema/data/permission
change, no DNS, no secrets. Production remains exactly as found (27 migrations, single
bootstrap owner, no customer data).
