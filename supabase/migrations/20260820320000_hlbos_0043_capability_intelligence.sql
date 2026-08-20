-- hlbos_0043: capability intelligence over the supply universe
--
-- The Top-100 pages currently lead with a repository name. `googlemaps/js-route-
-- optimization-app` is perfect provenance and poor intelligence: it requires the
-- reader to already know what the project does. The CEO should see the
-- CAPABILITY first and the repository underneath it, still traceable.
--
-- REUSING THE VOCABULARY WE ALREADY OWN
-- @hl-bos/catalog already defines a canonical capability model for HLG's OWN
-- modules: CapabilityType (functional | technical | business) and thirteen
-- CapabilityDomain values. This migration adopts those exact vocabularies for
-- third-party software rather than inventing a second taxonomy, because the
-- whole point of the intelligence bridge is that
--
--   MARKET NEED  <->  CAPABILITY  <->  EXISTING TECHNOLOGY  <->  HLG MODULE
--
-- only works if both ends of it speak one language. A capability named
-- `route-optimization` on a GitHub project and the same capability on an HLG
-- module must be the same string, or the bridge is a join that never matches.
--
-- WHY THREE TABLES AND NOT SIX
-- The brief suggested capabilities, opportunity_capabilities, reusable_assets,
-- opportunity_reusable_assets, capability_categories and capability_evidence.
-- Two of those would duplicate structures that already exist:
--
--   capability_categories  -- CapabilityDomain already IS the category
--                             vocabulary, in source control, with tests.
--   capability_evidence    -- vstudio.evidence already exists (65 rows) for
--                             analyst-curated, opportunity-scoped evidence. A
--                             second evidence table for machine extraction
--                             would split "why do we believe this?" across two
--                             places. Extraction evidence is therefore stored
--                             INLINE on the link row: which artifact it came
--                             from, the exact substring, and where to look.
--
--   reusable_assets        -- collapsed into a source-controlled `kind`
--                             vocabulary on the link table. A canonical table
--                             for roughly a dozen asset kinds is a join for no
--                             gain.
--
-- EVIDENCE IS MANDATORY
-- Every capability claim carries the artifact it was read from and the matched
-- text. A capability inferred from a repository NAME alone is the weakest
-- possible evidence, so `evidence_kind` records that explicitly rather than
-- letting a name-match masquerade as a description-match.
--
-- rollback:
--   drop table if exists vstudio.opportunity_reusable_assets;
--   drop table if exists vstudio.opportunity_capabilities;
--   drop table if exists vstudio.capabilities;
--   No opportunity, score, portfolio or pain row is touched in either
--   direction. This migration only ever adds.

-- ---------------------------------------------------------------------------
-- Canonical capabilities
-- ---------------------------------------------------------------------------
create table if not exists vstudio.capabilities (
  slug        text primary key,
  label       text not null,
  -- Mirrors @hl-bos/catalog CapabilityType.
  cap_type    text not null check (cap_type in ('functional','technical','business')),
  -- Mirrors @hl-bos/catalog CapabilityDomain, value for value.
  domain      text not null check (domain in
    ('platform','identity','operations','automation','ai','communications',
     'marketing','analytics','commerce','discovery','factory','intelligence',
     'transportation')),
  description text not null default '',
  -- Which HLG vertical this capability tends to serve. Advisory, not a filter:
  -- outside-core capabilities are kept, never discarded.
  hlg_vertical text check (hlg_vertical in
    ('supply_chain_logistics','business_transformation','sports','service_industry',
     'hld_digital_services','cross_vertical','outside_hlg_core')),
  engine_version text not null default '',
  created_at  timestamptz not null default now()
);
comment on table vstudio.capabilities is
  'What a piece of software can DO, in vocabulary shared with @hl-bos/catalog so a third-party capability and an HLG module capability are the same string. Source-controlled in packages/venture-studio/src/capability.ts and regenerated, never hand-edited.';

-- ---------------------------------------------------------------------------
-- Opportunity -> capability, with its evidence
-- ---------------------------------------------------------------------------
create table if not exists vstudio.opportunity_capabilities (
  opportunity_id  uuid not null references vstudio.opportunities(id) on delete cascade,
  capability_slug text not null references vstudio.capabilities(slug) on delete cascade,
  -- The strongest capability found for this repository. Exactly one per
  -- opportunity, enforced by the partial unique index below.
  is_primary      boolean not null default false,
  -- Which artifact the claim was read from, weakest first. `name` is the
  -- weakest and is recorded as such rather than being quietly presented like a
  -- description match.
  evidence_kind   text not null check (evidence_kind in
    ('name','description','topics','language','license','readme','manifest','structure')),
  -- The actual matched text. Short by design: enough to justify the claim.
  evidence_excerpt text not null default '' check (length(evidence_excerpt) <= 400),
  -- Where to look to check it -- a URL or an artifact path.
  evidence_locator text not null default '',
  -- Extraction is a structured inference over real metadata, never a
  -- measurement. The status column exists so nothing can pretend otherwise.
  confidence      integer not null check (confidence between 0 and 100),
  confidence_status vstudio.metric_status not null default 'estimated'
    check (confidence_status = 'estimated'),
  -- Which analysis level produced it, reusing the ladder already in
  -- opportunity_scores: 1 = metadata only, 2 = deeper, 3/4 = human diligence.
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

-- ---------------------------------------------------------------------------
-- Reusable assets
-- ---------------------------------------------------------------------------
-- "What parts of this could HLG actually reuse?" -- distinct from
-- packages/venture-studio/src/reuse.ts, which answers the opposite question
-- ("which HLG modules do we ALREADY own that serve this?"). Both are needed;
-- conflating them would let "we own something like this" read as "we can lift
-- this out of that repository".
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
  -- Licence governs whether reuse is legally possible at all, so it travels
  -- with the asset rather than being looked up later and forgotten.
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

-- ---------------------------------------------------------------------------
-- Row-level security -- same posture as the rest of the intelligence layer
-- ---------------------------------------------------------------------------
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
