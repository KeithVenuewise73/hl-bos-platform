create or replace function public.hlvs_board_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v jsonb;
begin
  if not identity.has_platform_permission('vstudio.opportunity.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;

  select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(x order by x->>'v'),'[]'::jsonb) from (
        select jsonb_build_object('v',category,'n',count(*)) x
        from disco.assessments where category is not null
        group by category) c),
    'patterns', (select coalesce(jsonb_agg(x order by x->>'v'),'[]'::jsonb) from (
        select jsonb_build_object('v',search_pattern,'n',count(*)) x
        from disco.assessments where search_pattern is not null
        group by search_pattern) p),
    'sources', (select coalesce(jsonb_agg(x order by x->>'v'),'[]'::jsonb) from (
        select jsonb_build_object('v',source_type,'n',count(*)) x
        from vstudio.opportunities where source_type is not null
        group by source_type) s),
    'languages', (select coalesce(jsonb_agg(x order by (x->>'n')::int desc),'[]'::jsonb) from (
        select jsonb_build_object('v',repo_language,'n',count(*)) x
        from disco.assessments where repo_language is not null
        group by repo_language) l),
    'licenses', (select coalesce(jsonb_agg(x order by (x->>'n')::int desc),'[]'::jsonb) from (
        select jsonb_build_object('v',repo_license,'n',count(*)) x
        from disco.assessments where repo_license is not null
        group by repo_license) li),
    'archived_counts', (select jsonb_build_object(
        'all', count(*),
        'archived', count(*) filter (where repo_archived is true),
        'active', count(*) filter (where coalesce(repo_archived,false) is false))
        from disco.assessments)
  ) into v;
  return v;
end $function$;

revoke all on function public.hlvs_board_facets() from public, anon;
grant execute on function public.hlvs_board_facets() to authenticated;