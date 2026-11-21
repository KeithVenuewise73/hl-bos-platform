-- vstudio.evaluations uses evaluated_at, not created_at.
create or replace function public.hlvs_opportunity(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare r jsonb;
begin
  if not identity.has_platform_permission('vstudio.opportunity.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  select jsonb_build_object(
    'id', b.id, 'title', b.title, 'problem', b.problem_statement,
    'customer', b.proposed_customer, 'category', b.category,
    'event_kind', b.event_kind, 'trigger', b.trigger_event, 'status', b.status,
    'net', b.score_net, 'gross', b.score_gross, 'penalty', b.score_penalty,
    'confidence', b.confidence, 'build', b.build_difficulty,
    'acq', b.acquisition_difficulty, 'recurring', b.recurring_potential,
    'low_touch', b.low_touch_potential, 'price_low', b.suggested_price_low,
    'price_high', b.suggested_price_high, 'price_model', b.price_model,
    'builder', b.builder_recommendation, 'gap', b.product_gap,
    'competitors', b.competitors, 'risks', b.risks,
    'channels', (select a.acquisition_channels from disco.assessments a where a.opportunity_id=b.id),
    'mvp', (select a.mvp_scope from disco.assessments a where a.opportunity_id=b.id),
    'rationale', b.rank_rationale, 'source_url', b.source_url,
    'factors', (select e.dimension_scores from vstudio.evaluations e
                where e.opportunity_id=b.id order by e.evaluated_at desc limit 1),
    'evidence_for', coalesce((select jsonb_agg(jsonb_build_object(
        'type', ev.evidence_type, 'title', ev.title,
        'url', ev.source_url, 'source', ev.source_name) order by ev.created_at)
      from vstudio.evidence ev where ev.opportunity_id=b.id), '[]'::jsonb),
    'evidence_against', coalesce((select jsonb_agg(jsonb_build_object(
        'mode', ea.failure_mode, 'statement', ea.statement, 'severity', ea.severity)
        order by ea.severity desc)
      from disco.evidence_against ea where ea.opportunity_id=b.id), '[]'::jsonb),
    'decision', (select d.decision::text from vstudio.decisions d
                 where d.opportunity_id=b.id order by d.decided_at desc limit 1)
  ) into r from disco.v_opportunity_board b where b.id = p_id;
  return coalesce(r, '{}'::jsonb);
end $fn$;
revoke execute on function public.hlvs_opportunity(uuid) from anon, public;
grant execute on function public.hlvs_opportunity(uuid) to authenticated;