# HL-BTI v2 — Database Design (PROPOSED — NOT APPLIED)

## In plain language

The HL-BTI v2 engine (`@hl-bos/transformation-intelligence`) is a **pure, in-memory
composition layer**. It takes a scored assessment and returns executive
recommendations, business-impact estimates, approval requirements, software
opportunities and a measurement plan — all as a plain object, computed with no
database, no network and no side effects. **It works today, exactly as tested,
with zero persistence.** This document proposes an _optional, future_ way to save
the engine's outputs so they survive across sessions and feed the CEO dashboard.
Everything here is a **design on paper only**.

> ## HARD STOP — this phase does not touch the database
>
> - **Nothing in this document is applied.** No SQL below has been run anywhere.
> - **Nothing here is written to `supabase/migrations/`.** These are illustrative
>   sketches living under `docs/`, and they stay under `docs/` until a real,
>   CEO-approved migration is authored separately.
> - **Do NOT deploy. Do NOT migrate production. Do NOT modify customer apps.**
> - **No migration is applied without explicit CEO approval** — not to production,
>   not to staging, not anywhere. This is the platform's standing constraint, and
>   it governs every line of SQL you see here.
> - The engine needs **none** of this to function. Persistence is a convenience for
>   _saving_ results, never a prerequisite for _producing_ them.

Source of truth for the engine:
[`packages/transformation-intelligence/src/pipeline.ts`](../../../packages/transformation-intelligence/src/pipeline.ts)

---

## Why the engine needs no database

`runTransformationIntelligence(assessment, configOverrides?)` returns a
`TransformationIntelligenceResult` synchronously and deterministically. Given the
same input it returns byte-identical output (proven by the pipeline test's
deep-equality assertion). There is no read from, or write to, any store inside the
package. The Executive Portal consumes this result **directly, in-process, over a
clearly-labelled SAMPLE assessment** (`sample: true`). No table is required for any
of that to happen.

Persistence only becomes useful when we want to:

1. **Save** a produced run so it reopens identically on another device;
2. **Feed** saved transformation scores into the existing cross-business
   `bti.ceo_dashboard()`; and
3. **Track** which approvals a real (non-sample) run raised.

Those are future capabilities. Until the CEO approves them, the engine simply
runs and returns.

---

## Reuse first — what we do NOT rebuild

The `bti` schema (migration 0026) and its public API (migration 0027) already
exist. The v2 persistence design is a **small additive extension** that reuses
everything already there and duplicates nothing:

| Already exists — reuse as-is                                                                                       | What it gives v2                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bti.intelligence_domains`, `bti.domain_dimensions` (config, world-readable to `authenticated`)                    | The canonical 6 domains / 43 dimensions. v2 recommendations reference these by key; they are **not** re-created.                                                                          |
| `bti.industry_packs` (config)                                                                                      | Industry emphasis. v2 stores only the pack _key_ it ran under.                                                                                                                            |
| `bti.businesses`, `bti.engagements`, `bti.assessments`, `bti.dimension_ratings`, `bti.executive_scores`            | The portfolio, the lifecycle, the raw ratings and the sealed 7-score scorecard. v2 runs _link back_ to a `business_id`; they never restate ratings.                                       |
| `bti.analysis_snapshots` (migration 0027)                                                                          | The immutable full-analysis payload pattern — v2's run table follows the same "store the produced artifact" idea.                                                                         |
| `discovery.recommendation_rules` (rules-as-data: `conditions`/`output` jsonb + `rule_version` + `confidence`)      | The house pattern for rules-as-data. If v2 recommendations ever need externally-editable rules, they extend this table with rows — a **new rule is a row, not code and not a new table**. |
| `discovery.service_catalog`, `discovery.module_catalog`, `discovery.roadmap_phases`                                | The Software Factory catalog the engine's `factory.ts` already reads via `@hl-bos/catalog`. v2 stores only the _matched product key_, never a copy of the catalog.                        |
| `identity.has_permission`, `events.emit`, `audit.emit`, `platform.set_updated_at`, `workflows.human_approval_gate` | Authorization, events, audit, timestamps and the human approval gate. All reused.                                                                                                         |

The only genuinely new thing is a handful of tables to hold **v2 run outputs**.

---

## House DB patterns this design follows

Every proposed table obeys the same rules the existing migrations enforce:

1. **RLS `ENABLE` + `FORCE` on every table.** No exceptions.
2. **Config/catalog tables are world-readable to `authenticated`** (`using (true)`);
   **tenant data is gated by `identity.has_permission(tenant_id, '<perm>')`**.
3. **No direct tenant write path.** Tenant tables get a `SELECT` policy only. All
   writes flow through **`SECURITY DEFINER` RPCs** that re-check the permission
   _before_ touching a row, exactly like every 0026/0027 function.
4. **New vocabulary is a new `enum` type or a catalog row — never `ALTER TYPE`**
   inside a migration.
5. **`events.emit` + `audit.emit` triggers** on the tenant tables.
6. The **browser-reachable surface is a thin set of `public.*` SECURITY DEFINER
   RPC wrappers** (see `08-api-design.md`), mirroring the existing `public.bti_*`
   functions — the tables below are never exposed via PostgREST directly.

---

## Proposed additive tables (illustrative only)

> **PROPOSED — requires CEO approval; not applied; not in `supabase/migrations/`.**
> The SQL below is illustrative shape, not a migration. It has not been run.

### New enum vocabularies (created fresh; never `ALTER TYPE`)

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
do $$ begin create type bti.v2_priority as enum ('critical','high','medium','low');
  exception when duplicate_object then null; end $$;
do $$ begin create type bti.v2_build_effort as enum ('low','medium','high','new_build');
  exception when duplicate_object then null; end $$;
do $$ begin create type bti.v2_approval_type as enum
  ('ceo_commercial_terms','ceo_deploy','ceo_migration','ceo_spend','ceo_data_access');
  exception when duplicate_object then null; end $$;
do $$ begin create type bti.gov_verdict as enum
  ('pursue','pursue_with_partner','decline','insufficient_data');
  exception when duplicate_object then null; end $$;
```

These mirror the union types the engine already defines in TypeScript
(`ApprovalType`, `BuildEffort`, `Priority`, `GovVerdict`) so the store cannot
drift from the code.

### `bti.transformation_runs` — one row per engine run

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
create table if not exists bti.transformation_runs (
  id                   uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  business_id          uuid not null references bti.businesses(id) on delete cascade,
  engine_version       text not null,          -- result.meta.engineVersion  (e.g. bti-transformation-0.1.0)
  config_version       text not null,          -- result.meta.configVersion
  industry_pack        extensions.citext references bti.industry_packs(key) on delete set null,
  transformation_score integer,                -- result.analysis.transformation; null when un-scorable (honest)
  sample               boolean not null default true,   -- TRUE for the labelled SAMPLE; never fabricate a real run
  dimensions_rated     integer not null default 0,
  findings             integer not null default 0,
  recommendation_count integer not null default 0,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint transformation_runs_score_range
    check (transformation_score is null or transformation_score between 0 and 100)
);
create index if not exists transformation_runs_business_idx
  on bti.transformation_runs (business_id, created_at desc);
```

`sample` defaults to `true` and carries the engine's own `result.meta.sample`
flag straight through. **A run is never marked non-sample unless it was produced
from real tenant assessment data.** This is Principle 10 at the storage layer: the
dashboard must be able to tell a demonstration from a customer result.

### `bti.recommendations_v2` — the enriched recommendations of a run

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
create table if not exists bti.recommendations_v2 (
  id                     bigint generated always as identity primary key,
  run_id                 uuid not null references bti.transformation_runs(id) on delete cascade,
  tenant_id              uuid not null references platform.tenants(id) on delete cascade,
  domain                 extensions.citext not null,   -- references the bti.intelligence_domains vocabulary
  dimension              extensions.citext not null,   -- references bti.domain_dimensions
  area                   extensions.citext,            -- one of the 15 framework areas, or null
  priority               bti.v2_priority not null,
  problem                text not null,                -- Q1 what happened
  root_cause             text not null,                -- Q2 why
  solution               text not null,                -- Q3 what to do
  revenue_impact_monthly numeric,                      -- Q4 estimate; NULL when inputs missing (evidence-gated)
  roi_band               text,                         -- 'high'|'medium'|'low' or null
  matched_product_key    extensions.citext,            -- factory match, or null for a net-new build
  reuse_pct              numeric,                       -- foundation readiness %, or null
  build_effort           bti.v2_build_effort not null,
  created_at             timestamptz not null default now(),
  constraint recommendations_v2_reuse_range
    check (reuse_pct is null or (reuse_pct >= 0 and reuse_pct <= 100))
);
create index if not exists recommendations_v2_run_idx on bti.recommendations_v2 (run_id);
```

`revenue_impact_monthly`, `roi_band`, `matched_product_key` and `reuse_pct` are
**nullable on purpose**. The engine returns `null` for any of these when the
required input was not supplied; the store preserves that null rather than
back-filling a guess. **Payback is deliberately absent** — the engine never
asserts a payback period (pricing is a pending CEO decision), so there is no
column for it to lie in.

### `bti.approvals` — the deterministic approvals a run raised

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
create table if not exists bti.approvals (
  id            bigint generated always as identity primary key,
  run_id        uuid not null references bti.transformation_runs(id) on delete cascade,
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  approval_type bti.v2_approval_type not null,
  required      boolean not null default true,
  reason        text not null,
  gate          text not null default 'workflows.human_approval_gate',
  created_at    timestamptz not null default now(),
  constraint approvals_unique_per_run unique (run_id, approval_type)
);
create index if not exists approvals_run_idx on bti.approvals (run_id);
```

This is a record of _what the engine said humans must approve_ — it is **not** an
approval mechanism. The actual gate is the reused `workflows` human-approval-gate.
**AI approves nothing.** The engine advises; a human clears the gate.

### `bti.gov_opportunities` + `bti.gov_assessments` — Government Contracts intelligence

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
create table if not exists bti.gov_opportunities (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id             uuid not null references platform.tenants(id) on delete cascade,
  title                 text not null,
  agency                text,
  naics                 text,
  contract_value        numeric,                 -- NULL => profit cannot be estimated (honest)
  required_capabilities jsonb not null default '[]'::jsonb,
  due_in_days           integer,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now()
);

create table if not exists bti.gov_assessments (
  id                uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id         uuid not null references platform.tenants(id) on delete cascade,
  opportunity_id    uuid not null references bti.gov_opportunities(id) on delete cascade,
  engine_version    text not null,
  config_version    text not null,
  win_score         integer,                  -- capability-match %, null if no required caps supplied
  win_band          text,                     -- 'high'|'medium'|'low' or null
  have_count        integer not null default 0,
  gap_count         integer not null default 0,
  estimated_profit  numeric,                  -- NULL until a contract value is supplied
  margin_fraction   numeric,
  verdict           bti.gov_verdict not null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint gov_assessments_win_range
    check (win_score is null or win_score between 0 and 100)
);
create index if not exists gov_assessments_opp_idx on bti.gov_assessments (opportunity_id, created_at desc);
```

`win_score`/`win_band` are null when no required capabilities were supplied;
`estimated_profit` is null until a contract value is supplied. A bid/no-bid
carries a **required CEO spend approval** — again recorded, never enacted, by the
engine.

---

## RLS + FORCE policy sketch (illustrative only)

> **PROPOSED — requires CEO approval; not applied; not in `supabase/migrations/`.**

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
alter table bti.transformation_runs enable row level security; alter table bti.transformation_runs force row level security;
alter table bti.recommendations_v2  enable row level security; alter table bti.recommendations_v2  force row level security;
alter table bti.approvals           enable row level security; alter table bti.approvals           force row level security;
alter table bti.gov_opportunities   enable row level security; alter table bti.gov_opportunities   force row level security;
alter table bti.gov_assessments     enable row level security; alter table bti.gov_assessments     force row level security;

-- tenant data: READ by permission; NO direct tenant write path (definer RPCs only)
create policy transformation_runs_select on bti.transformation_runs for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.transformation.read'));
create policy recommendations_v2_select on bti.recommendations_v2 for select to authenticated
  using (exists (select 1 from bti.transformation_runs r
                 where r.id = run_id and identity.has_permission(r.tenant_id, 'bti.transformation.read')));
create policy approvals_select on bti.approvals for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.transformation.read'));
create policy gov_opportunities_select on bti.gov_opportunities for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.government.read'));
create policy gov_assessments_select on bti.gov_assessments for select to authenticated
  using (identity.has_permission(tenant_id, 'bti.government.read'));

-- house triggers (audit + updated_at where applicable)
create trigger transformation_runs_audit after insert or update or delete
  on bti.transformation_runs for each row execute function audit.emit();
create trigger gov_assessments_audit after insert or update or delete
  on bti.gov_assessments for each row execute function audit.emit();

grant select on bti.transformation_runs, bti.recommendations_v2, bti.approvals,
                bti.gov_opportunities, bti.gov_assessments to authenticated;
```

There is **no `INSERT`/`UPDATE`/`DELETE` policy** on any tenant table above — by
design. Writes exist only through the SECURITY DEFINER RPCs proposed in
`08-api-design.md`, each of which re-checks `identity.has_permission(...)` before
writing and is `REVOKE`d from `anon`.

---

## Proposed permission keys (illustrative only)

> **PROPOSED — requires CEO approval; not applied; not in `supabase/migrations/`.**

Following the 0026 `bti.<area>.<verb>` convention:

| Key                         | Scope  | Grants                                             |
| --------------------------- | ------ | -------------------------------------------------- |
| `bti.transformation.read`   | tenant | Read v2 runs, recommendations and approvals.       |
| `bti.transformation.manage` | tenant | Persist a v2 run (via the definer RPC).            |
| `bti.government.read`       | tenant | Read government opportunities and assessments.     |
| `bti.government.manage`     | tenant | Register an opportunity and persist an assessment. |

```sql
-- PROPOSED — requires CEO approval; not applied; not in supabase/migrations/
insert into identity.permissions (key, description, scope) values
  ('bti.transformation.read',   'Read HL-BTI v2 transformation runs.',        'tenant'),
  ('bti.transformation.manage', 'Persist HL-BTI v2 transformation runs.',     'tenant'),
  ('bti.government.read',       'Read government opportunity assessments.',   'tenant'),
  ('bti.government.manage',     'Register and assess government opportunities.','tenant')
on conflict (key) do nothing;
-- role_permissions grants would mirror the 0026 role matrix (owner/admin/manager read+manage; staff/viewer read).
```

---

## What this buys, and what it costs

- **Buys:** saved v2 runs reopen on any device; real (non-sample) transformation
  scores can flow into `bti.ceo_dashboard()`; approvals are auditable.
- **Costs:** a new migration, which requires **explicit CEO approval** before it is
  authored, reviewed, and applied — in that order, never before.

## Restating the boundary

- The v2 engine **works today with none of this**.
- Every table, policy, enum and permission above is **PROPOSED only**.
- **Nothing here is applied. Nothing here is in `supabase/migrations/`. No
migration is applied without explicit CEO approval. Do not deploy, do not
migrate production, do not modify customer apps.**
</content>

</invoke>
