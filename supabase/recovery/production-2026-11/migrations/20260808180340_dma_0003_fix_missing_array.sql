create or replace function dma.get_client_context(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public'
as $$
declare v_tenant uuid; v_client dma.clients; v_result jsonb; v_completeness jsonb; v_missing text[] := '{}';
begin
  select * into v_client from dma.clients where id = p_client;
  if not found then raise exception 'client % not found', p_client using errcode = 'no_data_found'; end if;
  v_tenant := v_client.tenant_id;
  if not identity.has_permission(v_tenant, 'dma.client.read') then raise exception 'insufficient privilege to read client context' using errcode = 'insufficient_privilege'; end if;
  v_completeness := dma.client_completeness(p_client);
  if v_client.one_liner is null and v_client.description is null then v_missing := array_append(v_missing, 'business_description'); end if;
  if not exists(select 1 from dma.brands where client_id=p_client and status='active') then v_missing := array_append(v_missing, 'brand'); end if;
  if not exists(select 1 from dma.offerings where client_id=p_client and status='active') then v_missing := array_append(v_missing, 'offerings'); end if;
  if not exists(select 1 from dma.markets where client_id=p_client and status='active') then v_missing := array_append(v_missing, 'markets'); end if;
  if not exists(select 1 from dma.personas where client_id=p_client and status='active') then v_missing := array_append(v_missing, 'personas'); end if;
  if not exists(select 1 from dma.competitors where client_id=p_client and status='active') then v_missing := array_append(v_missing, 'competitors'); end if;
  if not exists(select 1 from dma.objectives where client_id=p_client) then v_missing := array_append(v_missing, 'objectives'); end if;
  if not exists(select 1 from dma.channels where client_id=p_client and status='active') then v_missing := array_append(v_missing, 'channels'); end if;
  select jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'slug', v_client.slug, 'name', v_client.name,
      'legal_name', v_client.legal_name, 'website_url', v_client.website_url, 'hq_location', v_client.hq_location,
      'founded_year', v_client.founded_year, 'one_liner', v_client.one_liner, 'description', v_client.description,
      'is_internal', v_client.is_internal, 'needs_profile_completion', v_client.needs_profile_completion,
      'provenance', v_client.provenance, 'verification', v_client.verification, 'linked_platform_tenant_id', v_client.platform_tenant_id),
    'brand', (select jsonb_build_object('name', name, 'tagline', tagline, 'positioning_statement', positioning_statement,
        'differentiator', differentiator, 'value_proposition', value_proposition, 'brand_voice_traits', brand_voice_traits,
        'brand_voice_notes', brand_voice_notes, 'messaging_pillars', messaging_pillars, 'do_not_say', do_not_say,
        'provenance', provenance, 'verification', verification)
      from dma.brands where client_id=p_client and status='active' order by is_primary desc limit 1),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',name,'summary',summary,'is_core',is_core,'category',category,'provenance',provenance,'verification',verification) order by is_core desc, name) from dma.offerings where client_id=p_client and status='active'), '[]'::jsonb),
    'markets', coalesce((select jsonb_agg(jsonb_build_object('name',name,'market_type',market_type,'description',description,'provenance',provenance,'verification',verification) order by name) from dma.markets where client_id=p_client and status='active'), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(jsonb_build_object('name',name,'role_titles',role_titles,'goals',goals,'pains',pains,'objections',objections,'watering_holes',watering_holes,'provenance',provenance,'verification',verification) order by name) from dma.personas where client_id=p_client and status='active'), '[]'::jsonb),
    'competitors', coalesce((select jsonb_agg(jsonb_build_object('name',name,'website_url',website_url,'positioning',positioning,'strengths',strengths,'weaknesses',weaknesses,'threat_level',threat_level,'provenance',provenance,'verification',verification) order by threat_level desc, name) from dma.competitors where client_id=p_client and status='active'), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(jsonb_build_object('title',title,'objective_type',objective_type,'priority',priority,'status',status,'target_metric',target_metric,'target_value',target_value,'target_date',target_date,'provenance',provenance,'verification',verification) order by priority, title) from dma.objectives where client_id=p_client and status <> 'abandoned'), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'handle_or_url',handle_or_url,'is_active',is_active,'provenance',provenance,'verification',verification) order by kind) from dma.channels where client_id=p_client and status='active'), '[]'::jsonb),
    'active_campaigns', coalesce((select jsonb_agg(jsonb_build_object('name',name,'status',status,'start_date',start_date,'end_date',end_date) order by start_date desc nulls last) from dma.campaigns where client_id=p_client and status='active'), '[]'::jsonb),
    'recent_recommendations', coalesce((select jsonb_agg(jsonb_build_object('title',title,'status',status,'recommended_action',recommended_action,'requires_approval', status in ('recommended','pending_approval')) order by created_at desc) from (select * from dma.recommendations where client_id=p_client order by created_at desc limit 10) rr), '[]'::jsonb),
    'recent_metrics', coalesce((select jsonb_agg(jsonb_build_object('metric_key',metric_key,'metric_value',metric_value,'unit',unit,'period_end',period_end,'subject_type',subject_type) order by period_end desc nulls last) from (select * from dma.metrics where client_id=p_client order by period_end desc nulls last limit 20) mm), '[]'::jsonb),
    'restrictions', jsonb_build_object(
      'ai_may_not', jsonb_build_array('spend advertising money','launch campaigns','publish externally','send external communications','make contractual commitments'),
      'approval_required_for', jsonb_build_array('executing any recommendation','publishing any asset','sending any lead outreach'),
      'note', 'AI drafts and recommends only. Execution requires an approved recommendation (workflows human gate).'),
    'completeness', v_completeness,
    'missing', to_jsonb(v_missing),
    'generated_at', now()
  ) into v_result;
  return v_result;
end $$;