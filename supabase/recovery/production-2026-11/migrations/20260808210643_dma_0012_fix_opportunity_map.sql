create or replace function dma.market_opportunity_map(p_offering uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public' as $$
declare v_tenant uuid; v_result jsonb;
begin
  select tenant_id into v_tenant from dma.offerings where id = p_offering;
  if v_tenant is null then raise exception 'offering % not found', p_offering using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.market.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  with ranked as (
    select s.id as seg_id, s.name, s.definition, s.status,
           os.weighted_score, os.confidence, os.recommendation, os.rationale, os.evidence_count,
           os.provenance, os.verification,
           row_number() over (order by os.weighted_score desc nulls last) as rnk
    from dma.market_segments s
    join dma.opportunity_scores os on os.segment_id = s.id
    where s.offering_id = p_offering
  )
  select jsonb_build_object(
    'offering', (select jsonb_build_object('id',id,'name',name) from dma.offerings where id=p_offering),
    'generated_at', now(),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', rnk, 'segment', name, 'definition', definition, 'status', status,
        'opportunity_score', weighted_score, 'confidence', confidence,
        'recommendation', recommendation, 'rationale', rationale, 'evidence_count', evidence_count,
        'primary_problem', (select cp.problem from dma.customer_problems cp where cp.segment_id=ranked.seg_id order by cp.severity desc limit 1),
        'provenance', provenance, 'verification', verification
      ) order by rnk)
      from ranked), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;