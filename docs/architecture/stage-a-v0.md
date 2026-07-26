# HL-BOS Stage A — V0 (VisibilityAI foundations)

**Status:** implemented on branch `claude/herman-consolidation-readiness-3cbfzt`, validated in an
isolated embedded PostgreSQL 17.6. **Not applied to any Supabase project. Not merged. Not deployed.**

V0 builds the minimal, reusable shared primitives VisibilityAI needs as its first consumer. Built once,
correctly, on the live reconciled spine (`platform` / `identity` / `audit`); not duplicated inside VisibilityAI.

## Modules delivered

| Schema         | Purpose                                                | Key surface                                                                                |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `events`       | Transactional outbox event bus                         | `events.emit()`, `events.dispatch_batch()`                                                 |
| `entitlements` | Feature grants + per-tenant module activation          | `has_feature()`, `module_is_active()`, `activate_module()`                                 |
| `integrations` | Connector registry; Vault-referenced credentials       | `upsert_connection()`, `begin_sync()`, `finish_sync()`                                     |
| `ai`           | Model gateway: prompts, run ledger, budgets            | `begin_run()`, `finish_run()`, `within_budget()`                                           |
| `workflows`    | Human-approval gate                                    | `request_approval()`, `decide()`, `is_approved()`                                          |
| `visibility`   | VisibilityAI module boundary (sites, content, reviews) | `draft_content()`, `submit_content_for_approval()`, `publish_content()`, `ingest_review()` |

## Conventions (inherited from the spine)

Every module: a top-level schema not exposed via PostgREST; `REVOKE ALL` then `GRANT USAGE` to
`authenticated`; RLS `ENABLE`+`FORCE`; policies test **permissions** via `identity.has_permission(tenant, 'x.y.z')`;
writes flow through `SECURITY DEFINER` functions with `SET search_path = ''`; state changes carry the
`audit.emit()` trigger; security-relevant actions call `audit.log_security_event()`; credentials are Vault
references (`^vault:...`), never secret values in tables.

## Guarantees proven by tests (46 V0 assertions, 132 total, 0 failing)

- **Tenant isolation** on every tenant-owned table.
- **Permission denial**: non-members and wrong-permission actors are denied (negative tests).
- **Human gate**: `visibility.publish_content()` refuses until `workflows.is_approved()` — content cannot
  publish without a person (Principle 4).
- **No fabricated reviews**: `visibility.reviews` has no tenant-writable INSERT path; ingest is connector-only
  (Principle 5). `sentiment` is descriptive metadata, never a filter.
- **Budget enforcement**: `ai.begin_run()` refuses when spend ≥ limit; `finish_run()` accrues real cost.
- **Idempotency**: `events.dispatch_batch()` re-dispatch is a no-op; review ingest is upsert.
- **Audit + event coverage** on activation, AI, integration, approval and publish actions.
- **Rollback**: `DROP SCHEMA … CASCADE` + seeded-permission cleanup returns identity to its 17-permission
  baseline with the spine intact.

## Extension prerequisites (verified available on HL-BOS Core, not yet installed)

`pg_cron` 1.6.4 · `pg_net` 0.20.3 · `vector` 0.8.2 — all **available**. V0 migrations deliberately require
**none** of them at apply time, so they apply and test on bare PostgreSQL.

## Deploy-time steps (NOT performed in V0)

1. `create extension` for `pg_cron`, `pg_net` (and `vector` when V1 embeddings land).
2. Schedule `events.dispatch_batch()` via `pg_cron` (≈ every 10s); deploy `events-dispatcher`.
3. Load provider secrets into **Vault** (`anthropic_api_key`, Google credentials); set the matching
   `ai.providers` / `integrations.connections` rows active. No secret is ever stored in a table.
4. Deploy the `ai-gateway` edge function.

## Scaffolding (structural, not runtime-validated in V0)

`supabase/functions/ai-gateway`, `supabase/functions/events-dispatcher`, and
`supabase/functions/_shared/ai/*` (provider interface + `MockProvider` + inert `AnthropicProvider`). The
mock adapter needs no credentials and is what tests use; the Anthropic adapter is inert until a key is
granted. The DB-side lifecycle these wrap is fully validated by pgTAP.

## What V0 is NOT

Not V1. No SEO crawler, GBP/Search Console connectors, content models beyond the boundary, lead capture,
campaigns, analytics, or chatbot. Those are V1/V2, gated by separate approval.
