-- HLG Revenue Center 0001: core schema, tenancy, row level security.
-- Port of the BTI D1 contract (discovery_prospects, discovery_runs,
-- crm_businesses, crm_review_jobs, service_offers) plus catalog, proposals
-- and follow-ups. Text primary keys are kept on migrated tables so legacy
-- IDs (discovery_..., crm_..., review_...) survive import unchanged.
-- Portable: lives in schema "revenue", so it works in a dedicated project or
-- beside other schemas. NOT applied anywhere; see docs/revenue-center/HANDOFF.md.

create schema if not exists revenue;
revoke all on schema revenue from public, anon;
grant usage on schema revenue to authenticated, service_role;

-- ---------------------------------------------------------------- tenancy
create table revenue.organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name       text not null,
  created_at timestamptz not null default now()
);

create table revenue.organization_members (
  organization_id uuid not null references revenue.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner','member','viewer')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on revenue.organization_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies can read membership without
-- recursing into the members table's own policies.
create function revenue.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from revenue.organization_members m
                 where m.organization_id = org and m.user_id = (select auth.uid()));
$$;
create function revenue.can_write(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from revenue.organization_members m
                 where m.organization_id = org and m.user_id = (select auth.uid())
                   and m.role in ('owner','member'));
$$;
revoke all on function revenue.is_member(uuid), revenue.can_write(uuid) from public, anon;
grant execute on function revenue.is_member(uuid), revenue.can_write(uuid) to authenticated, service_role;

-- -------------------------------------------------------------- discovery
create table revenue.discovery_prospects (
  id              text not null,
  organization_id uuid not null references revenue.organizations(id) on delete cascade,
  sector          text not null,
  identity_key    text not null,
  name_key        text not null,
  host_key        text not null,
  data            jsonb not null,                       -- was data_json
  disposition     text not null check (disposition in ('active','reserve','excluded')),
  origin          text not null,
  removal_reason  text not null default '',
  review          text not null default 'Unreviewed',
  created_at      timestamptz not null,
  updated_at      timestamptz not null,
  primary key (organization_id, id),
  unique (organization_id, sector, identity_key)        -- was discovery_identity
);
create index discovery_prospects_pool_idx
  on revenue.discovery_prospects (organization_id, sector, disposition);
create index discovery_prospects_host_idx
  on revenue.discovery_prospects (organization_id, sector, host_key) where host_key <> '';

create table revenue.discovery_runs (
  id              text not null,
  organization_id uuid not null references revenue.organizations(id) on delete cascade,
  started_at      timestamptz not null,
  completed_at    timestamptz not null,
  added           integer not null check (added >= 0),
  skipped         integer not null check (skipped >= 0),
  summary         text not null,
  primary key (organization_id, id)
);

-- -------------------------------------------------------------------- CRM
create table revenue.crm_businesses (
  id              text not null,
  organization_id uuid not null,
  prospect_id     text not null,
  name            text not null,
  sector          text not null,
  town            text not null,
  website         text not null,
  phone           text not null default '',
  email           text not null default '',
  source          text not null,
  stage           text not null default 'Research'
    check (stage in ('Research','Qualified','Contacted','Discovery','Proposal','Won','Lost','Do not contact')),
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, prospect_id),                -- one CRM account per prospect
  foreign key (organization_id, prospect_id)
    references revenue.discovery_prospects (organization_id, id)
);

create table revenue.crm_review_jobs (
  id              text not null,
  organization_id uuid not null,
  business_id     text not null,
  prospect_id     text not null,
  status          text not null check (status in ('queued','running','completed','blocked','failed')),
  queued_at       timestamptz not null,
  started_at      timestamptz,
  completed_at    timestamptz,
  lease_until     timestamptz,
  claim_token     uuid,
  attempts        integer not null default 0 check (attempts >= 0),
  report          jsonb,                                -- was report_json
  error           text not null default '',
  primary key (organization_id, id),
  foreign key (organization_id, business_id) references revenue.crm_businesses (organization_id, id),
  foreign key (organization_id, prospect_id) references revenue.discovery_prospects (organization_id, id),
  check (status <> 'completed' or report is not null),
  check (status not in ('blocked','failed') or length(error) >= 5)   -- failures are never silent
);
-- at most one open review per prospect (was one_open_ai_review)
create unique index one_open_ai_review
  on revenue.crm_review_jobs (organization_id, prospect_id) where status in ('queued','running');
create index crm_review_jobs_business_idx on revenue.crm_review_jobs (organization_id, business_id, queued_at desc);
create index crm_review_jobs_pending_idx on revenue.crm_review_jobs (status, queued_at) where status in ('queued','running');

-- ----------------------------------------------------------- offers/catalog
create table revenue.catalog_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references revenue.organizations(id) on delete cascade,
  item_key        text not null,
  name            text not null,
  kind            text not null check (kind in ('one_time','monthly')),
  amount_cents    bigint check (amount_cents is null or amount_cents >= 0),   -- null = TBD
  scope           text not null default '',
  approval_status text not null default 'pending_approval'
    check (approval_status in ('pending_approval','approved','retired')),
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, item_key),
  check (approval_status <> 'approved' or (approved_by is not null and approved_at is not null))
);

create table revenue.service_offers (
  id              text not null,
  organization_id uuid not null,
  business_id     text,
  data            jsonb not null,                       -- was data_json
  updated_at      timestamptz not null,
  revision        integer not null check (revision >= 0),
  primary key (organization_id, id),
  foreign key (organization_id, business_id) references revenue.crm_businesses (organization_id, id)
);
create index service_offers_business_idx on revenue.service_offers (organization_id, business_id);

-- --------------------------------------------- proposals and follow-ups (new)
create table revenue.proposals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  business_id     text not null,
  title           text not null,
  status          text not null default 'Draft'
    check (status in ('Draft','Ready for review','Sent','Accepted','Declined')),
  one_time_cents  bigint check (one_time_cents is null or one_time_cents >= 0),  -- null = TBD
  monthly_cents   bigint check (monthly_cents  is null or monthly_cents  >= 0),  -- null = TBD
  notes           text not null default '',
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, business_id) references revenue.crm_businesses (organization_id, id),
  unique (organization_id, id),
  -- Approval gate: nothing can be Sent/Accepted/Declined without a recorded approver.
  check (status in ('Draft','Ready for review') or (approved_by is not null and approved_at is not null and sent_at is not null))
);
create index proposals_business_idx on revenue.proposals (organization_id, business_id);

create table revenue.follow_ups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  business_id     text not null,
  proposal_id     uuid,
  kind            text not null default 'follow_up' check (kind in ('follow_up','verification')),
  status          text not null default 'open' check (status in ('open','done','cancelled')),
  due_date        date,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, business_id) references revenue.crm_businesses (organization_id, id),
  foreign key (organization_id, proposal_id) references revenue.proposals (organization_id, id)
);
create index follow_ups_due_idx on revenue.follow_ups (organization_id, status, due_date);

-- Default pricing as catalog INPUTS, pending approval (handoff price table).
create function revenue.seed_default_catalog(org uuid) returns void
language sql security invoker set search_path = '' as $$
  insert into revenue.catalog_items (organization_id,item_key,name,kind,amount_cents,scope) values
   (org,'basic-website','Basic Website Build','one_time',99500,'Up to five pages and one contact/quote form, mobile layout, basic on-page SEO, staging review and launch'),
   (org,'hosting','Hosting','monthly',4900,'SSL, backups, uptime monitoring, restore and hosting support'),
   (org,'website-care','Website Care','monthly',9900,'Hosting, monthly inquiry form test and up to 30 minutes of minor edits'),
   (org,'website-management','Website Management','monthly',19900,'Care, monthly broken-link and search visibility checks, up to 60 minutes of minor edits. Proposed scope'),
   (org,'fully-managed-website','Fully Managed Website','monthly',29900,'Management, activity summary, up to 90 minutes of minor edits. Proposed scope')
  on conflict (organization_id,item_key) do nothing;
$$;
revoke all on function revenue.seed_default_catalog(uuid) from public, anon, authenticated;
grant execute on function revenue.seed_default_catalog(uuid) to service_role;

-- ------------------------------------------------- row level security (all)
alter table revenue.organizations         enable row level security;
alter table revenue.organization_members enable row level security;
create policy organizations_read on revenue.organizations
  for select to authenticated using (revenue.is_member(id));
create policy members_read_own_org on revenue.organization_members
  for select to authenticated using (revenue.is_member(organization_id));
-- No client write policies on organizations/members: managed by service role only.

do $$
declare t text;
begin
  foreach t in array array['discovery_prospects','discovery_runs','crm_businesses','crm_review_jobs',
                           'catalog_items','service_offers','proposals','follow_ups'] loop
    execute format('alter table revenue.%I enable row level security', t);
    execute format('create policy %I on revenue.%I for select to authenticated using (revenue.is_member(organization_id))', t||'_read', t);
    execute format('create policy %I on revenue.%I for insert to authenticated with check (revenue.can_write(organization_id))', t||'_insert', t);
    execute format('create policy %I on revenue.%I for update to authenticated using (revenue.can_write(organization_id)) with check (revenue.can_write(organization_id))', t||'_update', t);
    execute format('create policy %I on revenue.%I for delete to authenticated using (revenue.can_write(organization_id))', t||'_delete', t);
  end loop;
end $$;

-- Grants: anon gets nothing. Authenticated is limited by RLS. Review jobs and
-- discovery runs are written by the server worker only (service_role).
revoke all on all tables in schema revenue from public, anon;
grant select on all tables in schema revenue to authenticated;
grant insert, update, delete on revenue.discovery_prospects, revenue.crm_businesses, revenue.service_offers,
      revenue.proposals, revenue.follow_ups to authenticated;
grant update (name, kind, amount_cents, scope) on revenue.catalog_items to authenticated;
grant insert (organization_id, item_key, name, kind, amount_cents, scope) on revenue.catalog_items to authenticated;
grant all on all tables in schema revenue to service_role;
-- Review jobs: members may enqueue/read only; claiming and results are worker-side.
revoke insert, update, delete on revenue.crm_review_jobs, revenue.discovery_runs from authenticated;
