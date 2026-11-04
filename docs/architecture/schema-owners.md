<!-- Recovered/written 2026-11-04 on branch recovery/hlbos-production-2026-11. Status: PROPOSED — takes effect when this PR is approved and merged. -->

    # Schema owners — HL-BOS Core (`mvvtngiopdrgiedjmhfb`)

    One owner per schema. The owner is the only place a change to that schema may originate. "Production ledger only" means the executed SQL exists nowhere but in the database's own migration ledger — recovered verbatim on 2026-11-04 into `supabase/recovery/production-2026-11/migrations/`.

    | Schema / tables | Product | Source of truth today | Notes |
    | --- | --- | --- | --- |
    | `identity, entitlements, workflows, events, integrations, ai, billing` | HL-BOS platform core | hl-bos-platform `supabase/migrations/` (0001–0017) | Shared primitives. Every product depends on them. Changes require a platform ADR. |
| `visibility` | VisibilityAI | hl-bos-platform `supabase/migrations/` (0014, 0017) | First product module on the core. |
| `vstudio` | Venture Studio intelligence (HLVS Phase 2) | hl-bos-platform `supabase/migrations/` (0032–0039) — consolidated; production ledger holds the step-by-step rows | Repo is a squash of 0034/r01/r02/0039 — see REPO_DIFF.md. |
| `dma, disco, hlvs_board, ingest` | HLVS discovery / DMA pipeline | **Production ledger only** (`supabase/recovery/production-2026-11/migrations/`) | No file on `main`. 29 rows. Recovered 2026-11-04. |
| `jobscout` | JobScout | **Production ledger only** (8 rows) | No file on `main`. |
| `barberos` | BarberOS (hlbos_0048–0058) | Production ledger (11 rows); divergent copies on `claude/shop-transformation-barber-os-ntwb2n` | Consolidation plan: docs/operations/barberos-consolidation-plan.md |
| `fleet, scorecard` | FleetHuddle / Scorecard | **Production ledger only** (7 rows) | RLS enabled, not forced. Preservation plan: docs/operations/fleethuddle-preservation-plan.md |
| `social` | Social publishing (0046) | hl-bos-platform `supabase/migrations/` | Applied copy is comment-stripped. |

    ## Rules

    1. A schema has exactly one owning product. A product that needs another product's tables goes through that product's API (RPC, view or edge function), never by writing migrations into another owner's schema.
    2. "Production ledger only" is a defect to be closed, not a permanent state: the owner's next migration PR must first commit the recovered rows for that schema into the owner's `supabase/migrations/` **unchanged** (same version stamp, same body) so the repo ledger and the database ledger agree. Until then, nothing new is applied to that schema.
    3. Duplicated schemas across projects (`jobscout` ×2, PlayingTime ×2, HLVS v1 vs `vstudio`) get a single owner decision recorded in `docs/architecture/decisions/` before either copy changes.
    4. Changing this table is a PR to this file with the reason stated in the PR body.
