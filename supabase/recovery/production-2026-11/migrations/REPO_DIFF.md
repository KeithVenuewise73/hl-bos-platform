# HL-BOS Core — production ledger vs `supabase/migrations/` on `main`

Project: `mvvtngiopdrgiedjmhfb` (HL-BOS Core)
Ledger source: `supabase_migrations.schema_migrations` (111 rows), exported 2026-11-04, MD5-verified against the live database (see `MANIFEST.csv`).
Repository baseline: `origin/main` @ `7b67610` (54 files in `supabase/migrations/`).

Comparison method: each repository file is matched to the ledger row with the same migration name. Texts are compared (a) byte-for-byte and (b) after removing `--` comments and collapsing whitespace ("normalized").

## Summary

| Class                                     | Count | Meaning                                                                                                                               |
| ----------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Byte-identical                            | 1     | Repo file and applied SQL are the same bytes                                                                                          |
| Whitespace / comment-only differences     | 31    | Same statements; the applied copy was stripped of comments or re-wrapped                                                              |
| **Ledger holds a stamp only**             | 9     | The ledger row is a one-line comment `-- applied from git <sha> via controlled MCP deployment`; the SQL body is **not** in the ledger |
| Semantic differences                      | 5     | Statements differ between the repo file and the applied SQL                                                                           |
| Stamp differences                         | 18    | Version timestamp or name differs; body normalized-identical                                                                          |
| Repo-only (never applied to this project) | 8     | Files on `main` with no ledger row                                                                                                    |
| Production-only (no file on `main`)       | 65    | Applied migrations with no repo counterpart                                                                                           |

Totals: 54 repo files; 111 ledger rows; 46 ledger rows have a repo counterpart.

## Stamp-only ledger rows (9) — source of truth is git, not the ledger

| Ledger version | Name                              | Stamp       | Repo file at that commit | Same as `main`? |
| -------------- | --------------------------------- | ----------- | ------------------------ | --------------- |
| 20260725100000 | hlbos_0009_events                 | git 625c0f3 | present                  | identical       |
| 20260725100100 | hlbos_0010_entitlements           | git 625c0f3 | present                  | identical       |
| 20260725100200 | hlbos_0011_integrations           | git 625c0f3 | present                  | identical       |
| 20260725100300 | hlbos_0012_ai_gateway             | git 625c0f3 | present                  | identical       |
| 20260725100400 | hlbos_0013_workflows_gate         | git 625c0f3 | present                  | identical       |
| 20260725100500 | hlbos_0014_visibility_core        | git 625c0f3 | present                  | identical       |
| 20260726090000 | hlbos_0015_billing_core           | git 45c3418 | present                  | identical       |
| 20260726090100 | hlbos_0016_billing_subscriptions  | git 45c3418 | present                  | identical       |
| 20260726090200 | hlbos_0017_visibility_assessments | git 45c3418 | present                  | identical       |

`625c0f3` = "Merge PR #13: VisibilityAI V0 — reusable HL-BOS shared primitives + module boundary" (2026-07-26). `45c3418` = "Merge PR #14: Billing (0015–0016) + VisibilityAI Assessment workflow (0017)" (2026-07-26). Both commits exist in `origin` history and the nine files are byte-identical between those commits and `main`.

Recovery status for these nine: **source recovered from git**, **not byte-verified against what was executed** (the ledger did not retain the body). The schemas they create (`events`, `entitlements`, `integrations`, `ai`, `workflows`, `visibility`, `billing`) exist in production, which is consistent with — but does not prove — those exact bodies having been applied.

## Semantic differences (5)

| Migration                             | What differs                                                                                                                                                                                                                                                       | Which copy matches the live catalog?                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| hlbos_0032_vstudio_discovery_metadata | Repo file includes `create extension if not exists pg_trgm with schema extensions;` — the applied copy does not                                                                                                                                                    | Not checked (extension presence is a separate question)                                                                                         |
| hlbos_0034_vstudio_level1_triage      | Applied copy uses single `*_terms` regex lists per domain; the repo file has the later core/supporting split and the two-term rule. Production later applied `hlbos_0034r01_…_core_terms` and `hlbos_0034r02_…_two_term_rule` (both production-only)               | Live `vstudio.score_level1` has the core/sup split and two-term rule (checked 2026-11-04) → the repo file is a **squash** of 0034 + r01 + r02   |
| hlbos_0035_vstudio_portfolios         | Same pattern: applied copy scores on a flat `p_matched->'<domain>'` array; repo file scores on `->'core'`/`->'sup'` with a 0.35/0.65 blend                                                                                                                         | Consistent with the squash above; not independently checked                                                                                     |
| hlbos_0039_vstudio_provable_gate      | Applied copy is 2.2 KB: creates `vstudio.assert_intelligence_manage()` then rewrites existing function bodies **in place** via a `DO $mig$` loop over `pg_proc`. Repo file is 28 KB: re-issues full `create or replace function` statements for the same functions | Live `score_level1` calls `assert_intelligence_manage()` and no longer has the `session_user not in` guard — both copies produce that end state |
| hlbos_0046_social_publishing          | Applied copy is the repo file with comments stripped; one `comment on function` string differs ("Marks the post publishing." removed)                                                                                                                              | Cosmetic                                                                                                                                        |

Conclusion: `main` carries a **consolidated** history for the vstudio intelligence layer; production carries the **step-by-step** history (0034 → r01 → r02 → 0039 in-place rewrite). The end state agrees where checked. Neither copy should overwrite the other: the ledger copies are preserved here verbatim; `main` is left untouched.

## Repo-only, never applied here (8)

`hlbos_0030_ceo_notebook`, `hlbos_0044_capability_extraction`, `hlbos_0045_reframe_pain_portfolio`, `hlbos_0049_highlightai_football`, `hlbos_0050_sceneflow`, `hlbos_0052_jersey_sort`, `hlbos_0053_team_galleries`, `hlbos_0054_team_gallery_publisher`.

Production instead has `hlbos_0044a`, `hlbos_0044b`, `hlbos_0045_…_honestly`, `hlbos_0049_playtime` (different content under the same numbers). Numbers 0044/0045/0049 are therefore **collided** between repo and production. Do not apply the repo files under those numbers without a rename and a review.

## Production-only (65)

Groups: `dma` ×19, `disco` ×7, `hlvs_board` ×2, `temp_perftest` ×1, `ingest_capture` ×1, `hlbos_0034r01/r02` ×2, `hlbos_0044a/b` ×2, `hlbos_0045_…_honestly` ×1, `jobscout` ×8, `barberos` (hlbos_0048–0058) ×11, `hlbos_0049_playtime` ×1, `hlbos_0055` audit API + r01/r02 ×3, `fleet` ×5, `scorecard` ×2.

All 65 are recovered verbatim in this directory. None exist on `main`; the BarberOS set exists (in different form) on branch `claude/shop-transformation-barber-os-ntwb2n` — see the BarberOS consolidation plan.

## What this directory is and is not

- It **is** the verbatim, MD5-verified copy of every migration row production has recorded, with original version timestamps and names. Nothing has been renumbered.
- It **is not** a replacement for `supabase/migrations/`. The files here are not wired into any tooling and must not be applied anywhere; several would fail or duplicate objects if re-run.
