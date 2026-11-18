\set ON_ERROR_STOP on
\set ceo   '00000000-0000-0000-0000-0000000000a1'
\set ops   '00000000-0000-0000-0000-0000000000a2'
\set ro    '00000000-0000-0000-0000-0000000000a3'
\set carr  '00000000-0000-0000-0000-0000000000a4'
\set inact '00000000-0000-0000-0000-0000000000a5'
\set strng '00000000-0000-0000-0000-0000000000a6'
\set fin   '00000000-0000-0000-0000-0000000000a7'
\set okclient  'insert into public.recovery_clients (full_name, email) values (''Jane Test'',''jane@example.test'')'
\set okdoc     'insert into public.recovery_documents (document_type, storage_path, file_name) values (''authorization'', ''intake/abc/a.pdf'', ''a.pdf'')'
\set okobj     'insert into storage.objects (bucket_id, name) values (''recovery-documents'', ''intake/abc/new.pdf'')'

-- ================= anonymous visitor =================
begin; set local role anon;
select t.denied('select * from public.recovery_clients', 'anon cannot read clients');
select t.denied('select * from public.recovery_documents', 'anon cannot read documents');
select t.denied('select * from public.recovery_assets', 'anon cannot read assets');
select t.denied('select * from public.recovery_claims', 'anon cannot read claims');
select t.denied('select * from public.recovery_matches', 'anon cannot read matches');
select t.denied('select * from public.recovery_outreach', 'anon cannot read outreach');
select t.denied('select * from public.recovery_compliance_exceptions', 'anon cannot read the compliance view');
select t.denied('update public.recovery_clients set status = ''active''', 'anon cannot update clients');
select t.denied('delete from public.recovery_clients', 'anon cannot delete clients');
select t.denied('insert into public.recovery_assets (holder_name) values (''x'')', 'anon cannot insert assets');
select t.denied('insert into public.recovery_claims (status) values (''recovered'')', 'anon cannot insert claims');
select t.denied('insert into public.recovery_outreach (match_id) select id from public.recovery_matches', 'anon cannot insert outreach');
rollback;
-- intake that is allowed
begin; set local role anon;
select t.affected(:'okclient', 1, 'anon can submit an intake client (safe values)');
select t.affected(:'okdoc', 1, 'anon can submit an intake document row');
select t.affected(:'okobj', 1, 'anon can upload under intake/');
rollback;
-- intake that is refused
begin; set local role anon;
select t.refused('insert into public.recovery_clients (full_name, hp_field) values (''bot'', ''http://spam'')', 'anon intake with the honeypot filled is refused');
select t.refused('insert into public.recovery_clients (full_name, status) values (''x'', ''active'')', 'anon cannot set status to active');
select t.refused('insert into public.recovery_clients (full_name, status) values (''x'', ''signed'')', 'anon cannot set status to signed');
select t.refused('insert into public.recovery_clients (full_name, reviewer_notes) values (''x'', ''approved by staff'')', 'anon cannot forge reviewer notes');
select t.refused('insert into public.recovery_clients (full_name, description) values (''x'', repeat(''a'', 5001))', 'anon cannot send a 5001-character description');
select t.refused('insert into public.recovery_clients (full_name) values (repeat(''n'', 201))', 'anon cannot send a 201-character name');
select t.refused('insert into public.recovery_documents (status) values (''approved'')', 'anon cannot mark a document approved');
select t.refused('insert into public.recovery_documents (storage_bucket) values (''glp-documents'')', 'anon cannot point a document at another bucket');
select t.refused('insert into public.recovery_documents (storage_path) values (''org/secret.pdf'')', 'anon cannot point a document outside intake/');
select t.refused('insert into public.recovery_documents (claim_id) select id from public.recovery_claims', 'anon cannot attach a document to a claim') ;
select t.refused('insert into public.recovery_documents (notes) values (repeat(''a'', 2001))', 'anon cannot send 2001-character notes');
select t.refused('insert into storage.objects (bucket_id, name) values (''recovery-documents'', ''staff/overwrite.pdf'')', 'anon cannot upload outside intake/');
select t.refused('insert into storage.objects (bucket_id, name) values (''glp-documents'', ''intake/x.pdf'')', 'anon cannot upload to another bucket');
rollback;
begin; set local role anon;
select t.rows('select 1 from storage.objects', 0, 'anon sees 0 stored files');
select t.affected('update storage.objects set name = ''intake/hijack.pdf''', 0, 'anon cannot rename stored files');
select t.affected('delete from storage.objects', 0, 'anon cannot delete stored files');
-- an insert that asks for the row back needs read access, which anon no longer has
select t.refused('insert into public.recovery_clients (full_name) values (''x'') returning id', 'anon intake that asks for the row back is refused (documented side effect)');
rollback;

-- ================= signed in, but not Recovery staff =================
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'strng', true);
select t.rows('select 1 from public.recovery_clients', 0, 'stranger sees 0 clients');
select t.rows('select 1 from public.recovery_claims', 0, 'stranger sees 0 claims');
select t.rows('select 1 from public.recovery_compliance_exceptions', 0, 'stranger sees 0 compliance rows');
select t.rows('select 1 from storage.objects where bucket_id = ''recovery-documents''', 0, 'stranger sees 0 stored documents');
select t.affected('delete from storage.objects where bucket_id = ''recovery-documents''', 0, 'stranger deletes 0 stored documents');
select t.affected('update public.recovery_clients set status = ''active''', 0, 'stranger updates 0 clients');
select t.refused('insert into public.recovery_assets (holder_name) values (''x'')', 'stranger cannot insert assets');
select t.refused('insert into storage.objects (bucket_id, name) values (''recovery-documents'', ''clients/abc/evil.pdf'')', 'stranger cannot upload outside intake/');
select t.rows('select 1 from storage.objects where bucket_id = ''glp-documents''', 1, 'the other bucket''s own policy is untouched (replica policy is open on purpose)');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'carr', true);
select t.rows('select 1 from public.recovery_clients', 0, 'carrier_user sees 0 clients');
select t.refused('insert into public.recovery_claims (status) values (''recovered'')', 'carrier_user cannot insert claims');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'inact', true);
select t.rows('select 1 from public.recovery_clients', 0, 'inactive owner_ceo sees 0 clients');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ro', true);
select t.rows('select 1 from public.recovery_clients', 0, 'readonly_exec is not Recovery staff: sees 0 clients');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'fin', true);
select t.rows('select 1 from public.recovery_outreach', 0, 'finance_manager is not Recovery staff: sees 0 outreach');
rollback;

-- ================= staff (owner_ceo, operations_manager) =================
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ceo', true);
select t.rows('select 1 from public.recovery_clients', 1, 'owner_ceo reads clients');
select t.rows('select 1 from public.recovery_documents', 1, 'owner_ceo reads documents');
select t.rows('select 1 from public.recovery_outreach', 1, 'owner_ceo reads outreach');
select t.rows('select 1 from storage.objects where bucket_id = ''recovery-documents''', 1, 'owner_ceo reads stored documents');
select t.affected('update public.recovery_clients set status = ''signed''', 1, 'owner_ceo updates a client');
select t.affected('insert into public.recovery_assets (holder_name) values (''New Holder'')', 1, 'owner_ceo inserts an asset');
select t.affected('update storage.objects set name = ''intake/fixture/renamed.pdf'' where bucket_id = ''recovery-documents''', 1, 'owner_ceo renames a stored document');
select t.affected('delete from storage.objects where bucket_id = ''recovery-documents''', 1, 'owner_ceo deletes a stored document');
select t.affected('delete from public.recovery_outreach', 1, 'owner_ceo deletes outreach');
select t.rows('select 1 from public.recovery_compliance_exceptions', 0, 'owner_ceo can query the compliance view');
select t.refused('truncate public.recovery_clients', 'owner_ceo cannot truncate');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ops', true);
select t.rows('select 1 from public.recovery_claims', 1, 'operations_manager reads claims');
select t.affected('update public.recovery_claims set notes = ''n''', 1, 'operations_manager updates a claim');
rollback;

-- ================= staff uploads outside intake/ (found missing by the lockdown test) =================
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ceo', true);
select t.affected('insert into storage.objects (bucket_id, name) values (''recovery-documents'', ''clients/abc/staff-upload.pdf'')', 1, 'owner_ceo uploads a document outside intake/');
rollback;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'ops', true);
select t.affected('insert into storage.objects (bucket_id, name) values (''recovery-documents'', ''clients/abc/ops-upload.pdf'')', 1, 'operations_manager uploads a document outside intake/');
rollback;

-- ================= server role and bucket settings =================
begin; set local role service_role;
select t.rows('select 1 from public.recovery_clients', 1, 'service_role still reads clients');
rollback;
do $$ declare b storage.buckets; begin
  select * into b from storage.buckets where id = 'recovery-documents';
  if b.file_size_limit is distinct from 10485760 then raise exception 'FAIL  bucket size limit is %', b.file_size_limit; end if;
  if b.allowed_mime_types is null or array_length(b.allowed_mime_types, 1) <> 5 then raise exception 'FAIL  bucket mime list is %', b.allowed_mime_types; end if;
  raise notice 'PASS  bucket has a 10 MB limit and a 5-type allowlist';
  select * into b from storage.buckets where id = 'glp-documents';
  if b.file_size_limit is not null then raise exception 'FAIL  glp-documents bucket was changed'; end if;
  raise notice 'PASS  the other bucket was left alone';
end $$;
\echo AFTER-STATE CONFIRMED: all assertions passed.
