-- =============================================================================
-- PROPOSED — FOR REVIEW ONLY. NOT A MIGRATION. NOT APPLIED ANYWHERE.
-- =============================================================================
-- Lives in docs/, deliberately outside supabase/migrations, so no tool, CI job
-- or lineage check can pick it up. Applying anything like it needs the CEO's
-- explicit approval, a numbered migration, pgTAP tests, and the normal review.
--
-- Purpose: give the Presence Scanner the columns the existing tables lack
-- (see README.md "Storage: today and later"), WITHOUT a second prospects table.
-- Everything hangs off the existing visibility.prospects row; findings keep
-- going to the existing discovery.evidence store.
--
-- Rollback: drop schema presence cascade; delete the presence.* permissions.
-- =============================================================================

create schema if not exists presence;

-- One row per prospect: the scanner's view of it.
create table if not exists presence.prospect_profiles (
  prospect_id        uuid primary key references visibility.prospects(id) on delete cascade,
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  -- Google permits storing place IDs indefinitely.
  place_id           text,
  vertical           text not null check (vertical in
                       ('contractor','salon_barber','restaurant_bar','trainer_coach','youth_sports')),
  lead_stage         text not null default 'new',
  website_status     text not null,
  -- Google content other than the place ID: purged when places_expires_at passes.
  places_snapshot    jsonb,
  places_observed_at timestamptz,
  places_expires_at  timestamptz,
  corrections        jsonb not null default '{}'::jsonb,
  qualification      jsonb not null,          -- computed checks + reviewer override
  score_version      text not null,           -- e.g. presence-opportunity-0.1.0
  score_total        integer not null check (score_total between 0 and 100),
  score_checked_max  integer not null check (score_checked_max between 0 and 100),
  score_breakdown    jsonb not null,          -- components -> contributions -> rule IDs + finding keys
  first_seen_at      timestamptz not null default now(),
  last_scanned_at    timestamptz not null default now(),
  constraint places_expiry_present check (places_snapshot is null or places_expires_at is not null)
);
create unique index if not exists prospect_profiles_place_uq
  on presence.prospect_profiles (tenant_id, place_id) where place_id is not null;

-- One row per market scan, including its Google usage and estimated cost.
create table if not exists presence.scan_runs (
  id              uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id       uuid not null references platform.tenants(id) on delete cascade,
  request         jsonb not null,
  score_version   text not null,
  counts          jsonb not null,
  api_requests    integer not null default 0,
  est_cost_usd    numeric(10,4) not null default 0,
  warnings        text[] not null default '{}',
  error           text,
  started_at      timestamptz not null,
  finished_at     timestamptz not null,
  created_by      uuid references auth.users(id) on delete set null
);

-- Reviewer notes. (Stage moves, overrides and corrections go to audit.events.)
create table if not exists presence.notes (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table presence.prospect_profiles enable row level security; alter table presence.prospect_profiles force row level security;
alter table presence.scan_runs         enable row level security; alter table presence.scan_runs         force row level security;
alter table presence.notes             enable row level security; alter table presence.notes             force row level security;

-- Reads gated on the EXISTING visibility permissions; writes only through
-- SECURITY DEFINER functions (not drafted here), as elsewhere in HL-BOS.
create policy prospect_profiles_select on presence.prospect_profiles for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
create policy scan_runs_select on presence.scan_runs for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
create policy notes_select on presence.notes for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.prospect.read'));

-- Retention: a scheduled job (CEO-gated, like every scheduler) would run this.
create or replace function presence.purge_expired_places() returns integer
language sql volatile security definer set search_path = '' as $$
  with purged as (
    update presence.prospect_profiles
       set places_snapshot = null, places_observed_at = null, places_expires_at = null
     where places_expires_at is not null and places_expires_at <= now()
    returning 1
  )
  select count(*)::integer from purged;
$$;
