-- LOCAL replica of the live Recovery objects: columns, policies, ACLs and bucket copied from live metadata. Fake rows only.
-- Simplifications (stated): the two enforcement triggers are omitted (not what is under test); the storage schema is a minimal
-- emulation of Supabase Storage's tables (the real Storage API also enforces size/type limits, which cannot be tested here).
-- Needs ../hscs-kpi-rls-fix/replica.sql loaded first (roles, auth.uid, hscs_glp, fixtures).
create table public.recovery_assets (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), status text not null default 'discovered',
  source_url text, source_state text, external_id text, holder_name text, property_type text, owner_name text, last_known_address text,
  estimated_value numeric, currency text not null default 'USD', raw_result jsonb, discovered_at timestamptz not null default now(),
  discovery_method text default 'ai_search', reviewer_notes text);
create table public.recovery_clients (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), status text not null default 'prospect',
  client_type text not null default 'individual', full_name text, entity_name text, contact_name text, email text, phone text, mailing_address text,
  city text, state text, zip text, business_type text, tax_id text, decedent_name text, decedent_date_of_death date, relationship_to_decedent text,
  role text, description text, consent_contact boolean not null default false, acknowledged_free_option boolean not null default false,
  source text, reviewer_notes text, hp_field text);
create table public.recovery_matches (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  asset_id uuid not null references public.recovery_assets(id) on delete cascade, client_id uuid references public.recovery_clients(id) on delete set null,
  prospect_name text, confidence_score numeric, match_reasons text, match_factors jsonb, status text not null default 'pending_ai',
  approved_for_outreach boolean not null default false, reviewed_by text, reviewed_at timestamptz, reviewer_notes text);
create table public.recovery_claims (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  client_id uuid references public.recovery_clients(id) on delete set null, asset_id uuid references public.recovery_assets(id) on delete set null,
  match_id uuid references public.recovery_matches(id) on delete set null, status text not null default 'preparing', state_reference_number text,
  claim_amount numeric, recovered_amount numeric, success_fee_pct numeric, success_fee_amount numeric, invoice_status text not null default 'not_invoiced',
  invoice_number text, submitted_at timestamptz, recovered_at timestamptz, notes text, reviewer_notes text);
create table public.recovery_documents (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  client_id uuid references public.recovery_clients(id) on delete set null, claim_id uuid references public.recovery_claims(id) on delete set null,
  match_id uuid references public.recovery_matches(id) on delete set null, document_type text not null default 'other',
  storage_bucket text not null default 'recovery-documents', storage_path text, file_name text, content_type text, uploaded_by_name text,
  uploaded_by_email text, status text not null default 'pending', notes text, reviewer_notes text, hp_field text);
create table public.recovery_outreach (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  match_id uuid not null references public.recovery_matches(id) on delete cascade, client_id uuid references public.recovery_clients(id) on delete set null,
  channel text not null default 'email', status text not null default 'draft', template text, content text, scheduled_at timestamptz, sent_at timestamptz,
  response_notes text, created_by text);
create view public.recovery_compliance_exceptions with (security_invoker = on) as
  select 'fee_above_cap'::text as exception_type, 'warning'::text as severity, 'recovery_claims'::text as entity_table, c.id as entity_id,
         'Success fee above cap'::text as detail, c.created_at from public.recovery_claims c where coalesce(c.success_fee_pct,0) > 10;

-- live before-state: staff policy "ALL ... TO authenticated USING true", anon holds everything
do $$ declare t text; begin
  foreach t in array array['recovery_assets','recovery_claims','recovery_clients','recovery_documents','recovery_matches','recovery_outreach'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t||' staff', t);
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
  end loop; end $$;
create policy "recovery_clients public intake" on public.recovery_clients for insert to public with check (coalesce(hp_field,'') = '');
create policy "recovery_documents public upload" on public.recovery_documents for insert to public with check (coalesce(hp_field,'') = '');
grant all on public.recovery_compliance_exceptions to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid, created_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
insert into storage.buckets (id, name, public) values ('recovery-documents','recovery-documents',false),('glp-documents','glp-documents',false);
create policy "recovery docs public upload" on storage.objects for insert to public with check (bucket_id = 'recovery-documents');
create policy "recovery docs staff read" on storage.objects for select to authenticated using (bucket_id = 'recovery-documents');
create policy "recovery docs staff update" on storage.objects for update to authenticated using (bucket_id = 'recovery-documents');
create policy "recovery docs staff delete" on storage.objects for delete to authenticated using (bucket_id = 'recovery-documents');
-- an unrelated bucket's policy, to prove the migration leaves other buckets alone
create policy glp_docs_read on storage.objects for select to authenticated using (bucket_id = 'glp-documents');

-- fixtures (fake)
insert into public.recovery_assets (holder_name, owner_name) values ('Fake Holder','Fake Owner');
insert into public.recovery_clients (full_name, email, tax_id) values ('Fake Client','fake@example.test','000-00-0000');
insert into public.recovery_matches (asset_id, prospect_name) select id, 'Fake Prospect' from public.recovery_assets;
insert into public.recovery_claims (client_id, asset_id, status) select c.id, a.id, 'preparing' from public.recovery_clients c, public.recovery_assets a;
insert into public.recovery_documents (client_id, file_name, storage_path) select id, 'a.pdf', 'intake/fixture/a.pdf' from public.recovery_clients;
insert into public.recovery_outreach (match_id, content) select id, 'draft text' from public.recovery_matches;
insert into storage.objects (bucket_id, name) values ('recovery-documents','intake/fixture/a.pdf'),('glp-documents','org/x.pdf');
