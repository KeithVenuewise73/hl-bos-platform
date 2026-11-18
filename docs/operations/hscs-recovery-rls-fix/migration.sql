-- Recovery module (unclaimed-property recovery): staff-only data, tightened public intake.
-- Target: legacy project bkfsjhhclbqrhaolvhmz ("Herman Legacy Business Platform").
-- STATUS: written and tested locally only. NOT APPLIED. Needs owner approval. Independent of the KPI and dpi fixes.
--
-- Before: six recovery_* tables had one policy "ALL ... TO authenticated USING true" (any signed-in user reads and writes
--   clients' tax ids, decedent details, claims and outreach); anon held every table privilege; storage bucket
--   'recovery-documents' (no size or type limit) let ANYONE upload anything, and any signed-in user read, replace or
--   delete every document. The two public intake tables accepted any column values from anonymous callers.
-- After:
--   * Staff = an ACTIVE hscs_glp member with role owner_ceo, contract_admin or operations_manager. PLACEHOLDER: who the
--     Recovery staff really are is an owner decision; change hscs_glp.is_recovery_staff() in one place.
--   * Tables, the compliance view and stored files are readable/writable by staff only.
--   * Anonymous visitors keep exactly two abilities: submit an intake row (recovery_clients, recovery_documents) with
--     safe values only, and upload a file under intake/ in the bucket (10 MB, PDF/JPEG/PNG/WebP/DOCX only).
--   * They cannot read anything back, so an insert that asks for the row back (RETURNING / return=representation) is refused.
--   * Text length limits on the columns anonymous callers can write.
-- Not solved here: the NUMBER of anonymous uploads (no rate limit in SQL). Move uploads behind a server-issued signed URL
-- with a captcha when the intake front-end is built.

begin;

create or replace function hscs_glp.is_recovery_staff()
returns boolean language sql stable security definer
set search_path = hscs_glp, public as $$
  select exists (
    select 1
      from hscs_glp.user_roles r
      join hscs_glp.organization_users ou
        on ou.user_id = r.user_id and ou.org_id = r.org_id and ou.status = 'active'
     where r.user_id = auth.uid()
       and r.role in ('owner_ceo','contract_admin','operations_manager')
  );
$$;
revoke all on function hscs_glp.is_recovery_staff() from public, anon;
grant execute on function hscs_glp.is_recovery_staff() to authenticated;

-- ---- tables: staff-only, plus the two public intake inserts ----
do $$
declare t text;
begin
  foreach t in array array['recovery_assets','recovery_claims','recovery_clients','recovery_documents','recovery_matches','recovery_outreach'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||' staff', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (hscs_glp.is_recovery_staff()) with check (hscs_glp.is_recovery_staff())', t||'_staff_all', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- public intake: clients
drop policy if exists "recovery_clients public intake" on public.recovery_clients;
drop policy if exists recovery_clients_public_intake on public.recovery_clients;
create policy recovery_clients_public_intake on public.recovery_clients for insert to anon, authenticated
  with check (coalesce(hp_field, '') = '' and status = 'prospect' and reviewer_notes is null);
grant insert on public.recovery_clients to anon;

-- public intake: documents (the row that describes an uploaded file)
drop policy if exists "recovery_documents public upload" on public.recovery_documents;
drop policy if exists recovery_documents_public_intake on public.recovery_documents;
create policy recovery_documents_public_intake on public.recovery_documents for insert to anon, authenticated
  with check (coalesce(hp_field, '') = '' and status = 'pending' and reviewer_notes is null
              and storage_bucket = 'recovery-documents' and claim_id is null and match_id is null
              and (storage_path is null or storage_path like 'intake/%'));
grant insert on public.recovery_documents to anon;

-- length limits on what anonymous callers can write (tables are empty, so these validate immediately)
alter table public.recovery_clients drop constraint if exists recovery_clients_text_limits;
alter table public.recovery_clients add constraint recovery_clients_text_limits check (
  length(coalesce(full_name,'')) <= 200 and length(coalesce(entity_name,'')) <= 200 and length(coalesce(contact_name,'')) <= 200
  and length(coalesce(email,'')) <= 320 and length(coalesce(phone,'')) <= 40 and length(coalesce(mailing_address,'')) <= 300
  and length(coalesce(city,'')) <= 100 and length(coalesce(state,'')) <= 50 and length(coalesce(zip,'')) <= 20
  and length(coalesce(business_type,'')) <= 100 and length(coalesce(tax_id,'')) <= 40 and length(coalesce(decedent_name,'')) <= 200
  and length(coalesce(relationship_to_decedent,'')) <= 100 and length(coalesce(role,'')) <= 100
  and length(coalesce(description,'')) <= 5000 and length(coalesce(source,'')) <= 100);
alter table public.recovery_documents drop constraint if exists recovery_documents_text_limits;
alter table public.recovery_documents add constraint recovery_documents_text_limits check (
  length(coalesce(document_type,'')) <= 50 and length(coalesce(storage_path,'')) <= 512 and length(coalesce(file_name,'')) <= 255
  and length(coalesce(content_type,'')) <= 100 and length(coalesce(uploaded_by_name,'')) <= 200
  and length(coalesce(uploaded_by_email,'')) <= 320 and length(coalesce(notes,'')) <= 2000);

-- compliance view: staff only (it runs with the caller's rights, so the table policies apply as well)
revoke all on public.recovery_compliance_exceptions from public, anon, authenticated;
grant select on public.recovery_compliance_exceptions to authenticated;

-- ---- stored files ----
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'recovery-documents';

drop policy if exists "recovery docs public upload" on storage.objects;
drop policy if exists "recovery docs staff read" on storage.objects;
drop policy if exists "recovery docs staff update" on storage.objects;
drop policy if exists "recovery docs staff delete" on storage.objects;
drop policy if exists recovery_docs_intake_upload on storage.objects;
drop policy if exists recovery_docs_staff_read on storage.objects;
drop policy if exists recovery_docs_staff_update on storage.objects;
drop policy if exists recovery_docs_staff_delete on storage.objects;

create policy recovery_docs_intake_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'recovery-documents' and name like 'intake/%');
create policy recovery_docs_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'recovery-documents' and hscs_glp.is_recovery_staff());
create policy recovery_docs_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'recovery-documents' and hscs_glp.is_recovery_staff())
  with check (bucket_id = 'recovery-documents' and hscs_glp.is_recovery_staff());
create policy recovery_docs_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recovery-documents' and hscs_glp.is_recovery_staff());

commit;
