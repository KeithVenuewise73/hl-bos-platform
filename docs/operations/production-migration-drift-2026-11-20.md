# Production vs repository: migration drift (read-only inventory)

**Taken:** 2026-11-20, from `list_migrations` on the canonical project
(`mvvtngiopdrgiedjmhfb`) compared with `supabase/migrations/` at commit `4593202`.
Nothing was changed in production or in the lineage files by this inventory.

## Result

| Set                                          | Count |
| -------------------------------------------- | ----- |
| Applied in production, **no file in the repo** | 69    |
| In the repo, **not applied in production**   | 6     |

### Applied in production, missing from the repo (by name)

- **dma_0001 … dma_0016** (16): the Digital Market Analysis layer.
- **disco_0001 … 0006, disco_0003_search_pattern…, hlvs_board_*, ingest_capture_search_pattern, temp_perftest_page_twin** (11): discovery and the HLVS board. `temp_perftest_page_twin` is named like a throwaway and is worth a look.
- **hlbos_0034r01, 0034r02, 0044a, 0044b, 0045_reframe_pain_portfolio_honestly** (5): repairs and splits of repo migrations under different names.
- **jobscout_0001 … 0010 and hlbos_sec_b2_jobscout_views_invoker** (9).
- **BarberOS** (11): `hlbos_0048_barberos_capability_catalog`, `0049_transform_audit`, `0050_citext_guard_semantics`, `0051_unknown_is_not_complete`, `0052_barberos_owned_website`, `0053_barberos_public_site_read`, `0054_discovery_call`, `0055_proposal`, `0056_barberos_shop_api`, `0057_barberos_product_map`, `0058_barberos_client_crm`, plus `0055_barberos_audit_public_api`, `0055r01`, `0055r02`.
- **hlbos_0049_playtime_tracker**.
- **Fleet and scorecards** (7): `hlg_fleet_module`, `hlg_fleet_query_scoping`, `hlg_fleet_validation_guards`, `hscs_company_scorecards`, `independent_scorecards`, `driver_medical_cards`, `medical_card_orphan_cleanup`.
- **Missed-call and ServiceOS** (3): `comms_missed_call_textback_v1`, `serviceos_callbacks_core_v1`, `serviceos_business_config_presets_v1`.

### In the repo, not applied in production

By name, six repo migrations have no production twin: `0030_ceo_notebook`,
`0049_highlightai_football`, `0050_sceneflow`, `0052_jersey_sort`, and two that look
like renames rather than gaps: `0044_capability_extraction` (production holds it split
as `0044a` and `0044b`) and `0045_reframe_pain_portfolio` (production:
`…_honestly`). That leaves four that appear genuinely not applied. The JerseySort one
is already documented as awaiting approval. I have not compared the SQL bodies.

## Why this matters

1. **Ordinals are reused with different content.** Production has two `0049`s, two
   `0048`s, three `0055`s and two `0051`s, and its `0053` is
   `barberos_public_site_read` while the repo's `0053` is `team_galleries`. The
   repo's lineage rule (sequential, unique ordinals) cannot describe production.
2. **Version identifiers differ even where names match** (for example `0029`:
   production `20260801233354`, repo `20260801120000`). `db push` and the online
   drift check will report this.
3. **BarberOS and the missed-call text-back exist only in production.** SiteGen's
   barber vertical and its later growth hooks overlap them, and nobody can read their
   definitions from the repo.

## What was and was not done

I said I would reconcile these first. I **did the inventory and stopped there**:
copying 69 migrations in with colliding ordinals would make
`scripts/check-lineage.mjs` fail (it requires contiguous, unique ordinals), so doing it
properly needs a lineage decision, not a file copy.

**Recommendation (ADR needed):** keep the repo lineage as is, add a second, read-only
registry of "production-only" migrations (exact SQL exported from
`supabase_migrations.schema_migrations`, checksummed, never re-applied), and teach the
drift check about it. I can export the SQL read-only whenever you approve that.

## Effect on SiteGen

None for now. `0060_sitegen_core` is unused in production, production has no `sitegen`
schema, and SiteGen touches no BarberOS, ServiceOS or `comms` object.
