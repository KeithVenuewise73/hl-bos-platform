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
                        -- Never the score without its coverage.
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
             -- Never the score without its coverage. In production every run
             -- reads 0 of 3, and that is a fact about us, not the shop.
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
  -- A competitor from another agency's prospect list would put someone else's
  -- data into this run.
  if v_comp_tenant <> v_tenant then
    raise exception 'competitor % belongs to a different agency tenant', p_competitor
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.run_competitors (run_id, competitor_prospect_id, note)
  values (p_run, p_competitor, coalesce(p_note, ''))
  on conflict (run_id, competitor_prospect_id) do update set note = excluded.note;
end; $function$;

create or replace function public.barberos_audit_bundle(p_run uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'capability_key', b.capability_key,
           'capability_name', b.capability_name,
           'status', b.status,
           -- The whole point of this field: a recommendation must not read as
           -- an offer of something that has not been built.
           'is_shipped', b.is_shipped,
           'priority', b.priority,
           'rank', b.rank)
         -- Structural before quick wins, matching report()'s own ordering.
         order by (b.priority <> 'structural'), b.rank, b.capability_key), '[]'::jsonb)
    from transform_audit.recommended_bundle(p_run) b;
$function$;