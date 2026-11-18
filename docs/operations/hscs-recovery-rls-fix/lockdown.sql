-- OPTIONAL ADD-ON, applied AFTER migration.sql: close anonymous intake completely until the intake front-end exists.
-- After this, only Recovery staff can insert into the Recovery tables or upload to the bucket. Reopen later by re-running the
-- "public intake" sections of migration.sql.
begin;
drop policy if exists recovery_clients_public_intake on public.recovery_clients;
drop policy if exists recovery_documents_public_intake on public.recovery_documents;
revoke insert on public.recovery_clients, public.recovery_documents from anon;
drop policy if exists recovery_docs_intake_upload on storage.objects;
commit;
