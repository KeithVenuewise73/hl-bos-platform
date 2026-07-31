# XI-2G · Faithful preview creation plan + migration 0028 activation plan

**Design only — nothing is created or applied in this phase.** Migration `0028` is
confirmed **unchanged** since XI-2F (checksum `07b9276e…`, `notYetApplied=true` in the
lineage manifest); the only edit it ever received was the XI-2D permission-key
correction.

## Part 1 — Faithful preview creation plan (design; do not create)

**Goal:** a disposable Supabase preview that is a _true_ copy of the current platform
lineage, so migration 0028 can be validated at runtime (the RLS / tenant-isolation /
RPC / portal checks XI-2D could not perform). It must be cut from **current canonical
production**, not from the abandoned `hlbos-m1-portfolio` branch.

**Precondition:** reconciliation (Option D) is done first, so the repo's `0023–0027`
versions match production. Then a preview cut from production shares one history with
the repo, and `db push` of `0028` proceeds cleanly on it.

| Step | Action                                                                                                                                                                                 | Tool                                        | Gate             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------- |
| P1   | Confirm reconciliation merged and `pnpm lineage` green on the branch that will feed the preview                                                                                        | local/CI                                    | —                |
| P2   | Ensure Supabase branching is enabled on `mvvtngiopdrgiedjmhfb`                                                                                                                         | Supabase                                    | 🔑 CEO (billing) |
| P3   | Create a preview branch `hlbos-graph-preview` from production (`persistent=false`, `with_data=false`)                                                                                  | `create_branch`                             | 🔑 authorize     |
| P4   | Verify the preview inherited production's real migration history (`0001–0027` at production versions) and carries the platform schemas (events/billing/hlvs/bti), not portfolio/govcon | read-only `list_migrations` / `execute_sql` | ⚙️               |
| P5   | Apply `0028` to the preview via the governed path (repo now aligned → only `0028` pending)                                                                                             | `db push` / branch apply                    | ⚙️               |
| P6   | Seed **synthetic** test identities/tenants (platform owner w/ `graph.projection.manage`; users w/ and w/o `graph.projection.read`; Tenant A/B) — never customer data                   | `execute_sql` on preview                    | ⚙️               |
| P7   | Run the XI-2D runtime matrix on the preview (below)                                                                                                                                    | `execute_sql`                               | ⚙️               |
| P8   | Tear the preview down when done                                                                                                                                                        | `delete_branch`                             | ⚙️               |

**Faithfulness guarantee:** because the preview is a branch of production _after_
reconciliation, its lineage == repo lineage == production lineage. This is the exact
property the stale `hlbos-m1-portfolio` branch lacked (it was cut from a superseded
build). The preview is disposable and holds no customer data.

## Part 2 — Migration 0028 activation plan (design; do not apply)

Sequenced gates from reconciled repo to live production graph. Each ⚙️ is Claude-runnable
after the preceding 🔑; each 🔑 is a CEO trust/cost decision.

| #   | Step                                                                                                                                                                                                                                                                                                                                                                                                           | Gate                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | **Reconcile** the `0023–0027` drift via Option D (rename repo files to production versions), `pnpm lineage:write`, clear `knownMigrationDrift`. Open PR; CI green.                                                                                                                                                                                                                                             | 🔑 approve mechanism · ⚙️ execute |
| 2   | **Faithful preview** created and validated (Part 1).                                                                                                                                                                                                                                                                                                                                                           | 🔑 branching/cost · ⚙️ execute    |
| 3   | **Runtime validation matrix on the preview** — the checks XI-2D deferred: RLS force actually blocks non-authorized reads; `graph._can_see` tenant isolation (no cross-tenant existence inference); every `public.graph_*` RPC gated on real `graph.projection.read`; publisher gated on real `graph.projection.manage`; anon denied; publish → activate → rollback; in-code↔DB parity (145 nodes / 427 edges). | ⚙️                                |
| 4   | **Preview acceptance** — all runtime checks green, documented.                                                                                                                                                                                                                                                                                                                                                 | ⚙️ report                         |
| 5   | **Arm** the `db-migrate` workflow (`SUPABASE_ACCESS_TOKEN` + canonical `SUPABASE_PROJECT_REF`, `production` env reviewers).                                                                                                                                                                                                                                                                                    | 🔑 CEO                            |
| 6   | **Apply `0028` to production** via the gated `db-migrate` workflow (reviewer-approved). Forward-only; only `0028` pending after reconciliation.                                                                                                                                                                                                                                                                | 🔑 approve · ⚙️ run               |
| 7   | **Post-apply verification** — `supabase migration list` shows `0028` applied; `check-lineage-drift` green; `graph_active_projection_status()` returns nothing until a projection is published.                                                                                                                                                                                                                 | ⚙️                                |
| 8   | **Publish + activate the first projection** on production (from `serializeGraph()`), verify parity.                                                                                                                                                                                                                                                                                                            | 🔑 authorize · ⚙️ run             |
| 9   | **(Optional, separate)** wire the Executive Portal `/graph` card to live production `graph_*` RPCs (publishable key only; never service-role in the browser).                                                                                                                                                                                                                                                  | 🔑 · ⚙️                           |

**When 0028 becomes safe to apply (summary):** after (1) reconciliation and (2)+(3)+(4)
a green faithful-preview validation. Not before. Until then it stays checksum-locked and
`notYetApplied` in the registry.

## What this phase did NOT do

No preview created, no branch deleted, no migration renamed or applied, no production
contact, no arming, no deploy, no merge. This is the plan only.
