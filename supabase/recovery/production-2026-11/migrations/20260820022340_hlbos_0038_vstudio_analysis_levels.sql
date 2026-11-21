create or replace function vstudio.set_analysis_levels()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer; v_version text := '2026-08-20-v1';
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

  with in_portfolio as (
    select distinct m.opportunity_id
    from vstudio.portfolio_members m
    join vstudio.portfolio_snapshots s on s.id = m.snapshot_id and s.is_current
    where m.opportunity_id is not null
  )
  update vstudio.opportunity_scores s
     set analysis_level = case when p.opportunity_id is not null then 2 else 1 end
    from (select s2.id, ip.opportunity_id
            from vstudio.opportunity_scores s2
            left join in_portfolio ip on ip.opportunity_id = s2.opportunity_id
           where s2.scoring_version = v_version
             and s2.analysis_level < 3) p
   where s.id = p.id
     and s.analysis_level <> case when p.opportunity_id is not null then 2 else 1 end;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;
revoke all on function vstudio.set_analysis_levels() from public, anon;
grant execute on function vstudio.set_analysis_levels() to authenticated;
comment on function vstudio.set_analysis_levels() is
  'Set analysis_level to 2 for opportunities in a CURRENT portfolio snapshot and back to 1 for those no longer in one. Levels 3 and 4 are never touched — they record human research, which no automated rebuild may undo.';