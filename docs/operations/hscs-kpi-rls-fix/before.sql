-- Reproduces the hole: with the anon role and no login, the open state allows everything.
\set ON_ERROR_STOP on
begin; set local role anon;
select t.rows('select 1 from public.ltr_data', 2, 'BEFORE: anon can read ltr_data');
select t.rows('select 1 from public.kpi_spe_weekly', 1, 'BEFORE: anon can read driver KPI');
select t.affected('delete from public.kpi_sp_weekly', 1, 'BEFORE: anon can delete carrier KPI');
rollback;
begin; set local role anon; truncate public.ltr_data; rollback;
\echo BEFORE-STATE CONFIRMED: the open policy lets an anonymous caller read, delete and truncate.
