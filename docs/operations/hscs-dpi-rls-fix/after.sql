\set ON_ERROR_STOP on
\set ceo   '00000000-0000-0000-0000-0000000000a1'
\set ops   '00000000-0000-0000-0000-0000000000a2'
\set ro    '00000000-0000-0000-0000-0000000000a3'
\set carr  '00000000-0000-0000-0000-0000000000a4'
\set inact '00000000-0000-0000-0000-0000000000a5'
\set strng '00000000-0000-0000-0000-0000000000a6'
\set fin   '00000000-0000-0000-0000-0000000000a7'
\set newdel 'insert into dpi.deliveries (delivery_id, date, market, dsp_name, driver_name) values (''N1'',''2026-02-01'',''m'',''d'',''x'')'

-- ---- anon (the public key) gets nothing ----
begin; set local role anon;
select t.denied('select * from dpi.deliveries', 'anon cannot read deliveries');
select t.denied('select * from dpi.surveys', 'anon cannot read surveys');
select t.denied('select * from dpi.drivers', 'anon cannot read drivers');
select t.denied('select * from dpi.dsp_companies', 'anon cannot read DSP contacts');
select t.denied(:'newdel', 'anon cannot insert a delivery');
select t.denied('insert into dpi.surveys (date, dsp_name, driver_name) values (''2026-02-01'',''d'',''x'')', 'anon cannot insert a survey');
select t.denied('update dpi.deliveries set notes = ''x''', 'anon cannot update');
select t.denied('delete from dpi.deliveries', 'anon cannot delete');
rollback;

-- ---- signed in but not staff ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'strng', true);
select t.rows('select 1 from dpi.deliveries', 0, 'stranger sees 0 deliveries');
select t.rows('select 1 from dpi.dsp_companies', 0, 'stranger sees 0 DSP contacts');
select t.denied(:'newdel', 'stranger cannot insert');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'carr', true);
select t.rows('select 1 from dpi.surveys', 0, 'carrier_user sees 0 surveys');
select t.denied(:'newdel', 'carrier_user cannot insert');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'inact', true);
select t.rows('select 1 from dpi.deliveries', 0, 'inactive owner_ceo sees 0 rows');
select t.denied(:'newdel', 'inactive owner_ceo cannot insert');
rollback;

-- ---- read-only roles ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ro', true);
select t.rows('select 1 from dpi.deliveries', 2, 'readonly_exec reads deliveries');
select t.rows('select 1 from dpi.surveys', 1, 'readonly_exec reads surveys');
select t.rows('select 1 from dpi.drivers', 1, 'readonly_exec reads drivers');
select t.rows('select 1 from dpi.dsp_companies', 1, 'readonly_exec reads DSPs');
select t.denied(:'newdel', 'readonly_exec cannot insert');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'fin', true);
select t.rows('select 1 from dpi.deliveries', 2, 'finance_manager reads');
select t.denied(:'newdel', 'finance_manager cannot insert');
rollback;

-- ---- the dashboard's writers: operations_manager ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ops', true);
select t.rows('select 1 from dpi.deliveries', 2, 'operations_manager reads');
select t.affected(:'newdel', 1, 'operations_manager inserts a delivery (default id works)');
select t.affected('insert into dpi.deliveries (delivery_id, date, market, dsp_name, driver_name) values (''D1'',''2026-01-04'',''m'',''d'',''x'') on conflict do nothing', 0, 'skip-duplicates insert is quietly ignored');
select t.affected('insert into dpi.surveys (delivery_id, date, dsp_name, driver_name, score, ltr_status) select id, ''2026-01-04'', ''d'', ''x'', 8, ''Passive'' from dpi.deliveries where delivery_id = ''D1''', 1, 'operations_manager inserts a survey linked to a delivery');
select t.affected('insert into dpi.dsp_companies (name) values (''New DSP'')', 1, 'operations_manager inserts a DSP');
select t.denied('update dpi.deliveries set notes = ''x''', 'operations_manager still cannot update (unchanged from today)');
select t.denied('delete from dpi.deliveries', 'operations_manager still cannot delete (unchanged from today)');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ceo', true);
select t.affected(:'newdel', 1, 'owner_ceo inserts');
select t.denied('delete from dpi.surveys', 'owner_ceo cannot delete via the API role');
select t.denied('truncate dpi.surveys', 'owner_ceo cannot truncate via the API role');
rollback;

\echo AFTER-STATE CONFIRMED: all assertions passed.
