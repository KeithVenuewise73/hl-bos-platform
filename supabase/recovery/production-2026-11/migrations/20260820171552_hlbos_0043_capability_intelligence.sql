create table if not exists vstudio.capabilities (
  slug        text primary key,
  label       text not null,
  cap_type    text not null check (cap_type in ('functional','technical','business')),
  domain      text not null check (domain in
    ('platform','identity','operations','automation','ai','communications',
     'marketing','analytics','commerce','discovery','factory','intelligence',
     'transportation')),
  description text not null default '',
  hlg_vertical text check (hlg_vertical in
    ('supply_chain_logistics','business_transformation','sports','service_industry',
     'hld_digital_services','cross_vertical','outside_hlg_core')),
  engine_version text not null default '',
  created_at  timestamptz not null default now()
);
comment on table vstudio.capabilities is
  'What a piece of software can DO, in vocabulary shared with @hl-bos/catalog so a third-party capability and an HLG module capability are the same string. Source-controlled in packages/venture-studio/src/capability.ts and regenerated, never hand-edited.';
create table if not exists vstudio.opportunity_capabilities (
  opportunity_id  uuid not null references vstudio.opportunities(id) on delete cascade,
  capability_slug text not null references vstudio.capabilities(slug) on delete cascade,
  is_primary      boolean not null default false,
  evidence_kind   text not null check (evidence_kind in
    ('name','description','topics','language','license','readme','manifest','structure')),
  evidence_excerpt text not null default '' check (length(evidence_excerpt) <= 400),
  evidence_locator text not null default '',
  confidence      integer not null check (confidence between 0 and 100),
  confidence_status vstudio.metric_status not null default 'estimated'
    check (confidence_status = 'estimated'),
  extraction_level integer not null default 1 check (extraction_level between 1 and 4),
  engine_version  text not null default '',
  extracted_at    timestamptz not null default now(),
  primary key (opportunity_id, capability_slug)
);
create unique index if not exists opportunity_one_primary_capability
  on vstudio.opportunity_capabilities (opportunity_id) where is_primary;
create index if not exists opportunity_capabilities_slug_idx
  on vstudio.opportunity_capabilities (capability_slug);
create index if not exists opportunity_capabilities_level_idx
  on vstudio.opportunity_capabilities (extraction_level);
comment on table vstudio.opportunity_capabilities is
  'A capability claim about one repository, with the artifact and the exact text it was read from. evidence_kind = name is the weakest form and is labelled, so a name match can never be mistaken for a described capability.';
create table if not exists vstudio.opportunity_reusable_assets (
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  asset_kind     text not null check (asset_kind in
    ('algorithm','api_integration','backend_service','ui_component',
     'data_model','reference_architecture','sdk_client','pipeline',
     'ruleset','dataset','protocol_implementation')),
  label          text not null,
  evidence_kind  text not null check (evidence_kind in
    ('name','description','topics','language','license','readme','manifest','structure')),
  evidence_excerpt text not null default '' check (length(evidence_excerpt) <= 400),
  licence        text,
  licence_permits_commercial boolean,
  confidence     integer not null check (confidence between 0 and 100),
  confidence_status vstudio.metric_status not null default 'estimated'
    check (confidence_status = 'estimated'),
  extraction_level integer not null default 1 check (extraction_level between 1 and 4),
  engine_version text not null default '',
  extracted_at   timestamptz not null default now(),
  primary key (opportunity_id, asset_kind, label)
);
create index if not exists opportunity_assets_kind_idx
  on vstudio.opportunity_reusable_assets (asset_kind);
comment on table vstudio.opportunity_reusable_assets is
  'Parts of a third-party project HLG might lift or learn from, with the licence that decides whether that is permitted. The mirror image of packages/venture-studio/src/reuse.ts, which asks which HLG modules already cover a need.';
alter table vstudio.capabilities                enable row level security;
alter table vstudio.capabilities                force  row level security;
alter table vstudio.opportunity_capabilities    enable row level security;
alter table vstudio.opportunity_capabilities    force  row level security;
alter table vstudio.opportunity_reusable_assets enable row level security;
alter table vstudio.opportunity_reusable_assets force  row level security;
do $$
declare t text;
begin
  foreach t in array array['capabilities','opportunity_capabilities',
                           'opportunity_reusable_assets'] loop
    execute format('drop policy if exists %I on vstudio.%I', t || '_read', t);
    execute format(
      'create policy %I on vstudio.%I for select using (identity.has_platform_permission(%L))',
      t || '_read', t, 'vstudio.opportunity.read');
  end loop;
end $$;
grant select on vstudio.capabilities, vstudio.opportunity_capabilities,
                vstudio.opportunity_reusable_assets to authenticated;