# Phase 1 · Deliverable 3 — Checkpoint 3 Reuse Analysis

**Date:** 2026-07-26 · **Checkpoint:** 3 (Shared Storage + Shared Communications)
**Rule:** completed **before** any migration was authored. Every new object below was checked against the existing spine; nothing duplicates a foundation.

---

## 1. Foundations reused (no duplication)

| Need             | Existing HL-BOS component reused                                    | How                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant identity  | `platform.tenants`                                                  | Every new table carries `tenant_id → platform.tenants(id)`. No new tenant model.                                                     |
| User identity    | `auth.users` / `identity`                                           | `uploaded_by`, `requested_by` reference `auth.users`; no second user store.                                                          |
| AuthZ            | `identity.has_permission()` / `is_member()` / `is_platform_admin()` | New `storage.*` and `comms.*` permissions added to the existing catalog; all RLS/RPCs use these helpers. No new authorization logic. |
| Audit            | `audit.emit()` trigger + `audit.log_security_event()`               | Attached to new tables; denials use the existing security-event path.                                                                |
| Events           | `events.emit()` + `events.dispatch_batch()`                         | New topics emitted through the existing outbox. **No new queue.**                                                                    |
| Human approval   | `workflows.request_approval/decide/is_approved`                     | Communications approval routes through the existing workflow engine. **No new approval system.**                                     |
| Provider pattern | `ai.providers` / `billing.providers` + `_shared/ai` adapters        | `comms.providers` mirrors this exactly; credentials are Vault refs (CHECK-enforced); adapters live in `_shared/comms`.               |
| Entitlements     | `entitlements.has_feature()` / `module_is_active()`                 | Available for verticals to gate storage/comms features; not re-implemented.                                                          |
| Secret redaction | `_shared/ai/redact.ts`                                              | Reused verbatim by the comms adapters — one redactor, not two.                                                                       |

## 2. New objects and why each is necessary

### Storage — schema `storage_meta`

**Schema-name decision:** Supabase **already owns a schema named `storage`** (buckets/objects). Naming ours `storage` would collide. `target-architecture.md` §1.2 already proposed **`storage_meta`**; we adopt it. Byte storage stays in Supabase Storage buckets; `storage_meta` is the tenant-aware **metadata + access-control** layer over them.

| Object                                                                                 | Why it can't reuse something else                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage_meta.files`                                                                   | No file-metadata table exists anywhere. `visibility.content_assets` stores content **text**, not files. This is the single shared file record every vertical references instead of making its own upload table. |
| RPCs `register_upload`/`confirm_upload`/`soft_delete_file`/`restore_file`/`can_access` | Enforce validation (MIME/size/extension/path), tenant-prefixed paths, soft-delete, and the signed-URL access boundary in one place. No existing RPC does this.                                                  |

**Buckets are NOT created in the migration** (that would depend on Supabase's `storage` schema, which the bare-Postgres pgTAP harness doesn't have, and remote bucket creation is prohibited this checkpoint). Bucket names + policies are documented for deploy-time creation.

### Communications — schema `comms`

**Schema-name decision:** module is `core.communications`; schema named **`comms`** to keep RLS/policy identifiers short (consistent with the abbreviated `ai` schema). Documented here as canonical.

| Object                                        | Why it can't reuse something else                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comms.providers`                             | No comms provider registry exists. Mirrors `ai.providers`/`billing.providers` (Vault refs), but for email/SMS channels.                                              |
| `comms.templates` / `comms.template_versions` | No template store exists. Versioned like `ai.prompts`/`ai.prompt_versions`.                                                                                          |
| `comms.sender_identities`                     | Per-tenant from-address/number — no existing table.                                                                                                                  |
| `comms.consent` / `comms.suppression`         | Consent/opt-out/STOP suppression have no home; legally required from day one.                                                                                        |
| `comms.messages`                              | The outbound message ledger (status, provider ref, retries, idempotency). Analogous to `ai.runs`/`billing.payments` but for messages; none of those model a message. |

## 3. Duplication test — explicitly cleared

- **Not** a second event bus — emits to `events.outbox`.
- **Not** a second workflow/approval engine — calls `workflows.request_approval`/`is_approved`.
- **Not** a second tenant/identity model — FKs to `platform.tenants`/`auth.users`.
- **Not** a second audit log — `audit.emit()` triggers + `audit.log_security_event()`.
- **Not** a second provider pattern — `comms.providers` mirrors `ai`/`billing`, reuses `_shared/ai/redact.ts`.
- **Anti-fabrication reused:** delivery status is recorded only by a platform/service path (`comms.record_delivery`), never by a tenant — same rule as `billing` invoices/payments and `visibility.reviews`.

## 4. Cross-vertical reusability (VisibilityAI, SalonAI, HomeHuddle, TransportationAI, HSCS, future)

Both modules key off `tenant_id` + `source_module`, so any vertical stores files and sends messages through the **same** records and RPCs — e.g. SalonAI appointment reminders, HomeHuddle notifications, VisibilityAI proposal delivery, HSCS fleet alerts — with no per-vertical tables. Templates/providers/consent are tenant-scoped configuration, not code.
