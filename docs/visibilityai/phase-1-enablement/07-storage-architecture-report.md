# Phase 1 · Deliverable 1 (CP3) — Shared Storage Architecture Report

**Date:** 2026-07-27 · **Checkpoint:** 3 · **Migration:** `hlbos_0018_storage_meta` (local only)

The tenant-aware metadata + access-control layer over Supabase Storage. Bytes live in Supabase Storage buckets; **`storage_meta` is the single shared file record** every vertical references instead of building its own upload table.

## 1. Schema & tables (`storage_meta`)

| Object  | Purpose                                                                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files` | The shared file record. `tenant_id`, `source_module`, `category`, `bucket`, `object_path`, `original_filename`, `mime_type`, `size_bytes`, `checksum_sha256`, `visibility`, `retention`, `status`, `related_type`/`related_id`, `uploaded_by`, soft-delete columns.                       |
| enums   | `file_category` (evidence, screenshot, report, proposal, contract, logo, brand_asset, customer_upload, generated_document, ai_media, export, other), `file_visibility` (private/tenant/public), `retention_class` (transient/standard/legal_hold), `file_status` (pending/stored/deleted) |

## 2. RPCs (all `SECURITY DEFINER`, `search_path=''`, permission-gated)

- `register_upload(...)` → creates a **pending** metadata row a signed upload URL targets; validates size/MIME/extension and forces the tenant path prefix.
- `confirm_upload(file, checksum, size)` → marks **stored**, emits `file.uploaded`.
- `soft_delete_file(file)` → status **deleted** + `file.deleted`; `restore_file(file)` → back to stored.
- `assert_safe(filename, mime, size)` → reusable validation (raises on unsafe).
- `can_access(file)` → the boolean the edge/app checks **before minting a signed download URL** (live file + read permission in the caller's own tenant).

## 3. Required security controls — how each is met

| Control                                | Mechanism                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation                       | `tenant_id` FK + RLS `has_permission(tenant_id, …)`; `can_access` scopes signed URLs                                                                                    |
| Cross-tenant object references         | **Structural**: `files_path_is_tenant_scoped` CHECK forces `object_path LIKE '<tenant_id>/%'`; `register_upload` normalizes + prepends the prefix (verified in test 20) |
| Private by default                     | `visibility='private'`, bucket `tenant-private`; no public bucket created                                                                                               |
| Explicit read/write perms              | `storage.file.read` / `storage.file.create` / `storage.file.delete` (tenant), `storage.file.manage` (platform)                                                          |
| MIME / extension mismatch, executables | `assert_safe` denylist (exe/sh/bat/dll/…) + executable-MIME reject                                                                                                      |
| Max file size                          | 50 MiB CHECK + `assert_safe` (matches `config.toml [storage]`)                                                                                                          |
| Path normalization                     | strips `..` + leading slashes, forces tenant prefix                                                                                                                     |
| No tenant write path                   | no INSERT/UPDATE/DELETE policy; writes only via definer RPCs                                                                                                            |
| Deleted-file visibility                | ordinary readers don't see deletions; only `storage.file.delete` holders can list them (to restore)                                                                     |
| Audit                                  | `audit.emit()` trigger on `files` (upload/delete/restore all captured)                                                                                                  |
| Signed-URL boundary                    | `can_access` re-checks tenant + permission + not-deleted                                                                                                                |

## 4. Buckets (created at DEPLOY, not in the migration)

The migration deliberately does **not** touch Supabase's `storage` schema (so it applies on bare Postgres and honors "no remote bucket creation"). At deploy, create **one private bucket `tenant-private`** (public = false). Object keys are always `<tenant_id>/<module>/<...>`. Storage RLS on `storage.objects` restricts access to the owning tenant's path; the app issues time-limited signed URLs (default TTL **300s**) only after `can_access` returns true. No public bucket is created unless a documented use case requires it.

## 5. Events

`file.uploaded` (on confirm), `file.deleted` (on soft delete) — emitted to the existing `events.outbox`. Consumers subscribe via `events.subscriptions`; no new bus.

## 6. Reuse across verticals

Any product stores files through the same record + RPCs, tagged by `source_module` and `related_type`/`related_id`: VisibilityAI screenshots/reports/proposals, SalonAI customer uploads, HomeHuddle documents, HSCS evidence — no per-vertical upload tables.

## 7. Tests

`supabase/tests/20_storage.sql` — **20 pgTAP assertions**; `supabase/functions/tests/comms_storage.test.ts` — storage path/safety pre-flight units. All passing (see Test Coverage Report).
