# Phase 1 · Deliverables 6 & 7 (CP3) — Local Operations Runbook + Test Coverage

**Date:** 2026-07-27 · **Checkpoint:** 3 · Local dev stack only.

## A. Local operations runbook

**Run the database tests** (embedded PostgreSQL 17.6 + real pgTAP 1.3.5, no Docker) — see `scripts/local-test/README.md` for the one-time pgTAP bootstrap, then:

```
node scripts/local-test/apply.cjs      # applies shim + migrations 0001..0019 from scratch
node scripts/local-test/runtests.cjs   # runs supabase/tests/*.sql
```

CI runs the same SQL via `supabase test db` on the real local Supabase stack.

**Run the edge-function unit tests:**

```
deno test --no-check supabase/functions/tests/
```

(Where Deno egress is blocked, the same files run under Node via `tsx` with a `Deno.test` shim — Node 22 has native `fetch`/`Response`/`Headers`.)

**Common operations**

- Add a template: insert `comms.templates` + `comms.template_versions` (declare `{{variables}}`), via the protected migration path.
- Add/rotate a provider credential: store in Vault under the documented name; set the provider row `is_active` via migration. No code change.
- Grant consent / suppress a contact: `comms.set_consent(...)` / `comms.suppress(...)` (needs `comms.consent.manage`).
- Disable communications quickly: `update comms.providers set is_active=false;` (requests then have no active provider to queue against).
- Disable a file class: soft-delete via `storage_meta.soft_delete_file`; restore with `restore_file`.
- Issue a download URL: check `storage_meta.can_access(file)` first, then mint a signed URL (TTL 300s) at the edge.

## B. Test coverage report

**Database (pgTAP) — `node runtests.cjs`: 241 passed, 0 failed.**

| Suite                            | File                      | Assertions |
| -------------------------------- | ------------------------- | ---------: |
| Spine + V0 (baseline, unchanged) | `01`–`18`                 |        166 |
| AI runtime smoke (CP2)           | `19_ai_runtime_smoke.sql` |         24 |
| Shared storage (CP3)             | `20_storage.sql`          |         20 |
| Shared communications (CP3)      | `21_communications.sql`   |         31 |
| **Total**                        |                           |    **241** |

**Edge unit tests (Deno / Node-tsx): 14 passed, 0 failed.**

| File                          | Tests |
| ----------------------------- | ----: |
| `ai_runtime.test.ts` (CP2)    |     8 |
| `comms_storage.test.ts` (CP3) |     6 |

**Storage coverage (test 20):** authorized upload, source-module attribution, tenant-scoped path, unauthorized denial, non-member isolation, MIME/extension/size validation, cross-tenant path prevention (RPC + CHECK), confirm→`file.uploaded`, signed-URL access boundary, cross-tenant read denial, soft delete→`file.deleted`, restore, audit.

**Communications coverage (test 21):** authorized/denied request, tenant isolation, template-version tracking, variable rendering, missing-variable failure, idempotency, consent enforcement (marketing) + transactional bypass, opt-out suppression, human-approval routing (request→decide→approve), provider-only delivery (anti-fabrication), retry/attempts, delivery-status updates, events, audit, vault-ref-at-rest.

**Repository gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (vitest 45), and pinned Prettier `--check .` all pass. New Deno files are excluded from ESLint/tsc (Deno runtime) but Prettier-clean.

## C. "Tested our own guard" note (honesty)

While writing test 20, storage rows and outbox events appeared to "vanish" during debugging. Root cause was **not** a bug: the debug queries ran under the `authenticated` role, and RLS correctly hid (a) `events.outbox` rows from a non-platform-admin and (b) soft-deleted files from ordinary tenant readers. The guard was working. This produced one genuine improvement — deleted files are now visible to holders of `storage.file.delete` (you cannot restore what you cannot list) — and confirmed the platform's honesty rule: test the guards, name the mistake.
