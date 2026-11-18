\set ON_ERROR_STOP on
\set ceo   '00000000-0000-0000-0000-0000000000a1'
\set ops   '00000000-0000-0000-0000-0000000000a2'
\set ro    '00000000-0000-0000-0000-0000000000a3'
\set carr  '00000000-0000-0000-0000-0000000000a4'
\set inact '00000000-0000-0000-0000-0000000000a5'
\set strng '00000000-0000-0000-0000-0000000000a6'
\set fin   '00000000-0000-0000-0000-0000000000a7'

-- ---- anon (the public key) gets nothing ----
begin; set local role anon;
select t.denied('select * from public.ltr_data', 'anon cannot read ltr_data');
select t.denied('select * from public.kpi_sp_weekly', 'anon cannot read carrier KPI');
select t.denied('select * from public.kpi_spe_weekly', 'anon cannot read driver KPI');
select t.denied('insert into public.ltr_data (store_number) values (''x'')', 'anon cannot insert');
select t.denied('update public.kpi_sp_weekly set carrier = ''x''', 'anon cannot update');
select t.denied('delete from public.kpi_spe_weekly', 'anon cannot delete');
select t.denied('truncate public.ltr_data', 'anon cannot truncate');
select t.denied('select hscs_glp.is_kpi_reader()', 'anon cannot call reader helper');
rollback;

-- ---- signed in but not staff: sees and changes nothing ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'strng', true);
select t.rows('select 1 from public.ltr_data', 0, 'stranger sees 0 ltr rows');
select t.rows('select 1 from public.kpi_spe_weekly', 0, 'stranger sees 0 driver rows');
select t.denied('insert into public.ltr_data (store_number) values (''x'')', 'stranger cannot insert');
select t.affected('delete from public.kpi_sp_weekly', 0, 'stranger deletes 0 rows');
select t.affected('update public.kpi_sp_weekly set carrier=''x''', 0, 'stranger updates 0 rows');
rollback;

-- carrier_user and an inactive member are not staff either
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'carr', true);
select t.rows('select 1 from public.ltr_data', 0, 'carrier_user sees 0 rows');
select t.denied('insert into public.kpi_sp_weekly (carrier) values (''x'')', 'carrier_user cannot insert');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'inact', true);
select t.rows('select 1 from public.ltr_data', 0, 'inactive owner_ceo sees 0 rows');
select t.denied('insert into public.ltr_data (store_number) values (''x'')', 'inactive owner_ceo cannot insert');
rollback;

-- ---- read-only roles read but cannot change ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ro', true);
select t.rows('select 1 from public.ltr_data', 2, 'readonly_exec reads ltr_data');
select t.rows('select 1 from public.kpi_spe_weekly', 1, 'readonly_exec reads driver KPI');
select t.denied('insert into public.ltr_data (store_number) values (''x'')', 'readonly_exec cannot insert');
select t.affected('delete from public.ltr_data', 0, 'readonly_exec deletes 0 rows');
select t.affected('update public.ltr_data set carrier=''x''', 0, 'readonly_exec updates 0 rows');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'fin', true);
select t.rows('select 1 from public.kpi_sp_weekly', 1, 'finance_manager reads');
select t.denied('insert into public.kpi_sp_weekly (carrier) values (''x'')', 'finance_manager cannot insert');
rollback;

-- ---- the dashboard's own upload: delete all, then insert (operations_manager) ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ops', true);
select t.rows('select 1 from public.ltr_data', 2, 'operations_manager reads');
select t.affected('delete from public.ltr_data', 2, 'operations_manager clears old ltr rows');
select t.affected('insert into public.ltr_data (store_number, ltr_score) values (''9'',10),(''8'',9)', 2, 'operations_manager uploads new ltr rows (sequence usable)');
select t.affected('update public.kpi_sp_weekly set routes = 6', 1, 'operations_manager updates');
select t.denied('truncate public.ltr_data', 'operations_manager cannot truncate');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ceo', true);
select t.affected('delete from public.kpi_spe_weekly', 1, 'owner_ceo deletes');
select t.denied('truncate public.kpi_sp_weekly', 'owner_ceo cannot truncate via API role');
rollback;

-- ---- service_role (server-side) is unaffected ----
begin; set local role service_role;
select t.rows('select 1 from public.ltr_data', 2, 'service_role still reads');
rollback;
\echo AFTER-STATE CONFIRMED: all assertions passed.
