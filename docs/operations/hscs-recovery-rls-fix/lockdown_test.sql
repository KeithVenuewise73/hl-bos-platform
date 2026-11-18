\set ON_ERROR_STOP on
begin; set local role anon;
select t.refused('insert into public.recovery_clients (full_name, email) values (''Jane'',''j@example.test'')', 'LOCKDOWN: anon cannot submit an intake client');
select t.refused('insert into public.recovery_documents (document_type, storage_path) values (''other'',''intake/a/a.pdf'')', 'LOCKDOWN: anon cannot submit an intake document row');
select t.refused('insert into storage.objects (bucket_id, name) values (''recovery-documents'',''intake/a/new.pdf'')', 'LOCKDOWN: anon cannot upload even under intake/');
select t.denied('select * from public.recovery_clients', 'LOCKDOWN: anon still cannot read');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6', true);
select t.refused('insert into public.recovery_clients (full_name) values (''x'')', 'LOCKDOWN: a signed-in stranger cannot insert a client');
select t.refused('insert into storage.objects (bucket_id, name) values (''recovery-documents'',''intake/a/new.pdf'')', 'LOCKDOWN: a signed-in stranger cannot upload');
select t.rows('select 1 from public.recovery_clients', 0, 'LOCKDOWN: stranger still sees 0 clients');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', true);
select t.affected('insert into public.recovery_clients (full_name) values (''Staff entered'')', 1, 'LOCKDOWN: owner_ceo can still insert a client');
select t.affected('insert into storage.objects (bucket_id, name) values (''recovery-documents'',''staff/ok.pdf'')', 1, 'LOCKDOWN: owner_ceo can still upload');
select t.rows('select 1 from public.recovery_clients', 2, 'LOCKDOWN: owner_ceo still reads clients');
rollback;
\echo LOCKDOWN CONFIRMED.
