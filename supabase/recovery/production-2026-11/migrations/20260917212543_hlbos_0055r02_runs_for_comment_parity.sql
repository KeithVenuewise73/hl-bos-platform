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