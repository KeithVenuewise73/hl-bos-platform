-- ===========================================================================
-- hlbos_0051_unknown_is_not_complete — forward-repair for 0049
--
-- WHAT WENT WRONG
--
-- `finish_run` decided 'completed' vs 'partially_completed' by asking whether
-- every weighted dimension had a dimension_scores ROW. It does not follow that
-- the dimension was assessed. A dimension recorded with confidence 'unknown'
-- has a row and NO score -- it is the schema's way of saying "we could not
-- reach this, and we will not guess". Counting that as completion made the run
-- claim it had finished work it had explicitly recorded itself unable to do.
--
-- Found by running the tool end to end for the first time. A shop whose site
-- refused the connection came back:
--
--     Riverside Barbers   score —   conf unknown   status COMPLETED
--
-- The report underneath was honest -- coverage said "0 of 1", the finding said
-- the site could not be read -- but the STATUS said completed, and a status is
-- what a portfolio list shows. Fifty shops summarised by a column that says
-- "completed" next to six shops nobody managed to look at is the dashboard
-- lying while the detail page tells the truth. Principle 10 does not exempt
-- the dashboard.
--
-- THE FIX
--
-- 'completed' now means every weighted dimension was actually ASSESSED: it has
-- a row AND that row is not 'unknown'. Anything else is 'partially_completed',
-- which is a true statement about a run that reached some dimensions and not
-- others.
--
-- `report()` follows the same definition: `unscored_dimensions` now names every
-- weighted dimension that produced no usable score -- whether it was never
-- recorded or was recorded as unreachable. A reader wants to know what the
-- composite does NOT cover; which of the two ways it failed to cover it is
-- already visible in the scorecard, where an 'unknown' row carries its note.
--
-- A SECOND, SMALLER CORRECTION IN THE SAME PASS
--
-- The same end-to-end run showed the report contradicting the analysis about
-- its own priorities. recommendFrom() ranks STRUCTURAL work first -- the gap
-- that costs the shop money and that the outreach hook is built on -- but
-- report() ordered by the priority enum, whose declaration order happens to be
-- ('quick_win','structural'), so every report led with "add a viewport tag"
-- and buried "customers cannot book you". The recommendation set was right and
-- its presentation inverted it. report() now orders structural first,
-- explicitly, so the report leads with what the hook leads with.
--
-- No data changes. Only two function bodies are replaced; the six existing
-- runs in the local build re-derive correctly because status is recomputed on
-- the next finish_run, and canonical production holds ZERO runs, so nothing
-- there needs restating.
--
-- rollback:
--   (Restore the 0049 bodies of transform_audit.finish_run(uuid, text) and
--    transform_audit.report(uuid) -- both are CREATE OR REPLACE, so reverting
--    is a re-apply of the previous definitions from migration 0049. Reverting
--    reinstates a run that calls itself complete without having assessed
--    anything, so this rollback is documented rather than recommended.)
-- ===========================================================================

create or replace function transform_audit.finish_run(p_run uuid, p_error text default null)
returns transform_audit.run_status language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_weights jsonb; v_unassessed integer; v_status transform_audit.run_status;
begin
  select r.tenant_id, r.weights into v_tenant, v_weights
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to finish an audit'
      using errcode = 'insufficient_privilege';
  end if;

  -- A weighted dimension counts as assessed only if it has a row that is NOT
  -- 'unknown'. Missing and unreachable are different reasons for the same
  -- fact: this run does not know.
  select pg_catalog.count(*) into v_unassessed
    from pg_catalog.jsonb_object_keys(v_weights) as k(dim)
   where not exists (
     select 1 from transform_audit.dimension_scores ds
      where ds.run_id = p_run
        and ds.dimension::text = k.dim
        and ds.confidence <> 'unknown');

  if p_error is not null then
    v_status := 'failed';
  elsif v_unassessed > 0 then
    v_status := 'partially_completed';
  else
    v_status := 'completed';
  end if;

  update transform_audit.runs r2
     set status = v_status, finished_at = now(), error = p_error
   where r2.id = p_run;

  perform events.emit('transform_audit.run.finished', v_tenant,
    jsonb_build_object('run', p_run, 'status', v_status,
                       'unassessed_dimensions', v_unassessed));
  return v_status;
end; $$;
comment on function transform_audit.finish_run(uuid, text) is
  '''completed'' means every weighted dimension was actually assessed. A dimension recorded ''unknown'' is one we could not reach, so a run carrying one is partially_completed.';
revoke all on function transform_audit.finish_run(uuid, text) from public, anon;
grant execute on function transform_audit.finish_run(uuid, text) to authenticated;

-- report(): same definition of "not covered".
create or replace function transform_audit.report(p_run uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_run transform_audit.runs%rowtype; v_result jsonb;
begin
  select * into v_run from transform_audit.runs where id = p_run;
  if v_run.id is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not (identity.has_permission(v_run.tenant_id, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this audit'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'shop', (select jsonb_build_object('business_name', p.business_name,
                                       'website_url', p.website_url,
                                       'city', p.city)
               from visibility.prospects p where p.id = v_run.prospect_id),
    'weights', v_run.weights,
    'coverage', jsonb_build_object('scored', v_run.dimensions_scored,
                                   'possible', v_run.dimensions_possible),
    'composite_score', v_run.composite_score,
    'scorecard', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dimension', ds.dimension, 'score', ds.score,
               'confidence', ds.confidence, 'rubric_version', ds.rubric_version,
               'note', ds.note) order by ds.dimension)
        from transform_audit.dimension_scores ds where ds.run_id = p_run), '[]'::jsonb),
    -- Every weighted dimension the composite does NOT cover: never recorded,
    -- or recorded as unreachable. The scorecard says which.
    'unscored_dimensions', coalesce((
      select jsonb_agg(k.dim order by k.dim)
        from pg_catalog.jsonb_object_keys(v_run.weights) as k(dim)
       where not exists (select 1 from transform_audit.dimension_scores ds
                          where ds.run_id = p_run
                            and ds.dimension::text = k.dim
                            and ds.confidence <> 'unknown')), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'dimension', f.dimension, 'statement', f.statement,
               'evidence_url', f.evidence_url, 'confidence', f.confidence,
               'severity', f.severity, 'detector', f.detector) order by f.id)
        from transform_audit.findings f where f.run_id = p_run), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'priority', rc.priority, 'rank', rc.rank, 'title', rc.title,
               'detail', rc.detail, 'capability_key', rc.capability_key,
               'addresses_finding_id', rc.addresses_finding_id)
             -- Structural first, EXPLICITLY. Ordering by the enum would lead
             -- with quick wins purely because of declaration order, which
             -- inverts the analysis's own ranking.
             order by (rc.priority <> 'structural'), rc.rank, rc.id)
        from transform_audit.recommendations rc where rc.run_id = p_run), '[]'::jsonb),
    'outreach_hook', v_run.outreach_hook
  ) into v_result;
  return v_result;
end; $$;
comment on function transform_audit.report(uuid) is
  'The full audit report as stored data. unscored_dimensions names every weighted dimension the composite does not cover -- never recorded, or recorded as unreachable. Recommendations lead with structural work, matching the outreach hook.';
revoke all on function transform_audit.report(uuid) from public, anon;
grant execute on function transform_audit.report(uuid) to authenticated;
