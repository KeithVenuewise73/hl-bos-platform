# HLVS V2 · V2-1 — Implementation Report

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01 · **Merged to `main` via PR #21 (`7dc7ec2`); migration 0029 applied to production.**

## What was built (assembled on HL-BOS)

The smallest production-quality foundation that proves the whole workflow:
**capture → evidence → evaluate → reuse → advisory recommendation → CEO decision → Factory readiness preview.**

| Layer            | Artifact                                                   | Notes                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain logic** | `packages/venture-studio` (`@hl-bos/venture-studio`)       | Pure, tested: statuses, evaluation dimensions, **deterministic reuse scoring over `@hl-bos/catalog`**, advisory-vs-authoritative separation, read-only Factory readiness. No I/O. |
| **Database**     | `supabase/migrations/…_0029_venture_studio_foundation.sql` | Thin `vstudio` schema: **6 tables**, RLS forced, 5 permissions, 7 definer RPCs. **Applied to production 2026-08-01** (see `V2_1_PRODUCTION_STATE.md`).                            |
| **DB tests**     | `supabase/tests/22_venture_studio.sql`                     | 11 pgTAP assertions (intake gate, CEO-only decision gate, advisory-never-authoritative, RLS/anon). CI-verified.                                                                   |
| **App**          | `apps/venture-studio` (`@hl-bos/venture-studio-app`)       | Next.js standalone, port 4500, HL-BOS SSR auth, **10 pages**, 3 write route handlers.                                                                                             |
| **Governance**   | `app-registry.ts` + `registry.ts` + lineage manifest (29)  | App + package registered; migration lineage regenerated + verified.                                                                                                               |

### The 10 pages

Executive Overview (`/`) · Opportunity Catalog (`/opportunities`, filterable) · New Opportunity (`/opportunities/new`) · Opportunity Detail (`/opportunities/[id]`) · Research & Evidence · Evaluation · Reuse Analysis · CEO Decision · Factory Readiness Preview · Sources & Settings (`/settings`).

## What is reused vs net-new

- **Reused unchanged:** HL-BOS identity (Supabase Auth) + `identity.has_platform_permission`, `platform.tenants`, `ai.runs` (FK), `events.emit` (event trail), `storage_meta.files` (document FK), and the **entire `@hl-bos/catalog` reuse engine** (`evaluateReuse`, `MODULE_REGISTRY`, capabilities).
- **Net-new (justified in the reuse matrix):** one `vstudio` schema (6 tables), the pure `@hl-bos/venture-studio` package, and the app. Three architecture-proposed tables were **not** built (sources → in-code; reuse/portfolio/handoff → computed on demand).

## How the acceptance criteria are met

| Criterion                      | How                                                                             | Evidence                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Authenticated via HL-BOS       | reuses executive-portal SSR pattern                                             | `src/lib/session.ts`, `middleware.ts`                                                   |
| Opportunity intake works       | `NewOpportunityForm` → `POST /api/opportunities` → `vstudio.create_opportunity` | route + RPC; pgTAP `t_owner_can_create_opportunity`                                     |
| Evidence capture works         | `EvidenceForm` → `add_evidence`                                                 | pgTAP `t_owner_can_add_evidence`                                                        |
| Evaluation works               | `record_evaluation` (composite excludes unknowns)                               | pgTAP `t_owner_can_record_evaluation`; unit tests                                       |
| Reuse uses **real** catalog    | `analyzeReuse` over `@hl-bos/catalog`                                           | `reuse.test.ts` (determinism, real matches)                                             |
| Recommendation advisory        | `authoritative` default false + CHECK                                           | pgTAP `t_recommendation_never_authoritative`; unit test                                 |
| CEO decision separated         | `vstudio.decision.create` granted to platform_owner ONLY                        | pgTAP `t_non_ceo_cannot_record_decision` + `t_ceo_can_record_decision`; app `canDecide` |
| Factory preview not executable | `computeFactoryReadiness` returns `executable:false` always                     | unit test invariant                                                                     |
| No anonymous mutation          | middleware redirects unauth API calls (307); RPCs revoke anon                   | runtime: `POST /api/opportunities` → 307                                                |
| Production build passes        | standalone built; boots; `/api/health`=ok; `/`→307 `/login`                     | build log + runtime check                                                               |

## Verification actually run (locally)

- `pnpm check` (format + lint + typecheck across 12 packages + lineage + tests): **PASS — 386 tests**.
- `pnpm build`: **PASS** — venture-studio compiled all 17 routes; standalone `server.js` present.
- Runtime: booted the standalone binary under production env → `GET /api/health` = `{"status":"ok","app":"venture-studio"}`, `GET /` → **307 → /login** (auth gate; dev bypass impossible), unauth `POST /api/opportunities` → **307** (no mutation).
- Secret scan + TypeScript-pin: **PASS**.
- **pgTAP (`22_venture_studio.sql`) is CI-verified**, not run locally: the Supabase CLI is unavailable in this environment, so the DB tests execute in CI's `supabase db reset` + `supabase test db` job against an ephemeral database — never production.

## Honest gaps / limits (V2-1)

- Migration 0029 is now **applied to production** (2026-08-01). Live persistence still requires `vstudio` to be **exposed to the API** and the app deployed; until then the app shows explicit "not provisioned" states (no fabricated data). See `V2_1_POSTGREST_EXPOSURE_PLAN.md`.
- Writes need `VSTUDIO_TENANT_ID` (first-party tenant) set at deploy; unset → honest "tenant not configured".
- No external connectors, no AI generation, no autonomous workers (by design; V2-2+).
