-- ===========================================================================
-- hlbos_0055 — Business Transformation Audit: the public API
--
-- THIS ONE IS NEW WORK, NOT A RECONSTRUCTION.
--
-- 0049–0054 reproduced what production already had. This migration does not
-- exist in production and has never been applied anywhere. It needs explicit
-- CEO approval before it is applied, like every other migration.
--
-- WHY IT EXISTS
--
-- The `transform_audit` schema holds 27 functions and, in canonical
-- production, 40 recorded audit runs against 50 real Western New York
-- barbershops -- 45 findings and 40 recommendations. None of it is reachable.
-- `transform_audit` is not exposed through PostgREST and had zero `public.*`
-- RPCs, so no application could read a single one of those runs. Work that has
-- been done and cannot be seen is, in this platform's terms, a control that
-- controls nothing.
--
-- WHAT THIS ADDS
--
--   * three READ functions inside `transform_audit` that did not exist:
--     campaigns_for, shops_for and runs_for. Without them the schema could
--     read one run by id but had no way to FIND a run, which makes an API
--     useless. They follow the schema's own convention -- SECURITY DEFINER
--     with an explicit identity.has_permission() check -- rather than putting
--     authority in the wrapper.
--   * 20 `public.barberos_audit_*` wrappers, all SECURITY INVOKER, each
--     delegating to the SECURITY DEFINER function that does its own permission
--     check. A wrapper adds reachability, never authority: none can hand a
--     caller something the inner function would have refused.
--
-- WHY THE INNER READS ARE SECURITY DEFINER
--
-- An audit's subject is a `visibility.prospects` row, and reading that table
-- requires `visibility.prospect.read` -- a DIFFERENT permission from
-- `transform_audit.audit.read`. A SECURITY INVOKER list function joining
-- prospects would return rows with null business names to someone holding only
-- audit.read: a half-empty screen with no explanation. The existing
-- transform_audit.report() already resolves this the other way, by being
-- SECURITY DEFINER and treating audit.read as sufficient to see the name of
-- the shop the audit is about. These three follow that precedent so the whole
-- schema answers the question the same way.
--
-- NO ANON. NOT ONE FUNCTION.
--
-- This is internal agency tooling: it describes other people's businesses
-- before they are customers, and includes the sales hook we intend to open with.
-- Unlike barberos_published_site there is no public audience for any of it, so
-- every function here is revoked from public and anon and granted only to
-- authenticated, whose own permission check then decides.
--
-- ONE HONESTY RULE IS BUILT INTO THE SHAPE
--
-- Everything that returns composite_score returns `coverage` beside it, in the
-- same object, and a caller cannot separate them.
--
-- A bare 0 is ambiguous in a way that matters commercially: it can mean "we
-- looked and it was bad" or "nothing ever reached this dimension". In
-- production today it is the latter -- 35 runs read completed at 1 of 1 with a
-- composite of 0, 5 read partially_completed at 0 of 1 with no score, and NOT
-- ONE of the 45 findings carries an evidence URL. A list endpoint returning the
-- score alone would let a UI render "0/100" as a judgement about the barbershop
-- when it is a statement about how little we have actually established.
--
-- rollback:
--   DROP FUNCTION IF EXISTS
--     public.barberos_audit_campaigns(uuid), public.barberos_audit_save_campaign(uuid,text,text,jsonb),
--     public.barberos_audit_shops(uuid,text), public.barberos_audit_import_shop(uuid,jsonb),
--     public.barberos_audit_runs(uuid,integer), public.barberos_audit_start_run(uuid,uuid),
--     public.barberos_audit_record_finding(uuid,text,text,text,text,text,text,jsonb,text),
--     public.barberos_audit_record_dimension(uuid,text,integer,text,text,text),
--     public.barberos_audit_add_recommendation(uuid,text,text,text,text,bigint,integer),
--     public.barberos_audit_set_hook(uuid,bigint,text), public.barberos_audit_finish_run(uuid,text),
--     public.barberos_audit_report(uuid), public.barberos_audit_bundle(uuid),
--     public.barberos_audit_add_competitor(uuid,uuid,text),
--     public.barberos_audit_discovery(uuid), public.barberos_audit_record_discovery(uuid,jsonb),
--     public.barberos_audit_proposals(uuid), public.barberos_audit_proposal(uuid),
--     public.barberos_audit_draft_proposal(uuid,uuid,jsonb), public.barberos_audit_save_proposal(uuid,jsonb),
--     public.barberos_audit_send_proposal(uuid), public.barberos_audit_decide_proposal(uuid,text,text);
--   DROP FUNCTION IF EXISTS transform_audit.campaigns_for(uuid),
--     transform_audit.shops_for(uuid,text), transform_audit.runs_for(uuid,integer),
--     transform_audit.add_competitor(uuid,uuid,text);
-- ===========================================================================

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

-- The shops being audited, each with its latest run. `audited` is false when a
-- shop has never been run, so an operator can see the queue rather than
-- inferring it from an absent score.
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
             -- Never the score without its coverage. A 0 here can mean "we
             -- looked and it scored nothing" or "nothing reached this
             -- dimension"; the caller must not be able to confuse them.
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

-- Competitors were recordable only by direct table write, which no signed-in
-- caller can do. This is the permission-checked path the trigger already
-- expected to sit behind.
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
--
-- Every function below is SECURITY INVOKER and delegates. Enum parameters are
-- text at the boundary and cast inside, so a client never needs to know a
-- PostgreSQL type name to call the API -- the same choice barberos_set_link
-- already makes.
-- ===========================================================================

-- --- campaigns --------------------------------------------------------------
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

-- --- shops ------------------------------------------------------------------
create or replace function public.barberos_audit_shops(p_tenant uuid, p_search text default null)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.shops_for(p_tenant, p_search);
$function$;

create or replace function public.barberos_audit_import_shop(p_tenant uuid, p_row jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.import_shop(p_tenant, p_row);
$function$;

-- --- runs -------------------------------------------------------------------
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

-- --- reading the result -----------------------------------------------------
create or replace function public.barberos_audit_report(p_run uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.report(p_run);
$function$;

-- recommended_bundle returns a set of rows; the API hands back one document so
-- a client makes one call and gets one shape.
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

-- --- the discovery call -----------------------------------------------------
create or replace function public.barberos_audit_discovery(p_prospect uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.discovery_for(p_prospect);
$function$;

create or replace function public.barberos_audit_record_discovery(p_prospect uuid, p_answers jsonb)
returns uuid language sql set search_path = '' as $function$
  select transform_audit.record_discovery(p_prospect, p_answers);
$function$;

-- --- proposals --------------------------------------------------------------
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
-- 3. Grants
--
-- Revoke from public and anon first, then grant back to authenticated only.
-- There is no anon grant anywhere in this migration, deliberately: this API
-- describes other people's businesses before they are customers, and carries
-- the sales hook we intend to open with. It has no public audience.
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
