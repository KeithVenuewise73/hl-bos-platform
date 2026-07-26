# ADR-0001 — Canonical HL-BOS Supabase project

**Status:** Accepted
**Date:** 2026-07-26
**Decision owner:** Keith (CEO / Product Owner)
**Supersedes:** the project-ref stated in `docs/operations/environments.md`, `docs/operations/migration-plan.md`, `docs/operations/phase-2-migration-set.md`, `docs/operations/bootstrap-first-platform-owner.md`, and `docs/architecture/permission-model.md` (all authored 2026-07-15, before the project split).

---

## Context

By 2026-07-15 the plan was for HL-BOS Core to live in a single new greenfield Pro project. Those docs recorded that project as `ywrzgursvdowzyhipsmt` (us-east-1). Between then and 2026-07-26, development actually landed in a **different** project, and the older docs were never updated. The Phase 0 audit (2026-07-26) verified the live state:

| Project                                  | Ref                    | Region    | Verified state (read-only, 2026-07-26)                                                                        |
| ---------------------------------------- | ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| **HL-BOS Core**                          | `mvvtngiopdrgiedjmhfb` | us-west-2 | **17 HL-BOS migrations applied; 49 tables; 10 schemas; seed data; 1 auth user; 100% RLS; 0 ERROR advisories** |
| keith@venuewise.net's Project            | `ywrzgursvdowzyhipsmt` | us-east-1 | **0 migrations, 0 tables (empty)**                                                                            |
| Herman Legacy Business Platform (legacy) | `bkfsjhhclbqrhaolvhmz` | —         | Unreachable from current token; out of scope per `CLAUDE.md`                                                  |

The two newest Phase-2 documents already flagged the discrepancy (`phase-2-implementation-report.md` §9 Blocker 4; `PR_BODY_phase2.md`), and migrations `hlbos_0007`/`hlbos_0008` name `mvvtngiopdrgiedjmhfb` in their headers as the project they were reconciled from. The evidence is unambiguous: the real, implemented HL-BOS lives in `mvvtngiopdrgiedjmhfb`.

## Decision

1. **The canonical HL-BOS Supabase Pro project is `HL-BOS Core`, ref `mvvtngiopdrgiedjmhfb`.** All new HL-BOS shared services and reusable modules target this project.
2. **The alternate project `ywrzgursvdowzyhipsmt` is empty and must not receive new HL-BOS development** unless the CEO later reverses this decision.
3. **`ywrzgursvdowzyhipsmt` must not be deleted, paused, or modified** during Phase 1. Its retirement requires a separate CEO-approved assignment; a retirement-readiness report is maintained at `docs/visibilityai/phase-1-enablement/04-retirement-readiness-empty-project.md`.
4. **The legacy project `bkfsjhhclbqrhaolvhmz` remains out of scope** and unreachable; no HL-BOS work touches it.

## Non-secret note

A Supabase project ref is **not a secret** — it appears in every client request URL (`https://<ref>.supabase.co`). Recording refs in this repository is intentional and safe. The publishable key, service-role key, database password, and all provider credentials are secrets and appear nowhere in version control (they are Vault entries / runtime env, referenced by name only).

## Consequences

- **Positive:** the one project with real, tested schema becomes the single source of truth; no data migration or risk from moving projects; docs stop contradicting reality.
- **Cost / cleanup:** five 2026-07-15 docs cite the empty ref and are corrected (see the correction banners added to each, pointing here). The empty project stays parked pending a retirement assignment.
- **Governance:** because the 17 migrations reached `mvvtngiopdrgiedjmhfb` out-of-band, a protected apply/deploy path is introduced in Phase 1 Checkpoint 1 so future changes are governed (see `docs/visibilityai/phase-1-enablement/03-deployment-and-migration-plan.md`).

## Evidence

- `mcp list_projects` / `list_migrations(mvvtngiopdrgiedjmhfb)` → 0001–0017 present.
- `list_migrations(ywrzgursvdowzyhipsmt)` → `[]`; catalog query → 0 tables.
- Migrations `supabase/migrations/20260718014016_hlbos_0007_tenant_class.sql` and `..._0008_provision_tenant_class.sql` headers.
- Phase 0 audit: `docs/architecture-audit/visibilityai-phase-0/` (Deliverables 02, 04, 13).
