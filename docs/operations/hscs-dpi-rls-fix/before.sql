\set ON_ERROR_STOP on
begin; set local role anon;
select t.rows('select 1 from dpi.deliveries', 2, 'BEFORE: anon reads deliveries');
select t.rows('select 1 from dpi.surveys', 1, 'BEFORE: anon reads surveys');
select t.rows('select contact_email from dpi.dsp_companies', 1, 'BEFORE: anon reads contact emails');
select t.affected('insert into dpi.deliveries (delivery_id, date, market, dsp_name, driver_name) values (''FAKE'',''2026-02-01'',''m'',''d'',''x'')', 1, 'BEFORE: anon inserts a fake delivery');
rollback;
\echo BEFORE-STATE CONFIRMED: anonymous callers can read the dpi tables and add rows.
