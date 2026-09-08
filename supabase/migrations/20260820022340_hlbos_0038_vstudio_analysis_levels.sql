-- ===========================================================================
-- hlbos_0038_vstudio_analysis_levels — make the staged-analysis counts true
--
-- PURELY ADDITIVE: one function. No schema change, no data loss.
--
-- The Executive Overview reports how many records have reached each analysis
-- level, and those numbers have to be facts rather than labels. Level 1 was
-- being recorded honestly by the triage run, but Level 2 — "qualified into a
-- portfolio" — was never written, so the front page showed 0 while four
-- hundred records sat in current Top-100 snapshots. A count that is quietly
-- wrong is worse than no count.
--
-- WHY LEVELS CAN GO DOWN AS WELL AS UP
--
-- Level 2 means "is currently in a portfolio", not "was once in one". If a
-- rebuild drops a record out, its level returns to 1: the corpus record and
-- its Level-1 scores are untouched, but claiming it is still under portfolio
-- analysis would be false. Levels 3 and 4 are never touched here — those are
-- set by human research and executive diligence, and no automated rebuild may
-- quietly undo a person's work.
--
-- rollback: (manual, pre-approval only)
--   DROP FUNCTION IF EXISTS vstudio.set_analysis_levels();
--
-- VERIFICATION (after apply): vstudio.set_analysis_levels() returns the number
--   of score rows whose level changed; afterwards the count at level 2 equals
--   the number of DISTINCT opportunities across all current portfolio
--   snapshots. pgTAP: supabase/tests/38_vstudio_analysis_levels.sql.
-- ===========================================================================

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
             -- Never demote human work.
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
