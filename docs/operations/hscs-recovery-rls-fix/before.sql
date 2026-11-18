\set ON_ERROR_STOP on
begin; set local role anon;
select t.affected('insert into storage.objects (bucket_id, name) values (''recovery-documents'', ''anywhere/evil.exe'')', 1, 'BEFORE: anon uploads any file anywhere in the bucket');
select t.affected('insert into public.recovery_clients (full_name, status, reviewer_notes) values (''x'', ''active'', ''forged'')', 1, 'BEFORE: anon inserts a client already marked active with forged notes');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a6', true);
select t.rows('select 1 from public.recovery_clients', 1, 'BEFORE: a signed-in stranger reads clients (tax ids, decedent details)');
select t.rows('select 1 from storage.objects where bucket_id = ''recovery-documents''', 1, 'BEFORE: a signed-in stranger sees stored documents');
select t.affected('delete from storage.objects where bucket_id = ''recovery-documents''', 1, 'BEFORE: a signed-in stranger deletes every stored document');
rollback;
\echo BEFORE-STATE CONFIRMED: Recovery data is open to any signed-in user and the bucket to anyone.
