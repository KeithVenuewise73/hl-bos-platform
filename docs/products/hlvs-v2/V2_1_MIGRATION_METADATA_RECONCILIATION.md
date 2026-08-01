# HLVS V2 · V2-1 — Migration Metadata Reconciliation Analysis

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Analysis only — no metadata was changed.**

## The discrepancy

Migration 0029 was applied to production through the **Supabase management API** (`apply_migration`), which stamps the migration-history row with **its own timestamp** rather than the repository filename's timestamp:

|                                        | Value                                  |
| -------------------------------------- | -------------------------------------- |
| Repository filename version            | `20260801120000`                       |
| Production `schema_migrations.version` | `20260801233354`                       |
| Migration name (both)                  | `hlbos_0029_venture_studio_foundation` |
| Applied DDL vs committed DDL           | **byte-identical** (sha256 `ee83df9…`) |

Only the **history-metadata timestamp** differs. The schema, security, and behavior are correct and identical to the committed migration.

## Options, classified

| Option                                                       | Method                                                                                                                                                                                      | Classification                                      | Notes                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Documentation-only**                                    | Leave production metadata as-is; record the version mapping in the repo (this doc + `V2_1_PRODUCTION_STATE.md`)                                                                             | ✅ **Supported / safest**                           | Zero production risk. DDL identity already proven by checksum. The platform's canonical registry is repo-side; the name matches.                                           |
| **B. `supabase migration repair`**                           | `supabase migration repair --status reverted 20260801233354` then `--status applied 20260801120000` (or the single-command form) via the CLI, run only from the gated `db-migrate` workflow | ✅ Supported (Supabase's official history-fix tool) | Requires the Supabase CLI + `SUPABASE_ACCESS_TOKEN` (not available in this environment). Realigns the recorded version to the repo. A **separate, CEO-authorized** action. |
| **C. Direct `UPDATE supabase_migrations.schema_migrations`** | Hand-edit the version                                                                                                                                                                       | ⚠️ **Technically possible but unsupported**         | Supabase does not sanction hand-editing its migration-history table; risks confusing future CLI `db pull`/`db push` and diff logic. **Not recommended.**                   |

## Could changing the recorded version affect anything?

| Concern                                    | Impact of realigning to `20260801120000`                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Future migration discovery                 | None — discovery is by files in `supabase/migrations/`; production history is compared by version+name.                                                                                                                 |
| Migration ordering                         | None — `20260801120000` is still after `20260731090000` (0028) and before any future 0030. Realigning **improves** ordering fidelity.                                                                                   |
| CLI `db pull` / `db push`                  | `db push` compares repo files vs recorded history by version; a matching version prevents a spurious "missing/extra migration" diff. Realignment is beneficial; a hand-edit (Option C) is what risks confusing the CLI. |
| CI lineage checks (`check-lineage.mjs`)    | Repo-side only; unaffected either way.                                                                                                                                                                                  |
| Drift detection (`db-migrate` drift-check) | Compares repo SQL vs production stored statements by checksum — the **DDL matches**, so no drift on content. A version mismatch could surface as a metadata note, not a content drift.                                  |
| Production recovery                        | None — the schema is fully defined; recovery restores objects, not the history timestamp.                                                                                                                               |

## Recommendation

**Adopt Option A (documentation-only) now** — it is the supported, zero-risk action, and the DDL identity is already proven. Record the version mapping (done, in `V2_1_PRODUCTION_STATE.md`).

**If strict version alignment is later required** (e.g., before the first `supabase db push` that includes 0030), use **Option B (`supabase migration repair`)** from the gated `db-migrate` workflow — the official, supported method — as a **separate, explicitly authorized** step. **Never Option C** (direct table edit).

**No metadata update was performed in this phase.**
