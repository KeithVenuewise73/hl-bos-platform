create or replace function public.hlvs_board_page(
  p_limit      int     default 50,
  p_offset     int     default 0,
  p_category   text[]  default null,
  p_pattern    text[]  default null,
  p_source     text[]  default null,
  p_archived   text    default 'all',
  p_license    text[]  default null,
  p_language   text[]  default null,
  p_search     text    default null,
  p_sort       text    default 'discovered_desc'
) returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_total    bigint;
  v_filtered bigint;
  v_rows     jsonb;
  v_limit    int := least(greatest(coalesce(p_limit,50),1), 250);
  v_offset   int := greatest(coalesce(p_offset,0),0);
  v_q        text := nullif(btrim(coalesce(p_search,'')),'');
begin
  if not identity.has_platform_permission('vstudio.opportunity.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;

  select count(*) into v_total from vstudio.opportunities;

  -- Single filtered CTE reused for the count and the page slice.
  with filtered as (
    select o.id, o.title, o.summary, o.status, o.source_url, o.source_type,
           o.created_at, o.discovery_date,
           a.category, a.search_pattern, a.score_net, a.confidence,
           a.repo_stars, a.repo_forks, a.repo_open_issues, a.repo_language,
           a.repo_license, a.repo_archived, a.repo_pushed_at, a.repo_topics
    from vstudio.opportunities o
    left join disco.assessments a on a.opportunity_id = o.id
    where (p_category is null or a.category        = any(p_category))
      and (p_pattern  is null or a.search_pattern  = any(p_pattern))
      and (p_source   is null or o.source_type     = any(p_source))
      and (p_license  is null or a.repo_license    = any(p_license))
      and (p_language is null or a.repo_language   = any(p_language))
      and (p_archived = 'all'
           or (p_archived = 'archived' and a.repo_archived is true)
           or (p_archived = 'active'   and coalesce(a.repo_archived,false) is false))
      and (v_q is null or o.title ilike '%'||v_q||'%' or o.summary ilike '%'||v_q||'%')
  )
  select count(*) into v_filtered from filtered;

  with filtered as (
    select o.id, o.title, o.summary, o.status, o.source_url, o.source_type,
           o.created_at, o.discovery_date,
           a.category, a.search_pattern, a.score_net, a.confidence,
           a.repo_stars, a.repo_forks, a.repo_open_issues, a.repo_language,
           a.repo_license, a.repo_archived, a.repo_pushed_at, a.repo_topics
    from vstudio.opportunities o
    left join disco.assessments a on a.opportunity_id = o.id
    where (p_category is null or a.category        = any(p_category))
      and (p_pattern  is null or a.search_pattern  = any(p_pattern))
      and (p_source   is null or o.source_type     = any(p_source))
      and (p_license  is null or a.repo_license    = any(p_license))
      and (p_language is null or a.repo_language   = any(p_language))
      and (p_archived = 'all'
           or (p_archived = 'archived' and a.repo_archived is true)
           or (p_archived = 'active'   and coalesce(a.repo_archived,false) is false))
      and (v_q is null or o.title ilike '%'||v_q||'%' or o.summary ilike '%'||v_q||'%')
  ),
  page as (
    select * from filtered
    order by
      case when p_sort='stars_desc'      then repo_stars end desc nulls last,
      case when p_sort='stars_asc'       then repo_stars end asc  nulls last,
      case when p_sort='issues_desc'     then repo_open_issues end desc nulls last,
      case when p_sort='pushed_desc'     then repo_pushed_at end desc nulls last,
      case when p_sort='score_desc'      then score_net end desc nulls last,
      case when p_sort='category_asc'    then category end asc nulls last,
      case when p_sort='discovered_desc' then created_at end desc nulls last,
      created_at desc, id
    limit v_limit offset v_offset
  )
  -- Evidence counts computed ONLY for the rows on this page.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'summary', p.summary,
           'status', p.status, 'url', p.source_url, 'source', p.source_type,
           'category', p.category, 'pattern', p.search_pattern,
           'net', p.score_net, 'confidence', p.confidence,
           'stars', p.repo_stars, 'forks', p.repo_forks,
           'issues', p.repo_open_issues, 'language', p.repo_language,
           'license', p.repo_license, 'archived', p.repo_archived,
           'pushed_at', p.repo_pushed_at, 'topics', p.repo_topics,
           'discovered', p.created_at,
           'ef', (select count(*) from vstudio.evidence ev where ev.opportunity_id=p.id),
           'ea', (select count(*) from disco.evidence_against ea where ea.opportunity_id=p.id)
         ) order by p.rn), '[]'::jsonb)
    into v_rows
  from (select page.*, row_number() over () as rn from page) p;

  return jsonb_build_object(
    'total', v_total,
    'filtered', v_filtered,
    'limit', v_limit,
    'offset', v_offset,
    'sort', p_sort,
    'rows', v_rows
  );
end $function$;

revoke all on function public.hlvs_board_page(int,int,text[],text[],text[],text,text[],text[],text,text) from public, anon;
grant execute on function public.hlvs_board_page(int,int,text[],text[],text[],text,text[],text[],text,text) to authenticated;