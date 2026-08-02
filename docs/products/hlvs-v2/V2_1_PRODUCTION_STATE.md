# HLVS V2 · V2-1 — Production State (authoritative record)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Read-only verification; no production change in this phase.**

## Snapshot

| Fact                                        | Value                                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical project                           | HL-BOS Core `mvvtngiopdrgiedjmhfb` (db `postgres`)                                                                                                                           |
| Merged code                                 | `main` @ `7dc7ec202afd81e02b8c70e203c11de2a4a687a2`                                                                                                                          |
| Repository migration                        | `supabase/migrations/20260801120000_hlbos_0029_venture_studio_foundation.sql`                                                                                                |
| Applied to production                       | **YES** — 2026-08-01                                                                                                                                                         |
| Production migration **name**               | `hlbos_0029_venture_studio_foundation`                                                                                                                                       |
| Production migration **version (recorded)** | `20260801233354` (management-API timestamp)                                                                                                                                  |
| Repository filename **version**             | `20260801120000`                                                                                                                                                             |
| SQL checksum identity                       | sha256 `ee83df9dfa6258e24b4c0c698bf55f11cd9d0bb2ba07ca7c52469e216aac9f44` — **applied DDL == committed DDL** (byte-identical; verified worktree == main == lineage manifest) |
| Application deployed?                       | **NO** — `apps/venture-studio` is undeployed                                                                                                                                 |

## Verified production objects (`vstudio`)

- Schema `vstudio` exists.
- **6 tables** (exactly as intended): `opportunities`, `evidence`, `notes`, `evaluations`, `recommendations`, `decisions`.
- RLS **enabled + forced** on all 6; one `_select` policy per table gated on `identity.has_platform_permission('vstudio.opportunity.read')`.
- **8 functions** (7 write RPCs + `_require` guard), all `SECURITY DEFINER` with `search_path=""`.
- **5 permission keys** (`vstudio.opportunity.read/manage`, `vstudio.evaluation.manage`, `vstudio.recommendation.create`, `vstudio.decision.create`).
- Anon table privileges: **0**. Authenticated: SELECT-only (0 direct writes). `decision.create` → **platform_owner only**.
- FK types resolve: `recommendations.ai_run_id` **bigint** → `ai.runs(id)`; `evidence.document_ref` **uuid** → `storage_meta.files(id)`.

## Existing-platform impact

**Purely additive.** Only new `vstudio` objects were created and 5 permission keys + role grants inserted (`on conflict do nothing`). No `ALTER`/`DROP` on any existing object. Latest applied migration before 0029 was `20260731090000` (0028); existing schemas and data untouched. Existing apps (executive-portal, hl-bti) do not reference `vstudio` and are unaffected.

## Internal tenant (provisioned 2026-08-02)

A dedicated first-party tenant **Herman Legacy Group Internal** (slug `herman-legacy-internal`) was created through the canonical `platform.provision_tenant` path to own Venture Studio records — kept separate from HSCS Government. CEO is an active `tenant_owner`; the five `vstudio` permissions resolve for the CEO; purely additive; audited. The resolved `VSTUDIO_TENANT_ID` is recorded privately in `V2_1_DEPLOYMENT_READINESS.md` (not printed here). Provisioning record: `V2_1_INTERNAL_TENANT_PROVISIONING.md`.

## Deployment / runtime boundary (unchanged)

No Coolify Venture Studio resource · no domain · **`VSTUDIO_TENANT_ID` resolved but not configured in Coolify** · no container started · DNS unchanged. `vstudio` PostgREST exposure: **not yet exposed** (see `V2_1_POSTGREST_EXPOSURE_PLAN.md`).

## Version-record mapping (governance truth)

> Repository migration `20260801120000_hlbos_0029_venture_studio_foundation.sql`
> is recorded in production `supabase_migrations.schema_migrations` as
> **name** `hlbos_0029_venture_studio_foundation`, **version** `20260801233354`.
> The applied DDL is byte-identical to the committed file (sha256 `ee83df9…`).

Reconciliation analysis + recommendation: `V2_1_MIGRATION_METADATA_RECONCILIATION.md`.
