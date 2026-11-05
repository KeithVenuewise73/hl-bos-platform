-- ===========================================================================
-- PROPOSED, PRODUCTION-ONLY PACKAGE — NOT APPLIED ANYWHERE.
-- Requires: revenue_center_controls.sql applied, AND production's
-- transform_audit schema (hlbos_0049_transform_audit, not on main).
--
-- Adopts the existing HLD barbershop prospects (production: 50 records, tenant
-- herman-legacy-digital, transform_audit campaign wny_barbers_50) into the
-- Revenue Center WITHOUT changing them:
--   * visibility.prospects rows: untouched (name, stage, contact fields kept)
--   * transform_audit.* (40 runs, 45 findings, 40 recommendations): untouched
--   * adds ONE revenue.prospect_profiles row + identity keys per prospect,
--     with source attribution (file, row, campaign, run ids)
--   * adds a read-only history view joining the old and new assessments
--
-- Owner-run, dry-run first, idempotent (a second run adopts nothing new).
-- Rollback: revenue.unadopt_transform_audit(…) removes only what this added.
-- ===========================================================================

create or replace function revenue.adopt_from_transform_audit(
  p_tenant uuid, p_ta_campaign_key extensions.citext, p_revenue_campaign extensions.citext, p_dry_run boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ta_campaign uuid; r record; v_keys text[]; v_clash uuid; v_runs uuid[];
  v_eligible int := 0; v_adopted int := 0; v_already int := 0; v_conflicts jsonb := '[]'::jsonb;
begin
  if not identity.has_permission(p_tenant, 'revenue.commercial_approval.manage')
     or not exists (select 1 from revenue.commercial_approvers a where a.tenant_id = p_tenant and a.user_id = auth.uid()) then
    raise exception 'only the designated owner adopts existing prospects' using errcode = 'insufficient_privilege';
  end if;
  perform revenue.assert_industry_fits(p_tenant, 'barbershop');
  if not exists (select 1 from revenue.campaigns c where c.tenant_id = p_tenant and c.key = lower(p_revenue_campaign::text)
                 and c.industry_key = 'barbershop') then
    raise exception 'create the % barbershop campaign first', p_revenue_campaign using errcode = 'invalid_parameter_value';
  end if;
  select id into v_ta_campaign from transform_audit.campaigns where tenant_id = p_tenant and key = p_ta_campaign_key;
  if v_ta_campaign is null then
    raise exception 'transform_audit campaign % not found in this tenant', p_ta_campaign_key using errcode = 'no_data_found';
  end if;

  begin  -- subtransaction: a dry run is rolled back at the end
    for r in
      select p.id, p.business_name, p.website_url, p.phone, p.email, s.locality, s.region, s.gbp_place_id,
             s.source_file, s.source_row, s.dedupe_key::text as shop_key
      from visibility.prospects p
      join transform_audit.shop_profiles s on s.prospect_id = p.id and s.tenant_id = p.tenant_id
      where p.tenant_id = p_tenant
      order by s.source_row nulls last, p.created_at
    loop
      v_eligible := v_eligible + 1;
      if exists (select 1 from revenue.prospect_profiles where prospect_id = r.id) then
        v_already := v_already + 1; continue;
      end if;
      v_keys := array_remove(array[
        'import:' || lower(r.shop_key),
        case when r.gbp_place_id is not null then 'place:' || lower(r.gbp_place_id) end,
        case when r.website_url is not null then 'domain:' || lower(regexp_replace(regexp_replace(r.website_url, '^https?://(www\.)?', '', 'i'), '/.*$', '')) end,
        case when length(regexp_replace(coalesce(r.phone,''), '\D', '', 'g')) >= 10 then 'phone:' || right(regexp_replace(r.phone, '\D', '', 'g'), 10) end,
        case when r.email is not null then 'email:' || lower(r.email::text) end,
        'name:' || lower(regexp_replace(regexp_replace(r.business_name, '[^a-zA-Z0-9]+', '', 'g'), 'shop$', '', 'i')) || '|' || lower(coalesce(r.locality, ''))
      ], null);
      select prospect_id into v_clash from revenue.identity_keys where tenant_id = p_tenant and key = any(v_keys) limit 1;
      if v_clash is not null then
        v_conflicts := v_conflicts || jsonb_build_object('prospect_id', r.id, 'duplicates', v_clash);
        continue;
      end if;
      select array_agg(id order by started_at) into v_runs from transform_audit.runs where prospect_id = r.id;
      insert into revenue.prospect_profiles (prospect_id, tenant_id, industry_key, campaign_key, dedupe_key,
        discovery_source, is_synthetic, source_ref)
      values (r.id, p_tenant, 'barbershop', lower(p_revenue_campaign::text), v_keys[1], 'import', false,
        jsonb_build_object('adopted_from', 'transform_audit', 'transform_audit_campaign', p_ta_campaign_key::text,
          'source_file', r.source_file, 'source_row', r.source_row, 'transform_audit_run_ids', coalesce(to_jsonb(v_runs), '[]'::jsonb),
          'adopted_by', auth.uid(), 'adopted_at', now()));
      insert into revenue.identity_keys (tenant_id, key, prospect_id) select p_tenant, k, r.id from unnest(v_keys) k on conflict do nothing;
      v_adopted := v_adopted + 1;
    end loop;
    if p_dry_run then raise exception using errcode = 'P0001', message = 'dry-run-rollback'; end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'dry-run-rollback' then raise; end if;
  end;

  if not p_dry_run then
    perform audit.log_security_event('revenue.adopt_from_transform_audit', 'allowed', 'info', p_tenant,
      'revenue.prospect_profiles', p_ta_campaign_key::text, jsonb_build_object('adopted', v_adopted, 'conflicts', jsonb_array_length(v_conflicts)));
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'eligible', v_eligible, 'adopted', v_adopted,
    'already_adopted', v_already, 'conflicts', v_conflicts);
end; $$;
revoke all on function revenue.adopt_from_transform_audit(uuid, extensions.citext, extensions.citext, boolean) from public, anon;
grant execute on function revenue.adopt_from_transform_audit(uuid, extensions.citext, extensions.citext, boolean) to authenticated;

-- Removes ONLY what adoption added (profiles + identity keys of records whose
-- source_ref says adopted_from transform_audit, and that have no Revenue
-- Center reviews yet). Never touches visibility.prospects or transform_audit.
create or replace function revenue.unadopt_transform_audit(p_tenant uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  if not identity.has_permission(p_tenant, 'revenue.commercial_approval.manage')
     or not exists (select 1 from revenue.commercial_approvers a where a.tenant_id = p_tenant and a.user_id = auth.uid()) then
    raise exception 'only the designated owner reverses an adoption' using errcode = 'insufficient_privilege';
  end if;
  delete from revenue.identity_keys k using revenue.prospect_profiles pp
   where k.prospect_id = pp.prospect_id and pp.tenant_id = p_tenant and pp.source_ref->>'adopted_from' = 'transform_audit'
     and not exists (select 1 from revenue.review_requests rr where rr.prospect_id = pp.prospect_id);
  delete from revenue.prospect_profiles pp
   where pp.tenant_id = p_tenant and pp.source_ref->>'adopted_from' = 'transform_audit'
     and not exists (select 1 from revenue.review_requests rr where rr.prospect_id = pp.prospect_id);
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function revenue.unadopt_transform_audit(uuid) from public, anon;
grant execute on function revenue.unadopt_transform_audit(uuid) to authenticated;

-- One history per prospect: the earlier Transformation Audit and Revenue
-- Center reviews side by side. Invoker view: each source's RLS applies.
create or replace view revenue.prospect_history with (security_invoker = true) as
  select r.prospect_id, r.tenant_id, 'transform_audit'::text as source, r.id::text as record_id, r.started_at as at,
         r.status::text as status, r.composite_score as score,
         (select count(*) from transform_audit.findings f where f.run_id = r.id) as findings,
         (select count(*) from transform_audit.recommendations x where x.run_id = r.id) as recommendations
    from transform_audit.runs r
  union all
  select a.prospect_id, a.tenant_id, 'revenue_center', a.id::text, coalesce(a.assessed_at, a.created_at),
         a.status::text, a.growth_score,
         (select count(*) from revenue.assessment_evidence e where e.assessment_id = a.id and e.kind in ('observed','verified','customer_provided')),
         (select count(*) from visibility.recommendations x where x.assessment_id = a.id)
    from visibility.assessments a;
grant select on revenue.prospect_history to authenticated;
