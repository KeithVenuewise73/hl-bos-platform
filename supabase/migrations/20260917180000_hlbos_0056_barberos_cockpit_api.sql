-- ===========================================================================
-- hlbos_0056 — BarberOS: the operator cockpit's missing API surface
--
-- NEW WORK. Not a reconstruction. Does not exist in production.
--
-- WHY THIS EXISTS
--
-- 0049-0055 left the transformation workflow reachable at both ends and
-- broken in the middle. An operator could import a prospect, run an audit,
-- record a discovery call, draft a proposal and send it — and then the trail
-- stopped. The three things that turn an accepted proposal into a delivered
-- client had no browser-reachable path at all:
--
--   * the capability catalog. barberos.capabilities, barberos.bundles and
--     barberos.capability_requires are readable under RLS, but `barberos` is
--     not exposed through PostgREST, so nothing could read them. A proposal
--     builder that cannot see the catalog cannot tell an operator which
--     capability names the honesty trigger will accept, or which of them have
--     actually shipped — it can only submit and get a raw error back.
--
--   * barberos.upsert_shop. Granted to `authenticated` since 0050 and never
--     wrapped, so the shop row an accepted proposal needs could not be
--     created. barberos.enable_capability refuses a tenant with no shop, so
--     every capability was unreachable behind a row nothing could insert.
--
--   * platform.provision_tenant. Same: granted, never wrapped. A sold shop
--     has no tenant, and a tenant is where its shop, site and clients live.
--
-- ADDITIVE ONLY. This migration creates functions. It drops nothing, renames
-- nothing, and alters no table, column, constraint, policy or grant. Every
-- authority check already in `barberos`, `transform_audit` and `platform` is
-- the one that still runs.
--
-- THE WRAPPER CONTRACT, UNCHANGED FROM 0052 AND 0055
--
-- Every public.* function here is SECURITY INVOKER. It runs as the caller and
-- delegates to a function that performs its own identity.has_permission()
-- check, or reads a table whose RLS policy performs it. A wrapper adds
-- reachability, never authority. NOTHING here is granted to `anon`.
--
-- The two catalog reads are deliberately NOT security definer: they read
-- barberos.capabilities, barberos.bundles, barberos.bundle_capabilities,
-- barberos.capability_requires and barberos.tenant_capabilities as the
-- caller, so the policies 0049 already wrote are the boundary. The first four
-- are `using (true)` to authenticated — the catalog is platform vocabulary,
-- identical for every tenant, and holds no tenant data. The fifth is gated on
-- barberos.shop.read. That is why barberos_catalog() takes no tenant and
-- barberos_capability_state() takes one.
--
-- rollback:
--   DROP FUNCTION IF EXISTS
--     public.barberos_catalog(),
--     public.barberos_capability_state(uuid),
--     public.barberos_save_shop(uuid,text,integer,text,uuid),
--     public.barberos_enable_capability(uuid,text,text,text,jsonb,text),
--     public.barberos_disable_capability(uuid,text),
--     public.barberos_apply_bundle(uuid,text),
--     public.barberos_provision_client(uuid,text,text,integer,text),
--     public.barberos_audit_my_agencies(),
--     public.barberos_audit_pipeline(uuid,text);
--   DROP FUNCTION IF EXISTS
--     transform_audit.pipeline(uuid,text),
--     barberos.provision_client(uuid,extensions.citext,text,integer,text);
-- ===========================================================================

-- ===========================================================================
-- 1. The sale -> onboarding primitive
--
-- The one step the schema could not take. It is a single function because the
-- three writes it makes are one business fact: this shop bought, so it now
-- has a tenant, a shop row and a link back to the prospect it came from.
-- Splitting them would let a tenant exist with no shop, which is exactly the
-- state barberos.enable_capability already refuses to work in.
-- ===========================================================================

create or replace function barberos.provision_client(
  p_prospect   uuid,
  p_slug       extensions.citext,
  p_shop_name  text default null,
  p_chairs     integer default 1,
  p_timezone   text default 'America/New_York')
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_agency   uuid;
  v_name     text;
  v_existing uuid;
  v_accepted uuid;
  v_tenant   uuid;
begin
  select p.tenant_id, p.business_name into v_agency, v_name
    from visibility.prospects p where p.id = p_prospect;
  if v_agency is null then
    raise exception 'prospect % does not exist', p_prospect using errcode = 'no_data_found';
  end if;

  -- Onboarding is the far side of a sale, so it is the sale's permission.
  if not identity.has_permission(v_agency, 'transform_audit.proposal.manage') then
    raise exception 'insufficient privilege to onboard a client for this agency'
      using errcode = 'insufficient_privilege';
  end if;

  -- A client with no accepted proposal is not a client. Without this the
  -- cockpit could create a paying-customer tenant for a shop that never said
  -- yes, and the pipeline would then report a sale that did not happen.
  select pr.id into v_accepted
    from transform_audit.proposals pr
   where pr.prospect_id = p_prospect and pr.status = 'accepted'
   order by pr.decided_at desc limit 1;
  if v_accepted is null then
    raise exception
      'prospect % has no accepted proposal; a client is onboarded after a sale, not before it',
      p_prospect using errcode = 'check_violation';
  end if;

  -- Idempotence would be wrong here: a second call means a second tenant for
  -- the same shop, and nothing would tell the two apart afterwards.
  select s.tenant_id into v_existing
    from barberos.shops s where s.origin_prospect_id = p_prospect;
  if v_existing is not null then
    raise exception 'prospect % was already onboarded as tenant %', p_prospect, v_existing
      using errcode = 'unique_violation';
  end if;

  -- 'customer' class, no parent: platform.provision_tenant reserves
  -- first_party and parented tenants for a verified platform admin, and a
  -- barbershop is neither. It also checks platform.tenant.create and makes
  -- the caller tenant_owner, which is what lets the same operator go on to
  -- configure the shop they just created.
  v_tenant := platform.provision_tenant(
    p_slug, coalesce(nullif(pg_catalog.btrim(coalesce(p_shop_name, '')), ''), v_name),
    auth.uid(), 'customer', null);

  -- Through upsert_shop, not a direct insert: one permission-checked path
  -- creates a shop row, and it re-checks barberos.shop.manage on the tenant
  -- that was just provisioned rather than assuming the grant.
  perform barberos.upsert_shop(
    v_tenant,
    coalesce(nullif(pg_catalog.btrim(coalesce(p_shop_name, '')), ''), v_name),
    coalesce(p_chairs, 1),
    coalesce(nullif(pg_catalog.btrim(coalesce(p_timezone, '')), ''), 'America/New_York'),
    p_prospect);

  perform events.emit('barberos.client.onboarded', v_tenant,
    jsonb_build_object('prospect', p_prospect, 'agency', v_agency,
                       'proposal', v_accepted, 'slug', p_slug::text));
  return v_tenant;
end; $function$;

comment on function barberos.provision_client(uuid, extensions.citext, text, integer, text) is
  'Turns an accepted proposal into a client: provisions the shop''s own tenant, creates its barberos.shops row and links it back to the prospect. Refuses without an accepted proposal, and refuses a prospect that was already onboarded.';

revoke all on function barberos.provision_client(uuid, extensions.citext, text, integer, text) from public, anon;
grant execute on function barberos.provision_client(uuid, extensions.citext, text, integer, text) to authenticated;

-- ===========================================================================
-- 2. The pipeline, in one read
--
-- shops_for() already reports whether a shop was called and audited. This
-- adds the two stages after that — the proposal and the onboarding — so a
-- board can be drawn from one call instead of four per row.
--
-- The onboarding half crosses a tenant boundary on purpose and carefully: the
-- link is barberos.shops.origin_prospect_id pointing back at THIS agency's
-- own prospect, so the existence of the sale is the agency's own fact. The
-- client tenant's id is returned only when the caller can actually read that
-- shop; otherwise the caller learns that the shop was onboarded and nothing
-- more. Every barberos_* call against that tenant re-checks its own
-- permission regardless.
-- ===========================================================================

create or replace function transform_audit.pipeline(p_tenant uuid, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (identity.has_permission(p_tenant, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this agency''s pipeline'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((select jsonb_agg(x order by x->>'business_name') from (
    select jsonb_build_object(
             'prospect_id', p.id,
             'business_name', p.business_name,
             'phone', p.phone,
             'locality', sp.locality,
             'region', sp.region,
             'website_url', p.website_url,
             'has_gbp', sp.gbp_place_id is not null,

             -- Stage 1: was the discovery call actually answered? A discovery
             -- row can exist with every answer null, which is not a call.
             'discovery', (
               select jsonb_build_object('answered_at', d.answered_at)
                 from transform_audit.discovery d where d.prospect_id = p.id),

             -- Stage 2: the audit. Score never travels without its coverage,
             -- and finding counts never travel without how many of them are
             -- evidenced -- an operator has to be able to see that a run is
             -- built entirely on inference before quoting it to a shop.
             'latest_run', (
               select jsonb_build_object(
                        'run_id', r.id, 'status', r.status,
                        'composite_score', r.composite_score,
                        'coverage', jsonb_build_object('scored', r.dimensions_scored,
                                                       'possible', r.dimensions_possible),
                        'findings', (select count(*) from transform_audit.findings f
                                      where f.run_id = r.id),
                        'evidenced_findings', (select count(*) from transform_audit.findings f
                                                where f.run_id = r.id
                                                  and f.evidence_url is not null),
                        'has_outreach_hook', r.outreach_hook is not null,
                        'started_at', r.started_at, 'finished_at', r.finished_at)
                 from transform_audit.runs r
                where r.prospect_id = p.id
                order by r.started_at desc limit 1),
             'runs', (select count(*) from transform_audit.runs r where r.prospect_id = p.id),

             -- Stage 3: the proposal. The latest one, by the lifecycle's own
             -- clock, plus how many have been sent to this shop in total.
             'latest_proposal', (
               select jsonb_build_object(
                        'id', pr.id, 'status', pr.status,
                        'created_at', pr.created_at, 'sent_at', pr.sent_at,
                        'decided_at', pr.decided_at)
                 from transform_audit.proposals pr
                where pr.prospect_id = p.id
                order by pr.created_at desc, pr.id desc limit 1),
             'proposals', (select count(*) from transform_audit.proposals pr
                            where pr.prospect_id = p.id),

             -- Stage 4: delivery. See the header for why this crosses tenants.
             'onboarding', (
               select jsonb_build_object(
                        'onboarded_at', s.created_at,
                        'shop_name', case when identity.has_permission(s.tenant_id, 'barberos.shop.read')
                                          then s.shop_name end,
                        'client_tenant_id', case when identity.has_permission(s.tenant_id, 'barberos.shop.read')
                                                 then s.tenant_id end)
                 from barberos.shops s where s.origin_prospect_id = p.id)
           ) as x
      from transform_audit.shop_profiles sp
      join visibility.prospects p on p.id = sp.prospect_id
     where sp.tenant_id = p_tenant
       and (p_search is null or pg_catalog.btrim(p_search) = ''
            or p.business_name ilike '%'||p_search||'%'
            or coalesce(sp.locality,'') ilike '%'||p_search||'%')) q), '[]'::jsonb);
end; $function$;

comment on function transform_audit.pipeline(uuid, text) is
  'The whole prospect-to-client pipeline for one agency tenant in a single read: discovery, latest audit run with its coverage and evidence counts, latest proposal, and onboarding. The client tenant id appears only to a caller who may read that shop.';

revoke all on function transform_audit.pipeline(uuid, text) from public, anon;
grant execute on function transform_audit.pipeline(uuid, text) to authenticated;

-- ===========================================================================
-- 3. The public API
--
-- SECURITY INVOKER throughout. Enum parameters are text at the boundary and
-- cast inside, so a client never needs to name a PostgreSQL type -- the same
-- choice barberos_set_link and the barberos_audit_* surface already make.
-- ===========================================================================

-- --- which agency am I operating? ------------------------------------------
-- bti_my_tenants() answers the same shape of question but filters on
-- bti.business.read, so it would hand the cockpit tenants it cannot audit and
-- hide ones it can. The `can` flags are computed from the real permission
-- checks, so the UI hides a button because the permission is absent rather
-- than because someone hardcoded a role name.
create or replace function public.barberos_audit_my_agencies()
returns jsonb language sql stable set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tenant_id', t.id, 'name', t.name, 'slug', t.slug,
           'can', jsonb_build_object(
             'read_audits',      true,
             'run_audits',       identity.has_permission(t.id, 'transform_audit.audit.create'),
             'manage_campaigns', identity.has_permission(t.id, 'transform_audit.campaign.manage'),
             'manage_shops',     identity.has_permission(t.id, 'transform_audit.shop.manage'),
             'manage_discovery', identity.has_permission(t.id, 'transform_audit.discovery.manage'),
             'manage_proposals', identity.has_permission(t.id, 'transform_audit.proposal.manage'),
             -- Onboarding needs BOTH: the agency-side sale permission and the
             -- platform-wide right to create a tenant. A cockpit that showed
             -- the button on the first alone would fail at the second.
             'onboard_clients',  identity.has_permission(t.id, 'transform_audit.proposal.manage')
                                 and identity.has_platform_permission('platform.tenant.create'))
         ) order by t.name), '[]'::jsonb)
    from platform.tenants t
   where t.id in (select identity.my_tenant_ids())
     and identity.has_permission(t.id, 'transform_audit.audit.read');
$function$;

-- --- the capability catalog -------------------------------------------------
-- Reads as the caller: RLS on these four tables is `using (true)` to
-- authenticated because the catalog is what Herman Legacy sells, not what any
-- one tenant holds.
--
-- `deliverable_today` on a bundle is the whole point of this function. Three
-- bundles are seeded and none of them is currently applicable: apply_bundle()
-- refuses the first capability that has not shipped, and every bundle
-- contains at least one. A cockpit that drew three Apply buttons would draw
-- three controls that cannot do their job. This reports exactly which
-- capabilities block each bundle so the UI can say so instead.
create or replace function public.barberos_catalog()
returns jsonb language sql stable set search_path = '' as $function$
  select jsonb_build_object(
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', c.key::text, 'name', c.name, 'category', c.category::text,
               'description', c.description,
               'status', c.status::text,
               'is_available', c.status = 'available',
               'is_default', c.is_default,
               'version', c.version,
               'locked_config_keys', pg_catalog.to_jsonb(c.locked_config_keys),
               'blocked_on', c.blocked_on,
               'blocker_owner', c.blocker_owner::text,
               'requires', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'key', cr.requires_key::text, 'reason', cr.reason)
                        order by cr.requires_key)
                   from barberos.capability_requires cr
                  where cr.capability_key = c.key), '[]'::jsonb))
             order by c.category, c.key)
        from barberos.capabilities c), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', b.key::text, 'name', b.name, 'description', b.description,
               'capabilities', coalesce((
                 select jsonb_agg(bc.capability_key::text order by bc.capability_key)
                   from barberos.bundle_capabilities bc
                  where bc.bundle_key = b.key), '[]'::jsonb),
               'shipped', (select count(*) from barberos.bundle_capabilities bc
                            join barberos.capabilities c2 on c2.key = bc.capability_key
                           where bc.bundle_key = b.key and c2.status = 'available'),
               'total', (select count(*) from barberos.bundle_capabilities bc
                          where bc.bundle_key = b.key),
               -- apply_bundle() is all-or-nothing, so this is all-or-nothing.
               'deliverable_today', not exists (
                 select 1 from barberos.bundle_capabilities bc
                   join barberos.capabilities c3 on c3.key = bc.capability_key
                  where bc.bundle_key = b.key and c3.status <> 'available'),
               'blocked_by', coalesce((
                 select jsonb_agg(bc.capability_key::text order by bc.capability_key)
                   from barberos.bundle_capabilities bc
                   join barberos.capabilities c4 on c4.key = bc.capability_key
                  where bc.bundle_key = b.key and c4.status <> 'available'), '[]'::jsonb))
             order by b.display_order, b.key)
        from barberos.bundles b), '[]'::jsonb));
$function$;

-- What is switched on for one shop, and who switched it on. Reads
-- barberos.tenant_capabilities as the caller, so the 0049 policy gated on
-- barberos.shop.read is the boundary: a caller without it gets an empty
-- array, which is the truthful answer to "what may I see here".
create or replace function public.barberos_capability_state(p_tenant uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'capability_key', tc.capability_key::text,
           'name', c.name,
           'status', c.status::text,
           'enabled_at', tc.enabled_at,
           'enabled_via', tc.enabled_via::text,
           'bundle_key', tc.bundle_key::text,
           'source_ref', tc.source_ref,
           'config', tc.config
         ) order by tc.capability_key), '[]'::jsonb)
    from barberos.tenant_capabilities tc
    join barberos.capabilities c on c.key = tc.capability_key
   where tc.tenant_id = p_tenant;
$function$;

-- --- the shop row ----------------------------------------------------------
create or replace function public.barberos_save_shop(
  p_tenant uuid, p_shop_name text, p_chair_count integer default 1,
  p_timezone text default 'America/New_York', p_origin_prospect uuid default null)
returns uuid language sql set search_path = '' as $function$
  select barberos.upsert_shop(p_tenant, p_shop_name, p_chair_count, p_timezone, p_origin_prospect);
$function$;

-- --- capability enablement --------------------------------------------------
create or replace function public.barberos_enable_capability(
  p_tenant uuid, p_capability text, p_via text default 'individual',
  p_bundle text default null, p_config jsonb default '{}'::jsonb,
  p_source_ref text default null)
returns boolean language sql set search_path = '' as $function$
  select barberos.enable_capability(
    p_tenant, p_capability::extensions.citext,
    coalesce(p_via, 'individual')::barberos.enablement_source,
    p_bundle::extensions.citext, p_config, p_source_ref);
$function$;

create or replace function public.barberos_disable_capability(p_tenant uuid, p_capability text)
returns boolean language sql set search_path = '' as $function$
  select barberos.disable_capability(p_tenant, p_capability::extensions.citext);
$function$;

create or replace function public.barberos_apply_bundle(p_tenant uuid, p_bundle text)
returns integer language sql set search_path = '' as $function$
  select barberos.apply_bundle(p_tenant, p_bundle::extensions.citext);
$function$;

-- --- sale -> client --------------------------------------------------------
create or replace function public.barberos_provision_client(
  p_prospect uuid, p_slug text, p_shop_name text default null,
  p_chairs integer default 1, p_timezone text default 'America/New_York')
returns uuid language sql set search_path = '' as $function$
  select barberos.provision_client(
    p_prospect, p_slug::extensions.citext, p_shop_name, p_chairs, p_timezone);
$function$;

-- --- the pipeline ----------------------------------------------------------
create or replace function public.barberos_audit_pipeline(
  p_tenant uuid, p_search text default null)
returns jsonb language sql stable set search_path = '' as $function$
  select transform_audit.pipeline(p_tenant, p_search);
$function$;

-- ===========================================================================
-- 4. Grants. authenticated only. No anon, anywhere in this file.
-- ===========================================================================

revoke all on function public.barberos_audit_my_agencies() from public, anon;
revoke all on function public.barberos_catalog() from public, anon;
revoke all on function public.barberos_capability_state(uuid) from public, anon;
revoke all on function public.barberos_save_shop(uuid,text,integer,text,uuid) from public, anon;
revoke all on function public.barberos_enable_capability(uuid,text,text,text,jsonb,text) from public, anon;
revoke all on function public.barberos_disable_capability(uuid,text) from public, anon;
revoke all on function public.barberos_apply_bundle(uuid,text) from public, anon;
revoke all on function public.barberos_provision_client(uuid,text,text,integer,text) from public, anon;
revoke all on function public.barberos_audit_pipeline(uuid,text) from public, anon;

grant execute on function public.barberos_audit_my_agencies() to authenticated;
grant execute on function public.barberos_catalog() to authenticated;
grant execute on function public.barberos_capability_state(uuid) to authenticated;
grant execute on function public.barberos_save_shop(uuid,text,integer,text,uuid) to authenticated;
grant execute on function public.barberos_enable_capability(uuid,text,text,text,jsonb,text) to authenticated;
grant execute on function public.barberos_disable_capability(uuid,text) to authenticated;
grant execute on function public.barberos_apply_bundle(uuid,text) to authenticated;
grant execute on function public.barberos_provision_client(uuid,text,text,integer,text) to authenticated;
grant execute on function public.barberos_audit_pipeline(uuid,text) to authenticated;

comment on function public.barberos_catalog() is
  'The BarberOS capability catalog and its bundles. deliverable_today on a bundle is false when any capability in it has not shipped, because apply_bundle() is all-or-nothing.';
comment on function public.barberos_audit_pipeline(uuid, text) is
  'Prospect -> discovery -> audit -> proposal -> onboarding for one agency tenant, in one read.';
comment on function public.barberos_provision_client(uuid, text, text, integer, text) is
  'Onboard a sold shop: provision its tenant and create its shop row. Requires an accepted proposal.';
