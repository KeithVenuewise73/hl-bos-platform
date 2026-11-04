<!-- Written 2026-11-04 on branch recovery/hlbos-production-2026-11. Status: PLAN — no branch other than the recovery branch has been created or modified. -->

# BarberOS consolidation plan → `release/barberos-v1`

Two branches, one product, one production schema. This plan says how they become one branch that matches production, without rewriting anything that works. Creating `release/barberos-v1` is Level A (a branch); applying any migration it carries is Level B; merging it is Level C.

## Inputs (VERIFIED, Phase 3 + ledger)

| | Branch A `claude/shop-transformation-barber-os-ntwb2n` (**authoritative**) | Branch B `claude/barberos-current-state-audit-xz3psp` (**preserve**) | Production (`mvvtngiopdrgiedjmhfb`) |
| --- | --- | --- | --- |
| Migrations | 0048–0059 (12 files, prod's names; version stamps `20260909120000…` differ from prod's `20260909203027…`) | 0049–0054 verbatim reconstructions of A's end state; 0055 audit public API; 0056 cockpit API | hlbos_0048–0058 (11 rows) + 0055r01, 0055r02 (13 rows total) |
| Not applied anywhere | 0059 barberos_booking (5 tables, `btree_gist` exclusion, 25 RPCs, pgTAP plan(45)) | 0056 cockpit API (11 fns incl. `provision_client`, pipeline) | — |
| Apps | `apps/barbershop` (Next 15, port 4400, Dockerfile, 76 unit tests), `apps/shop-pages` (Deno host for `site` fn) | `apps/barberos-cockpit` (static Next export, port 4700, no Dockerfile, 59 unit tests; pgTAP 49/53/55/56) | `site` edge function deployed (serves published shop pages) |
| Data | — | — | shops 1, sites 1, bundles 3, capabilities 16, clients 0, visits 0; `transform_audit` 50 shop profiles / 40 runs |

## Steps

1. **Create** `release/barberos-v1` from `origin/main` (not from A — so main's 0001–0047 and CI stay intact). Level A.
2. **Copy A's `supabase/migrations/` 0048–0058** onto it **renamed to production's version stamps** (`20260909203027_hlbos_0048_…` etc., from `supabase/recovery/production-2026-11/migrations/MANIFEST.csv`), bodies from A. Then diff each body against the ledger copy; where the ledger differs semantically, **the ledger wins** (it is what ran) and the difference is recorded in `REPO_DIFF.md`. Level A.
3. **Add B's 0055** under production's stamp, plus **0055r01 and 0055r02 from the ledger** (they exist nowhere in git). Level A.
4. **Do not copy B's 0049–0054** (duplicates). Record in the PR that B's copies were reviewed and found equivalent.
5. **Renumber the two unapplied migrations** to avoid colliding with applied ordinals: A `0059_barberos_booking` → `hlbos_0060_barberos_booking`, B `0056_barberos_cockpit_api` → `hlbos_0061_barberos_cockpit_api`, each with a fresh timestamp. Renumbering is allowed here because neither has been applied anywhere. Pre-check for 0060: `btree_gist` 1.7 is available but **not installed** in production (VERIFIED) — the migration must `create extension if not exists btree_gist with schema extensions` as its own preceding file (`hlbos_0059_enable_btree_gist`) per the migration policy.
6. **Port apps**: `apps/barbershop` and `apps/shop-pages` from A; `apps/barberos-cockpit` from B with a Dockerfile added (same pattern as `apps/barbershop`). Level A.
7. **Port tests**: A's 76 + B's 59 unit tests; pgTAP 49, 53, 55, 56, and 59→60. Run `pnpm test` and the pgTAP suite locally against a Supabase branch seeded from the ledger. Level A; results pasted in the PR.
8. **Lineage checker** (`apps/control-center` registry/lineage) must match migrations by **name + version**, not ordinal, because production itself has ordinal collisions (0034/0034r01, 0044/0044a, 0049 playtime vs highlightai).
9. **Open PR** `release/barberos-v1` → `main` with: the diff table from step 2, test output from step 7, and the two Level B packages (apply 0059/0060/0061 to production) attached but unapproved.
10. CEO decisions: approve the PR (Level C merge), approve applying 0059–0061 (Level B), decide hosting for the three apps (DigitalOcean App Platform has 0 apps today).

## What is not in scope
SMS/billing/notification hooks for BarberOS (none exist on either branch — see the shared-services plan), per-shop custom domains (`apps/shop-pages` is slug-path only), a reschedule flow in `/book`.

## Effort estimate
Steps 1–8: one engineering session, mostly mechanical; the risk is in step 2's semantic diffs and step 7's pgTAP run against a real schema branch.
