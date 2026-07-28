# Phase 2 Migration Plan — Greenfield HL-BOS Core

> **⚠️ CORRECTED 2026-07-26 — see [ADR-0001](../architecture/decisions/0001-canonical-hl-bos-supabase-project.md).** Every reference to the project ref `ywrzgursvdowzyhipsmt` in this doc is **stale**. The canonical HL-BOS project is **`mvvtngiopdrgiedjmhfb` (HL-BOS Core, us-west-2)**, where the 17 Phase-2/V0 migrations are now live. `ywrzgursvdowzyhipsmt` is empty and not canonical. This doc's status line below ("no migration applied") reflects its 2026-07-15 authoring and is superseded by the Phase 0 audit. Historical content preserved for provenance.

**Status:** PROPOSED. Awaiting owner approval. **No migration has been authored or applied.**
**Supersedes:** the strangler-fig plan in `docs/architecture/target-architecture.md` §3, which assumed Decision 1 = Option B.
**Owner decision:** 2026-07-15 — Option 2, new greenfield Supabase project. Final.

---

## 1. What the decision changed

My earlier plan proposed adding HL-BOS schemas alongside the existing ones and migrating verticals across in place. **That plan is void.** The owner selected a clean project, and the reasoning was correct on a point I had wrong: `auth.users = 1` does not establish that the brownfield system is unused. The KPI tables are anonymously readable, so their consumers never authenticate and never appear in that count. I had documented that exposure myself (audit SEC-1) and still under-weighted it.

Consequences, and they are simplifications:

| Earlier plan (Option B)                             | Now (Option 2)                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Coexist with `hlvs` / `hscs_glp` in one database    | **Separate database. No coexistence.**                                          |
| `platform.tenant_legacy_map` mapping legacy org IDs | **Deleted from the design.** No cross-database FK, no mapping table in Core v1. |
| Compatibility views over legacy schemas             | **None.**                                                                       |
| Time-boxed dual tenancy models                      | **One tenancy model, from migration 0002.**                                     |
| Remediation migrations mixed into the plan          | **Separate workstream, separate project, separate review.**                     |

The strangler-fig complexity existed to avoid breaking live systems in a shared database. With a separate database there is nothing to strangle, so it goes.

## 2. Scope boundary — binding

**In scope:** the new greenfield project only.

**Explicitly excluded from every Core v1 migration:**

- The brownfield project `bkfsjhhclbqrhaolvhmz` and everything in it — `hlvs` (59 tables), `hscs_glp` (74), `public` (19), `dpi` (4), and all 9 Edge Functions.
- All security remediation for the brownfield project (SEC-1…SEC-7). Separate workstream, separate review, **never** applied to the new project.
- Any automated copy of existing vertical tables.
- Any direct cross-database dependency — no `dblink`, no `postgres_fdw`, no foreign tables pointing at the legacy database. Core v1 does not read the legacy database at runtime, at all.

Legacy data movement happens later, per-vertical, behind a formal extraction report and migration plan. Not in Core v1.

## 3. What we take from the brownfield project

Exactly one thing: **the `hscs_glp` authorization pattern**, generalized. Not the tables — the pattern.

It earned this. I read every helper body during the audit specifically to test the brief's warning about functions that accept an arbitrary tenant ID as proof of access. They do not:

```sql
-- hscs_glp.is_member(p_org) -- verified 2026-07-15
select exists (
  select 1 from hscs_glp.organization_users
  where user_id = auth.uid()      -- <- identity comes from the JWT, never a parameter
    and org_id  = p_org           -- <- p_org is a FILTER, not proof
    and status  = 'active'
);
```

Every one of these pins `search_path`, and RLS is on 156/156 tables in that project. That model is correct. Core v1 generalizes it into `identity`:

| Brownfield (`hscs_glp`)           | Core v1 (`identity`)                            | Change                                          |
| --------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `is_member(p_org)`                | `identity.is_member(p_tenant)`                  | Same shape                                      |
| `has_role(p_org, VARIADIC roles)` | `identity.has_permission(p_tenant, permission)` | **Role names → permission model**, per brief §A |
| `my_org_ids()`                    | `identity.my_tenant_ids()`                      | Same shape                                      |
| `is_internal(p_org)`              | _(dropped)_                                     | Domain-specific to GLP carriers                 |
| `can_read` / `can_write(p_org)`   | _(dropped)_                                     | Replaced by `has_permission`                    |

The one real upgrade: `has_role(p_org, 'owner_ceo', 'contract_admin', …)` hard-codes eight role names into the function body. Adding a role means editing a function. `has_permission(tenant, 'appointments.write')` resolves through `identity.role_permissions`, so a new role is a row, not a deploy. That is the extensibility the brief asks for.

**Improvement over the brownfield pattern:** those helpers live in an API-exposed schema, so PostgREST publishes them as RPC (audit SEC-3). Core v1 keeps `identity` out of `api.schemas` (already set in `supabase/config.toml`), so the helpers are callable from RLS policies inside the database and unreachable over HTTP.

## 4. Migration set

Naming is enforced by `scripts/check-migrations.sh`:
`<timestamp>_hlbos_<NNNN>_<description>.sql`

The `hlbos_` prefix is mandatory. The brownfield project has two independent counters both using `0009`–`0017`; bare ordinals collide. The timestamp orders, the ordinal is for humans, the prefix guarantees no collision.

| #      | Migration                    | Contents                                                                                                                                                         |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001` | `extensions_and_schemas`     | `pgcrypto`, `uuid-ossp`, `supabase_vault`, **`pgtap`** (RLS tests), `pg_cron`, `pg_net`. Creates the 11 schemas. `REVOKE ALL ON SCHEMA … FROM anon` immediately. |
| `0002` | `identity_and_tenancy`       | `platform.tenants`, `identity.profiles`, `identity.memberships`, invitations, status/lifecycle. **RLS + policies in this migration.**                            |
| `0003` | `roles_and_permissions`      | `identity.roles`, `permissions`, `role_permissions`; the helper functions; the 8 platform roles seeded.                                                          |
| `0004` | `module_registry`            | Modules, dependencies, tenant activation, `platform.module_active()`.                                                                                            |
| `0005` | `features_and_entitlements`  | Products, plans, plan versions, features, limits, subscriptions, overrides, usage counters, `entitlements.has_feature()` / `within_limit()`.                     |
| `0006` | `billing`                    | Provider-neutral billing domain, `billing.webhook_events` with a unique provider-event-id for idempotency.                                                       |
| `0007` | `ai_gateway`                 | Providers, models, prompt templates + versions, requests, responses, usage, budgets. Credentials as **Vault key references**, never literals.                    |
| `0008` | `communications`             | Channels, templates, consent, preferences, suppression, messages, deliveries, sender identities.                                                                 |
| `0009` | `workflow_engine`            | Definitions, versions, triggers, steps, runs, step_runs, approval gates, idempotency keys.                                                                       |
| `0010` | `reputation_and_recovery`    | Feedback, review requests, recovery cases + the ethics constraints in §6.                                                                                        |
| `0011` | `audit_and_observability`    | Append-only audit events, security events, job runs, error log.                                                                                                  |
| `0012` | `storage_metadata`           | File metadata, access classification, retention, scan status.                                                                                                    |
| `0013` | `salon_reference_vertical`   | Minimal customers / staff / appointments. Consumes shared packages only.                                                                                         |
| `0014` | `rls_and_security_hardening` | Cross-cutting sweep + `verify_rls_coverage()` assertion.                                                                                                         |
| `0015` | `seed_and_reference_data`    | Modules, roles, permissions, plans, mock providers. Versioned, not `seed.sql`.                                                                                   |

### Deviation from the brief, requiring approval

**RLS policies ship in the same migration as their tables** (`0002`–`0013`), not deferred to `0014`. The brief's example numbering implies `0014_rls_and_security_hardening` introduces RLS. Creating tables in `0002` and protecting them in `0014` leaves twelve migrations during which tenant tables exist unprotected — and if the run stops midway, that is the state you keep. `0014` becomes a **verification sweep** that fails the migration if any table in a core schema lacks RLS or has zero policies.

### Standards

Idempotent (`IF NOT EXISTS`), single transaction each, mandatory `-- rollback:` block, no secrets, `uuid` PKs, `timestamptz`, `created_at`/`updated_at` + trigger, `created_by`/`updated_by` where useful. **No Core v1 migration drops or alters a table containing data**, so `-- approved-destructive:` should never appear in this set.

## 5. Fixing M-2 by construction

The brownfield project's defining failure is that 52 migrations were applied from outside version control, making production authoritative over the repo. The new project must never reach that state:

1. Every migration is authored as a file in this repo and merged via PR before it touches any database.
2. Applied to a **preview/branch database first**, never straight to production.
3. Production apply requires a protected workflow with manual approval. Never on merge to `main`.
4. `supabase migration list` is reconciled against `supabase/migrations/` in CI. Drift fails the build.
5. **No MCP `apply_migration`, no dashboard SQL editor, no ad-hoc SQL against the new project. Ever.** That is precisely how the brownfield project got here — including six corrective `brand_*` migrations inside a ten-minute window, the signature of fixing production live.

I have DDL capability against the brownfield project through MCP. I will not use it on the new project, and I have not used it on the old one.

## 6. Reputation ethics, enforced in schema

Prose in a policy document is not enforcement. These are structural:

- **`reputation.review_requests` has no `sentiment`, `rating` or `predicted_satisfaction` column.** Review-gating is made _impossible to express_, not merely forbidden — the table cannot represent the discriminator you would need. Stronger than a check constraint, which someone can drop.
- Public responses require `approved_by NOT NULL` + `approved_at` before `posted_at` may be set. Enforced by trigger, not application code.
- Feedback is append-only. **No DELETE policy exists for any role**, so negative feedback cannot be suppressed.
- Opt-out is checked inside the `communications` send path, not in the caller.

## 7. Test plan

pgTAP (`0001` installs it) plus integration tests. Required before Phase 2 is called complete:

Tenant A cannot read/modify Tenant B · staff cannot perform owner actions · viewer cannot write · platform admin only where explicitly granted · **anon blocked on every core object** · `has_permission(other_tenant_id, …)` returns false with a valid session (the arbitrary-tenant-ID test) · SECURITY DEFINER helpers do not bypass tenancy · storage objects tenant-isolated · `verify_rls_coverage()` passes.

Per the brief and the CONTRIBUTING standard: no test is reported as passing unless it was executed and the real output is shown.

## 8. Prerequisites — all currently unmet

Phase 2 cannot begin until:

1. ~~The Pro organization `Herman Legacy Software Ventures` exists and is reachable.~~ ✅ **Resolved 2026-07-15.** `ihtsbcxtvkbfkkpmforp`, plan `pro`.
2. ~~The new project is created and confirmed greenfield.~~ ✅ **Resolved 2026-07-15.** `ywrzgursvdowzyhipsmt` — 0 user tables, 0 functions, 0 migrations, 0 Edge Functions, 0 auth users, 0 advisories. Evidence in `environments.md` §2.
3. ~~Its project ref is recorded.~~ ✅ Recorded in `environments.md` §1. Ref only; no keys.
4. The Phase 1 PR is merged.
5. This plan is approved.

## 9. Blockers

**RESOLVED — the Pro organization and greenfield project are confirmed.** The connection was re-scoped on 2026-07-15 and now reaches `Herman Legacy Software Ventures` (`ihtsbcxtvkbfkkpmforp`, plan `pro`) containing exactly one empty project, `ywrzgursvdowzyhipsmt`. Full evidence in `environments.md`.

Remaining, none of which block authoring this plan:

1. **Phase 1 PR not merged.** The branch is not pushed; the sandbox has no GitHub credentials.
2. **Project name is the Supabase default** (`keith@venuewise.net's Project`) and collides in spirit with the brownfield project's name. See `environments.md` §4. Dashboard action; cannot be done from here.
3. **This plan is not yet approved.**
4. ⚠️ **The legacy project is now unreachable from this connection**, so the SEC-1/SEC-2 remediation workstream cannot be executed here. SEC-1 remains live: 2,481 rows anon-writable. See `environments.md` §3.

## 10. Naming collision — needs a decision

The brownfield project is **already named `Herman Legacy Business Platform`**. The decision specifies the same name for the new project. Two projects with identical names — one legacy-to-be-secured, one canonical production — is an operational hazard: every future instruction that says "the Herman Legacy Business Platform project" becomes ambiguous, including instructions to apply a migration.

Suggested: name the new project `HL-BOS Core` (or `Herman Legacy Business Platform (Core)`), and rename the brownfield project to `HSCS Legacy Platform`. Renaming a Supabase project is a label change — it does not affect the project ref, connection strings or data. **Owner's call.**
