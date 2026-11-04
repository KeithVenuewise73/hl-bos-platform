-- hlbos_0055 — Business Transformation Audit: the public API
-- Applied under CEO approval 2026-09-17. Repo file:
-- supabase/migrations/20260917160000_hlbos_0055_barberos_audit_public_api.sql
-- sha256 f18ef6d40d5a1df9d12e17ff20c06a25b346c89a326aa30ccdd678cd74d68580

-- ===========================================================================
-- 1. The three reads the schema was missing
-- ===========================================================================

create or replace function transform_audit.campaigns_for(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (identity.has_permission(p_tenant, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this agency''s audit campaigns'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((select jsonb_agg(x order by x->>'key') from (
    select jsonb_build_object(
             'id', c.id, 'key', c.key, 'name', c.name, 'status', c.status,
             'weights', coalesce((select jsonb_object_agg(w.dimension::text, w.weight)
                                    from transform_audit.campaign_weights w
                                   where w.campaign_id = c.id), '{}'::jsonb),
             'runs', (select count(*) from transform_audit.runs r where r.campaign_id = c.id),
             'created_at', c.created_at) as x
      from transform_audit.campaigns c
     where c.tenant_id = p_tenant) q), '[]'::jsonb);
end; $function$;

create or replace function transform_audit.shops_for(p_tenant uuid, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (identity.has_permission(p_tenant, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this agency''s audited shops'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((select jsonb_agg(x order by x->>'business_name') from (
    select jsonb_build_object(
             'prospect_id', p.id,
             'business_name', p.business_name,
             'locality', sp.locality, 'region', sp.region,
             'website_url', p.website_url,
             'has_gbp', sp.gbp_place_id is not null,
             'has_instagram', sp.instagram_url is not null,
             'has_facebook', sp.facebook_url is not null,
             'source', jsonb_build_object('file', sp.source_file, 'row', sp.source_row),
             'called', exists (select 1 from transform_audit.discovery d
                                where d.prospect_id = p.id and d.answered_at is not null),
             'audited', exists (select 1 from transform_audit.runs r where r.prospect_id = p.id),
             'latest_run', (
               select jsonb_build_object(
                        'run_id', r.id, 'status', r.status,
                        'composite_score', r.composite_score,
                        'coverage', jsonb_build_object('scored', r.dimensions_scored,
                                                       'possible', r.dimensions_possible),
                        'started_at', r.started_at)
                 from transform_audit.runs r
                where r.prospect_id = p.id
                order by r.started_at desc limit 1)) as x
      from transform_audit.shop_profiles sp
      join visibility.prospects p on p.id = sp.prospect_id
     where sp.tenant_id = p_tenant
       and (p_search is null or pg_catalog.btrim(p_search) = ''
            or p.business_name ilike '%'||p_search||'%'
            or coalesce(sp.locality,'') ilike '%'||p_search||'%')) q), '[]'::jsonb);
end; $function$;

create or replace function transform_audit.runs_for(p_tenant uuid, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (identity.has_permission(p_tenant, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this agency''s audit runs'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((select jsonb_agg(x order by x->>'started_at' desc) from (
    select jsonb_build_object(
             'run_id', r.id, 'status', r.status,
             'campaign', (select c.key from transform_audit.campaigns c where c.id = r.campaign_id),
             'prospect_id', r.prospect_id,
             'business_name', (select p.business_name from visibility.prospects p
                                where p.id = r.prospect_id),
             'composite_score', r.composite_score,
             'coverage', jsonb_build_object('scored', r.dimensions_scored,
                                            'possible', r.dimensions_possible),
             'findings', (select count(*) from transform_audit.findings f where f.run_id = r.id),
             'evidenced_findings', (select count(*) from transform_audit.findings f
                                     where f.run_id = r.id and f.evidence_url is not null),
             'has_outreach_hook', r.outreach_hook is not null,
             'started_at', r.started_at, 'finished_at', r.finished_at,
             'error', r.error) as x
      from transform_audit.runs r
     where r.tenant_id = p_tenant
     order by r.started_at desc
     limit greatest(coalesce(p_limit, 100), 1)) q), '[]'::jsonb);
end; $function$;

create or replace function transform_audit.add_competitor(
  p_run uuid, p_competitor uuid, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_comp_tenant uuid;
begin
  select r.tenant_id into v_tenant from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to record a competitor'
      using errcode = 'insufficient_privilege';
  end if;
  select p.tenant_id into v_comp_tenant from visibility.prospects p where p.id = p_competitor;
  if v_comp_tenant is null then
    raise exception 'competitor prospect % does not exist', p_competitor
      using errcode = 'no_data_found';
  end if;
  if v_comp_tenant <> v_tenant then
    raise exception 'competitor % belongs to a different agency tenant', p_competitor
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.run_competitors (run_id, competitor_prospect_id, note)
  values (p_run, p_competitor, coalesce(p_note, ''))
  on conflict (run_id, competitor_prospect_id) do update set note = excluded.note;
end; $function$;

revoke all on function transform_audit.campaigns_for(uuid) from public, anon;
revoke all on function transform_audit.shops_for(uuid, text) from public, anon;
revoke all on function transform_audit.runs_for(uuid, integer) from public, anon;
revoke all on function transform_audit.add_competitor(uuid, uuid, text) from public, anon;
grant execute on function transform_audit.campaigns_for(uuid) to authenticated;
grant execute on function transform_audit.shops_for(uuid, text) to authenticated;
grant execute on function transform_audit.runs_for(uuid, integer) to authenticated;
grant execute on function transform_audit.add_competitor(uuid, uuid, text) to authenticated;

-- ===========================================================================
-- 2. The public API
-- ===========================================================================

create or replace function public.barberos_audit_campaigns(p_tenant uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.campaigns_for(p_tenant);
$function$;

create or replace function public.barberos_audit_save_campaign(
  p_tenant uuid, p_key text, p_name text,
  p_weights jsonb default '{"website": 100}'::jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.upsert_campaign(p_tenant, p_key::extensions.citext, p_name, p_weights);
$function$;

create or replace function public.barberos_audit_shops(p_tenant uuid, p_search text default null)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.shops_for(p_tenant, p_search);
$function$;

create or replace function public.barberos_audit_import_shop(p_tenant uuid, p_row jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.import_shop(p_tenant, p_row);
$function$;

create or replace function public.barberos_audit_runs(p_tenant uuid, p_limit integer default 100)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.runs_for(p_tenant, p_limit);
$function$;

create or replace function public.barberos_audit_start_run(p_campaign uuid, p_prospect uuid)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.start_run(p_campaign, p_prospect);
$function$;

create or replace function public.barberos_audit_record_finding(
  p_run uuid, p_dimension text, p_code text, p_statement text, p_confidence text,
  p_severity text default 'info', p_evidence_url text default null,
  p_observed jsonb default '{}'::jsonb, p_detector text default 'manual')
returns bigint language sql set search_path = '' as $function$
  select transform_audit.record_finding(
    p_run, p_dimension::transform_audit.dimension, p_code::extensions.citext,
    p_statement, p_confidence::transform_audit.confidence,
    p_severity::transform_audit.severity, p_evidence_url, p_observed,
    p_detector::extensions.citext);
$function$;

create or replace function public.barberos_audit_record_dimension(
  p_run uuid, p_dimension text, p_score integer, p_confidence text,
  p_rubric_version text, p_note text default '')
returns integer language sql set search_path = '' as $function$
  select transform_audit.record_dimension(
    p_run, p_dimension::transform_audit.dimension, p_score,
    p_confidence::transform_audit.confidence, p_rubric_version::extensions.citext, p_note);
$function$;

create or replace function public.barberos_audit_add_recommendation(
  p_run uuid, p_priority text, p_title text, p_detail text default '',
  p_capability text default null, p_addresses bigint default null, p_rank integer default 1)
returns bigint language sql set search_path = '' as $function$
  select transform_audit.add_recommendation(
    p_run, p_priority::transform_audit.priority, p_title, p_detail,
    p_capability::extensions.citext, p_addresses, p_rank);
$function$;

create or replace function public.barberos_audit_set_hook(
  p_run uuid, p_finding bigint, p_hook text)
returns void language sql set search_path = '' as $function$
  select transform_audit.set_outreach_hook(p_run, p_finding, p_hook);
$function$;

create or replace function public.barberos_audit_add_competitor(
  p_run uuid, p_competitor uuid, p_note text default '')
returns void language sql set search_path = '' as $function$
  select transform_audit.add_competitor(p_run, p_competitor, p_note);
$function$;

create or replace function public.barberos_audit_finish_run(p_run uuid, p_error text default null)
returns text language sql set search_path = '' as $function$
  select transform_audit.finish_run(p_run, p_error)::text;
$function$;

create or replace function public.barberos_audit_report(p_run uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.report(p_run);
$function$;

create or replace function public.barberos_audit_bundle(p_run uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'capability_key', b.capability_key,
           'capability_name', b.capability_name,
           'status', b.status,
           'is_shipped', b.is_shipped,
           'priority', b.priority,
           'rank', b.rank)
         order by (b.priority <> 'structural'), b.rank, b.capability_key), '[]'::jsonb)
    from transform_audit.recommended_bundle(p_run) b;
$function$;

create or replace function public.barberos_audit_discovery(p_prospect uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.discovery_for(p_prospect);
$function$;

create or replace function public.barberos_audit_record_discovery(p_prospect uuid, p_answers jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.record_discovery(p_prospect, p_answers);
$function$;

create or replace function public.barberos_audit_proposals(p_prospect uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.proposals_for(p_prospect);
$function$;

create or replace function public.barberos_audit_proposal(p_id uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.proposal(p_id);
$function$;

create or replace function public.barberos_audit_draft_proposal(
  p_prospect uuid, p_run uuid, p_document jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.draft_proposal(p_prospect, p_run, p_document);
$function$;

create or replace function public.barberos_audit_save_proposal(p_id uuid, p_document jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.save_proposal(p_id, p_document);
$function$;

create or replace function public.barberos_audit_send_proposal(p_id uuid)
returns timestamptz language sql set search_path = '' as $function$
  select transform_audit.send_proposal(p_id);
$function$;

create or replace function public.barberos_audit_decide_proposal(
  p_id uuid, p_status text, p_note text default null)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.decide_proposal(p_id, p_status, p_note);
$function$;

-- ===========================================================================
-- 3. Grants. No anon grant anywhere, deliberately.
-- ===========================================================================
revoke all on function public.barberos_audit_campaigns(uuid) from public, anon;
revoke all on function public.barberos_audit_save_campaign(uuid, text, text, jsonb) from public, anon;
revoke all on function public.barberos_audit_shops(uuid, text) from public, anon;
revoke all on function public.barberos_audit_import_shop(uuid, jsonb) from public, anon;
revoke all on function public.barberos_audit_runs(uuid, integer) from public, anon;
revoke all on function public.barberos_audit_start_run(uuid, uuid) from public, anon;
revoke all on function public.barberos_audit_record_finding(uuid, text, text, text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.barberos_audit_record_dimension(uuid, text, integer, text, text, text) from public, anon;
revoke all on function public.barberos_audit_add_recommendation(uuid, text, text, text, text, bigint, integer) from public, anon;
revoke all on function public.barberos_audit_set_hook(uuid, bigint, text) from public, anon;
revoke all on function public.barberos_audit_add_competitor(uuid, uuid, text) from public, anon;
revoke all on function public.barberos_audit_finish_run(uuid, text) from public, anon;
revoke all on function public.barberos_audit_report(uuid) from public, anon;
revoke all on function public.barberos_audit_bundle(uuid) from public, anon;
revoke all on function public.barberos_audit_discovery(uuid) from public, anon;
revoke all on function public.barberos_audit_record_discovery(uuid, jsonb) from public, anon;
revoke all on function public.barberos_audit_proposals(uuid) from public, anon;
revoke all on function public.barberos_audit_proposal(uuid) from public, anon;
revoke all on function public.barberos_audit_draft_proposal(uuid, uuid, jsonb) from public, anon;
revoke all on function public.barberos_audit_save_proposal(uuid, jsonb) from public, anon;
revoke all on function public.barberos_audit_send_proposal(uuid) from public, anon;
revoke all on function public.barberos_audit_decide_proposal(uuid, text, text) from public, anon;

grant execute on function public.barberos_audit_campaigns(uuid) to authenticated;
grant execute on function public.barberos_audit_save_campaign(uuid, text, text, jsonb) to authenticated;
grant execute on function public.barberos_audit_shops(uuid, text) to authenticated;
grant execute on function public.barberos_audit_import_shop(uuid, jsonb) to authenticated;
grant execute on function public.barberos_audit_runs(uuid, integer) to authenticated;
grant execute on function public.barberos_audit_start_run(uuid, uuid) to authenticated;
grant execute on function public.barberos_audit_record_finding(uuid, text, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.barberos_audit_record_dimension(uuid, text, integer, text, text, text) to authenticated;
grant execute on function public.barberos_audit_add_recommendation(uuid, text, text, text, text, bigint, integer) to authenticated;
grant execute on function public.barberos_audit_set_hook(uuid, bigint, text) to authenticated;
grant execute on function public.barberos_audit_add_competitor(uuid, uuid, text) to authenticated;
grant execute on function public.barberos_audit_finish_run(uuid, text) to authenticated;
grant execute on function public.barberos_audit_report(uuid) to authenticated;
grant execute on function public.barberos_audit_bundle(uuid) to authenticated;
grant execute on function public.barberos_audit_discovery(uuid) to authenticated;
grant execute on function public.barberos_audit_record_discovery(uuid, jsonb) to authenticated;
grant execute on function public.barberos_audit_proposals(uuid) to authenticated;
grant execute on function public.barberos_audit_proposal(uuid) to authenticated;
grant execute on function public.barberos_audit_draft_proposal(uuid, uuid, jsonb) to authenticated;
grant execute on function public.barberos_audit_save_proposal(uuid, jsonb) to authenticated;
grant execute on function public.barberos_audit_send_proposal(uuid) to authenticated;
grant execute on function public.barberos_audit_decide_proposal(uuid, text, text) to authenticated;