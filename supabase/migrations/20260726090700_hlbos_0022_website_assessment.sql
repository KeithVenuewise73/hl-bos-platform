-- ===========================================================================
-- v0_website_assessment — Website Assessment Collector (Discovery Module 1)
--
-- Activates the seeded `website_assessment` collector and adds the website scan
-- LIFECYCLE + COUNTERS (discovery.website_scans). All findings are recorded as
-- rows in the canonical discovery.evidence store (no parallel findings system);
-- scoring goes through the existing discovery.score_dimension into
-- discovery.profile_scores. The scan event is routed to a worker via the shared
-- events handler mechanism (0021). SSRF/crawl/fetch logic lives in the edge/TS
-- layer (_shared/discovery/*) — the authoritative network validation cannot run
-- in SQL; this migration is the durable state + lifecycle + linkage.
--
-- rollback:
--   DELETE FROM events.handlers WHERE subscription_key = 'discovery_website_worker';
--   DELETE FROM events.subscriptions WHERE key = 'discovery_website_worker';
--   UPDATE discovery.collectors SET is_active = false WHERE key = 'website_assessment';
--   DROP TABLE IF EXISTS discovery.website_scans CASCADE;
--   DROP TYPE IF EXISTS discovery.scan_status;
-- ===========================================================================

do $$ begin create type discovery.scan_status as enum
  ('requested','validating','queued','running','fetching','analyzing',
   'awaiting_review','completed','partially_completed','failed','cancelled');
exception when duplicate_object then null; end $$;

-- --- website scan lifecycle + counters (mirrors integrations.sync_runs) ------
create table if not exists discovery.website_scans (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  profile_id       uuid not null references discovery.profiles(id) on delete cascade,
  collection_id    uuid references discovery.collections(id) on delete set null,
  assessment_id    uuid references discovery.assessments(id) on delete set null,
  requested_url    text not null,
  normalized_url   text not null,
  status           discovery.scan_status not null default 'requested',
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  pages_requested  integer not null default 0,
  pages_fetched    integer not null default 0,
  pages_skipped    integer not null default 0,
  redirect_count   integer not null default 0,
  bytes_downloaded bigint not null default 0,
  findings_count   integer not null default 0,
  error_count      integer not null default 0,
  warning_count    integer not null default 0,
  crawler_version  text not null default 'ws-0.1.0',
  rubric_version   text not null default 'rubric-0.1.0',
  ai_prompt_version text,
  ai_run_ids       jsonb not null default '[]'::jsonb,
  cost_usd         numeric(12,6) not null default 0,
  error            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint website_scans_cost_nonneg check (cost_usd >= 0)
);
create index if not exists website_scans_profile_idx on discovery.website_scans (profile_id, status);
create index if not exists website_scans_inflight_idx on discovery.website_scans (profile_id, normalized_url)
  where status not in ('completed','partially_completed','failed','cancelled');

create trigger website_scans_set_updated_at before update on discovery.website_scans
  for each row execute function platform.set_updated_at();
create trigger website_scans_audit after insert or update or delete on discovery.website_scans
  for each row execute function audit.emit();

alter table discovery.website_scans enable row level security;
alter table discovery.website_scans force  row level security;
drop policy if exists website_scans_select on discovery.website_scans;
create policy website_scans_select on discovery.website_scans for select to authenticated
  using (identity.has_permission(tenant_id, 'discovery.evidence.read'));
grant select on discovery.website_scans to authenticated;

-- --- request a scan (idempotent per profile+normalized_url while in-flight) --
create or replace function discovery.request_website_scan(p_profile uuid, p_url text, p_normalized text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_active boolean; v_collection uuid; v_id uuid; v_existing uuid;
begin
  select tenant_id into v_tenant from discovery.profiles where id = p_profile;
  if not found then raise exception 'profile % not found', p_profile using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.evidence.create') then
    raise exception 'insufficient privilege to request a website scan' using errcode = 'insufficient_privilege';
  end if;
  select is_active into v_active from discovery.collectors where key = 'website_assessment';
  if not coalesce(v_active,false) then
    raise exception 'website_assessment collector is not active' using errcode = 'insufficient_privilege';
  end if;
  if p_normalized is null or p_normalized !~ '^https?://' then
    raise exception 'normalized url must be http(s)' using errcode = 'invalid_parameter_value';
  end if;
  -- idempotency: reuse an in-flight scan for the same target
  select id into v_existing from discovery.website_scans
   where profile_id = p_profile and normalized_url = p_normalized
     and status not in ('completed','partially_completed','failed','cancelled')
   limit 1;
  if found then return v_existing; end if;

  v_collection := discovery.start_collection(p_profile, 'website_assessment');
  insert into discovery.website_scans (tenant_id, profile_id, collection_id, requested_url, normalized_url, status, created_by)
  values (v_tenant, p_profile, v_collection, p_url, p_normalized, 'requested', auth.uid())
  returning id into v_id;
  perform events.emit('discovery.website_scan.requested', v_tenant,
    jsonb_build_object('scan', v_id, 'profile', p_profile, 'url', p_normalized));
  return v_id;
end; $$;
revoke all on function discovery.request_website_scan(uuid, text, text) from public, anon;
grant execute on function discovery.request_website_scan(uuid, text, text) to authenticated;

-- --- worker: update progress/counters --------------------------------------
create or replace function discovery.update_scan_progress(
  p_scan uuid, p_status discovery.scan_status, p_stats jsonb default '{}'::jsonb, p_ai_run bigint default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.website_scans where id = p_scan;
  if not found then raise exception 'scan % not found', p_scan using errcode = 'no_data_found'; end if;
  if not (identity.has_permission(v_tenant, 'discovery.evidence.create') or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to update a scan' using errcode = 'insufficient_privilege';
  end if;
  update discovery.website_scans set
    status = p_status,
    pages_requested  = coalesce((p_stats->>'pages_requested')::int, pages_requested),
    pages_fetched    = coalesce((p_stats->>'pages_fetched')::int, pages_fetched),
    pages_skipped    = coalesce((p_stats->>'pages_skipped')::int, pages_skipped),
    redirect_count   = coalesce((p_stats->>'redirect_count')::int, redirect_count),
    bytes_downloaded = coalesce((p_stats->>'bytes_downloaded')::bigint, bytes_downloaded),
    error_count      = coalesce((p_stats->>'error_count')::int, error_count),
    warning_count    = coalesce((p_stats->>'warning_count')::int, warning_count),
    ai_prompt_version = coalesce(p_stats->>'ai_prompt_version', ai_prompt_version),
    cost_usd         = coalesce((p_stats->>'cost_usd')::numeric, cost_usd),
    ai_run_ids       = case when p_ai_run is null then ai_run_ids else ai_run_ids || to_jsonb(p_ai_run) end
  where id = p_scan;
end; $$;
revoke all on function discovery.update_scan_progress(uuid, discovery.scan_status, jsonb, bigint) from public, anon;
grant execute on function discovery.update_scan_progress(uuid, discovery.scan_status, jsonb, bigint) to authenticated, service_role;

-- --- worker: record a website finding as canonical discovery evidence -------
create or replace function discovery.record_scan_finding(
  p_scan uuid, p_page_url text, p_key extensions.citext, p_value jsonb,
  p_category extensions.citext, p_severity extensions.citext, p_confidence numeric default 1.00,
  p_detection extensions.citext default 'deterministic', p_file uuid default null, p_ai_run bigint default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_profile uuid; v_collection uuid; v_id bigint;
begin
  select tenant_id, profile_id, collection_id into v_tenant, v_profile, v_collection
    from discovery.website_scans where id = p_scan;
  if not found then raise exception 'scan % not found', p_scan using errcode = 'no_data_found'; end if;
  -- record_evidence re-checks discovery.evidence.create for the tenant
  v_id := discovery.record_evidence(
    v_profile, 'website_assessment', 'website', p_key,
    p_value || jsonb_build_object('category', p_category, 'severity', p_severity,
                                  'detection_method', p_detection, 'page_url', p_page_url),
    p_confidence, jsonb_build_array(p_page_url), v_collection, p_file, p_ai_run);
  update discovery.website_scans set findings_count = findings_count + 1 where id = p_scan;
  return v_id;
end; $$;
revoke all on function discovery.record_scan_finding(uuid, text, extensions.citext, jsonb, extensions.citext, extensions.citext, numeric, extensions.citext, uuid, bigint) from public, anon;
grant execute on function discovery.record_scan_finding(uuid, text, extensions.citext, jsonb, extensions.citext, extensions.citext, numeric, extensions.citext, uuid, bigint) to authenticated, service_role;

-- --- link a scan to a discovery assessment (for scoring) --------------------
create or replace function discovery.set_scan_assessment(p_scan uuid, p_assessment uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.website_scans where id = p_scan;
  if not found then raise exception 'scan % not found', p_scan using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.assessment.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.website_scans set assessment_id = p_assessment where id = p_scan;
end; $$;
revoke all on function discovery.set_scan_assessment(uuid, uuid) from public, anon;
grant execute on function discovery.set_scan_assessment(uuid, uuid) to authenticated;

-- --- complete / cancel ------------------------------------------------------
create or replace function discovery.complete_scan(p_scan uuid, p_status discovery.scan_status, p_error text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_collection uuid;
begin
  if p_status not in ('completed','partially_completed','failed') then
    raise exception 'complete_scan status must be a terminal success/partial/failed' using errcode = 'invalid_parameter_value';
  end if;
  select tenant_id, collection_id into v_tenant, v_collection from discovery.website_scans where id = p_scan;
  if not found then raise exception 'scan % not found', p_scan using errcode = 'no_data_found'; end if;
  if not (identity.has_permission(v_tenant, 'discovery.evidence.create') or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to complete a scan' using errcode = 'insufficient_privilege';
  end if;
  update discovery.website_scans set status = p_status, completed_at = now(), error = p_error where id = p_scan;
  update discovery.collections
     set status = (case when p_status = 'failed' then 'failed' else 'collected' end)::discovery.collection_status,
         finished_at = now() where id = v_collection;
  perform events.emit(
    (case when p_status = 'failed' then 'discovery.website_scan.failed' else 'discovery.website_scan.completed' end)::extensions.citext,
    v_tenant, jsonb_build_object('scan', p_scan, 'status', p_status));
end; $$;
revoke all on function discovery.complete_scan(uuid, discovery.scan_status, text) from public, anon;
grant execute on function discovery.complete_scan(uuid, discovery.scan_status, text) to authenticated, service_role;

create or replace function discovery.cancel_scan(p_scan uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from discovery.website_scans where id = p_scan;
  if not found then raise exception 'scan % not found', p_scan using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'discovery.evidence.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update discovery.website_scans set status = 'cancelled', completed_at = now()
    where id = p_scan and status not in ('completed','partially_completed','failed','cancelled');
end; $$;
revoke all on function discovery.cancel_scan(uuid) from public, anon;
grant execute on function discovery.cancel_scan(uuid) to authenticated;

-- --- Activate the collector + wire the worker via the shared dispatcher -----
update discovery.collectors set is_active = true where key = 'website_assessment';

insert into events.subscriptions (key, topic, consumer_module, active) values
  ('discovery_website_worker', 'discovery.website_scan.requested', 'discovery', true)
on conflict (key) do nothing;

insert into events.handlers (subscription_key, handler_ref, max_attempts, backoff_seconds, timeout_seconds) values
  ('discovery_website_worker', 'discovery-website-worker', 3, 60, 120)
on conflict (subscription_key) do nothing;
