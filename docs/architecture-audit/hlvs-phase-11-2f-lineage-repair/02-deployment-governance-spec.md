# XI-2F · Deployment governance specification (implemented)

This governance is **implemented and tested** in this phase (offline; nothing remote
was touched). It makes the lineage self-verifying and the deployment target
unambiguous, so the XI-2D/XI-2E situation cannot recur silently.

## Components

| Component                 | File                                         | Role                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical registry**    | `.hlbos/canonical.json`                      | Single machine-readable source of truth: canonical repo, canonical project ref, environment registry, foundation ordinals, not-yet-applied ordinals, and the recorded `knownMigrationDrift`. |
| **Lineage manifest**      | `.hlbos/migration-lineage.json`              | Generated checksum lock: every migration's `{ordinal, name, filename, version, sha256, foundation, notYetApplied, productionAppliedVersion}`.                                                |
| **Offline lineage check** | `scripts/check-lineage.mjs`                  | Verifies sequence, monotonic versions, checksum lock, and canonical consistency. `--write` regenerates the manifest.                                                                         |
| **Online drift check**    | `scripts/check-lineage-drift.mjs`            | Parses `supabase migration list` and asserts production's applied set matches the canonical declaration.                                                                                     |
| **CI wiring**             | `.github/workflows/ci.yml`, `db-migrate.yml` | Runs the checks; guards the apply target.                                                                                                                                                    |

## What CI now detects

| Threat                                                       | Detected by                           | How                                                                                          |
| ------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Migration identity drift** (version changed)               | offline check                         | version in file must match the checksum-locked manifest; monotonic order enforced            |
| **Duplicate migration numbers**                              | offline check + `check-migrations.sh` | duplicate ordinal → fail                                                                     |
| **Checksum mismatch / silent edit** of an existing migration | offline check                         | file SHA-256 must match manifest; editing without `--write` fails                            |
| **Ordinal gaps / misorder**                                  | offline check                         | ordinals must be `1..N` contiguous                                                           |
| **Unexpected lineage divergence** in production              | online drift check                    | remote applied set must equal the canonical declaration; a foreign/out-of-band version fails |
| **Incorrect deployment target**                              | `db-migrate.yml` guards               | link/apply refuse unless `SUPABASE_PROJECT_REF == canonical.canonicalProjectRef`             |

Verified locally: the offline check passes clean and **fails** on a tampered migration
and on a duplicate ordinal; the online check passes on a current-reality fixture and
**fails** on an injected foreign remote version and on a missing expected version.

## Environment registry (`.hlbos/canonical.json → environments`)

| Name                   | Ref                    | Role                     | Authoritative | Disposition                                       |
| ---------------------- | ---------------------- | ------------------------ | :-----------: | ------------------------------------------------- |
| production             | `mvvtngiopdrgiedjmhfb` | canonical-production     |      ✅       | the one authoritative target                      |
| hlbos-m1-portfolio     | `moftgnrbnsixeddcwdpz` | abandoned-preview-branch |      ❌       | archive → delete later; never a validation target |
| keith-venuewise-parked | `ywrzgursvdowzyhipsmt` | empty-parked             |      ❌       | keep; do not develop; do not delete               |
| legacy-herman-platform | `bkfsjhhclbqrhaolvhmz` | legacy-unreachable       |      ❌       | out of scope (security findings)                  |

## Canonical project registry (authoritative facts)

- **Canonical repository:** `KeithVenuewise73/hl-bos-platform` (branch `main`, protected).
- **Canonical Supabase project:** `mvvtngiopdrgiedjmhfb` (HL-BOS Core, us-west-2) — consistent with ADR-0001 and `packages/catalog/src/app-registry.ts` (`CORE`).
- **Deployment paths (the only remote-write paths):** `.github/workflows/db-migrate.yml` (migrations) and `.github/workflows/deploy.yml` (edge functions) — both manual-dispatch, `production`-environment-gated, and now target-guarded against non-canonical refs. Inert until the CEO arms `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`.

## Operating rules

1. **Adding/altering a migration** → run `pnpm lineage:write` and commit the manifest diff in the same PR. The diff is the audit trail.
2. **The manifest is checksum-truth.** An unexplained checksum change in CI means a migration was edited — investigate before merging.
3. **One authoritative production environment.** The offline check enforces exactly one; the workflows refuse any other target.
4. **`main` stays protected**; remote applies remain manual + reviewer-gated (unchanged).

## Relationship to existing checks

This **complements** `scripts/check-migrations.sh` (per-file filename/secret/destructive
rules) and the local `supabase db reset` + pgTAP in CI (proves the set applies from
empty). New here: whole-lineage integrity (checksum lock, sequence, monotonic
versions), canonical-target guards, and production-vs-declaration drift detection.
