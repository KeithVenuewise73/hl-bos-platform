# fleet.api — security and validation assessment (before adaptation)

Subject: the production fleet backend on HL-BOS Core, deployed 2026-10-17
outside source control and recovered byte-for-byte to
`supabase/recovered/production-2026-10-17/`. Read in full; every finding was
checked against the recovered SQL and, where marked **tested**, exercised in
the isolated database. 2026-11-04.

## What is sound

|                  |                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry point      | One `SECURITY DEFINER` function with `search_path = ''`, executable by `authenticated` only. Tables revoke all direct access from `anon`/`authenticated`; the RLS policies are a second layer. **tested** (direct `fleet.api` call refused after P002) |
| Identity         | Requires a confirmed e-mail; refuses a revoked session (`auth.sessions`); membership checks `platform.tenant_is_operable`, so a suspended company is closed to its own owner. **tested**                                                               |
| Tenant isolation | Every company-scoped op resolves the caller's role in _that_ workspace first; a non-member gets "No active membership in this company". **tested** (cross-company negatives)                                                                           |
| Driver scoping   | Drivers see and inspect only assigned units (`fleet.can_unit`). **tested**                                                                                                                                                                             |
| DVIR integrity   | Signed (typed name + consent), append-only (`immutable_record` trigger), idempotent re-submission, severity rules (≥2 out of service, ≥3 must be repaired), driver review of a certified repair before the next pre-trip. **tested**                   |
| Storage          | Photo must be uploaded by the same user to a fixed path before the report can cite it; drivers may upload only under `dvir/`. **tested**                                                                                                               |
| Concurrency      | `save_fleet` uses an optimistic revision and locks the workspace row for writes. **tested** (stale revision → no change)                                                                                                                               |

## Findings

| #   | Severity | Finding                                                                                                                                                                      | Status                                                                                                                          |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | **High** | **No licence check.** Any member can call any op, so module licensing enforced in an app would be cosmetic.                                                                  | **Fixed in proposed P002** (`fleet.licensed_api` gate on `public.hlg_fleet_rpc`, side doors revoked). Tested, mutation-checked. |
| S-2 | Medium   | **Two membership models.** `fleet.members` is independent of HL-BOS `identity.memberships`; removing someone from HL-BOS does not remove fleet access.                       | Open. Needs a design decision (unify or sync).                                                                                  |
| S-3 | Medium   | **Bootstrap by e-mail.** `claim_owner` makes the first verified account whose e-mail matches `bootstrap_owner_email` the owner. Safe only while e-mail changes are verified. | Open. Recommend binding the bootstrap to an invitation token.                                                                   |
| S-4 | Medium   | **Whole-document writes.** `save_fleet` replaces all units, work orders, fuel and _all_ driver profiles; the last writer wins (inside the revision check).                   | Open. Acceptable for small fleets; split before larger customers.                                                               |
| S-5 | Medium   | **Backdating.** `inspectedAt` is rejected only if in the future, so a report can claim any past time. `created_at` (server time) is also stored.                             | Open. Reports must show the server time beside the claimed time.                                                                |
| S-6 | Low      | **Stale stored status (F-3).** A manager's snapshot returns the stored `status`, not the live one.                                                                           | Mitigated in the app (status computed from records); a DB fix is not yet proposed.                                              |
| S-7 | Low      | **Whole-company snapshot.** No pagination; every read returns every record.                                                                                                  | Open. Fine at pilot scale; a performance limit later.                                                                           |
| S-8 | Low      | **Driver privacy.** A driver sees other drivers' reports on a shared unit (names, signatures).                                                                               | Open. Probably intended (the next driver must review defects); confirm.                                                         |
| S-9 | Info     | **Fixed checklist.** Items are hard-coded in SQL.                                                                                                                            | **Extended in P002**: per-equipment-type templates add required items (cannot remove base items). Tested.                       |

No finding requires an emergency change to production: the fleet tables are
empty (0 vehicles, 0 inspections on 2026-11-04).
