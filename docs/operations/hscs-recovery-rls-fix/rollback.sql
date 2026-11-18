-- Rollback for migration.sql. THIS REOPENS THE HOLES (any signed-in user reads/writes all Recovery data; anyone can upload
-- anything to the bucket). Bucket limits are left in place; remove them in the dashboard if they must go.
begin;
do $$
declare t text;
begin
  foreach t in array array['recovery_assets','recovery_claims','recovery_clients','recovery_documents','recovery_matches','recovery_outreach'] loop
    execute format('drop policy if exists %I on public.%I', t||'_staff_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t||' staff', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;
drop policy if exists recovery_clients_public_intake on public.recovery_clients;
create policy "recovery_clients public intake" on public.recovery_clients for insert to public with check (coalesce(hp_field, '') = '');
drop policy if exists recovery_documents_public_intake on public.recovery_documents;
create policy "recovery_documents public upload" on public.recovery_documents for insert to public with check (coalesce(hp_field, '') = '');
alter table public.recovery_clients drop constraint if exists recovery_clients_text_limits;
alter table public.recovery_documents drop constraint if exists recovery_documents_text_limits;
grant all on public.recovery_compliance_exceptions to anon, authenticated;
drop policy if exists recovery_docs_intake_upload on storage.objects;
drop policy if exists recovery_docs_staff_insert on storage.objects;
drop policy if exists recovery_docs_staff_read on storage.objects;
drop policy if exists recovery_docs_staff_update on storage.objects;
drop policy if exists recovery_docs_staff_delete on storage.objects;
create policy "recovery docs public upload" on storage.objects for insert to public with check (bucket_id = 'recovery-documents');
create policy "recovery docs staff read" on storage.objects for select to authenticated using (bucket_id = 'recovery-documents');
create policy "recovery docs staff update" on storage.objects for update to authenticated using (bucket_id = 'recovery-documents');
create policy "recovery docs staff delete" on storage.objects for delete to authenticated using (bucket_id = 'recovery-documents');
drop function if exists hscs_glp.is_recovery_staff();
commit;
