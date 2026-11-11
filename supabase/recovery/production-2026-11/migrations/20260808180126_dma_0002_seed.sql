do $$
declare
  v_owner       uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  v_agency      uuid;
  v_hscs_tenant uuid;
  v_membership  uuid;
begin
  insert into platform.tenants (slug, name, status, tenant_class, created_by, updated_by)
  values ('herman-legacy-digital', 'Herman Legacy Digital', 'trial', 'first_party', v_owner, v_owner)
  on conflict (slug) do nothing;

  select id into v_agency from platform.tenants where slug='herman-legacy-digital';
  select id into v_hscs_tenant from platform.tenants where slug='hscs-government';

  insert into identity.memberships (tenant_id, user_id, status, created_by, updated_by)
  values (v_agency, v_owner, 'active', v_owner, v_owner)
  on conflict (tenant_id, user_id) do nothing;

  select id into v_membership from identity.memberships where tenant_id=v_agency and user_id=v_owner;
  insert into identity.membership_roles (membership_id, role_key, granted_by)
  values (v_membership, 'tenant_owner', v_owner)
  on conflict do nothing;

  insert into dma.clients (tenant_id, platform_tenant_id, slug, name, legal_name, website_url,
      hq_location, one_liner, is_internal, needs_profile_completion, profile_notes, provenance, verification, created_by)
  values (v_agency, v_agency, 'hld', 'Herman Legacy Digital', 'Herman Legacy Digital', null,
      'Western New York',
      'AI-native digital marketing agency operating marketing for the Herman Legacy portfolio.',
      true, true,
      'NEEDS_PROFILE_COMPLETION: agency self-profile is a stub. Offer, personas, and objectives to be defined by CEO.',
      'human_entered', 'needs_review', v_owner)
  on conflict (tenant_id, slug) do nothing;

  insert into dma.clients (tenant_id, platform_tenant_id, slug, name, legal_name, website_url,
      hq_location, one_liner, description, is_internal, needs_profile_completion, profile_notes, provenance, verification, created_by)
  values (v_agency, v_hscs_tenant, 'hscs', 'Herman Supply Chain Solutions', 'Herman Supply Chain Solutions',
      'https://hermansupplychainsolutions.com', 'Western New York',
      'Operations and supply-chain consulting pairing 35+ years of hands-on operational experience with AI-enabled business improvement.',
      'Herman Supply Chain Solutions provides operations and supply chain consulting to owners and operations executives, and (via HSCS-GLP) government logistics contract intelligence. Positioning and facts below are sourced from the CEO Phase-1 brief and the HSCS-GLP repository; confirm with the client before external use.',
      true, false,
      'Profile seeded from CEO Phase-1 brief and HSCS-GLP repo. verification=needs_review until confirmed by the client.',
      'human_entered', 'needs_review', v_owner)
  on conflict (tenant_id, slug) do nothing;

  insert into dma.clients (tenant_id, slug, name, website_url, is_internal, needs_profile_completion, profile_notes, provenance, verification, created_by)
  values (v_agency, 'venuewise', 'Venuewise', 'https://venuewise.net', true, true,
      'NEEDS_PROFILE_COMPLETION: business facts (offer, markets, personas, objectives) not yet verified. Website inferred from operator domain.',
      'human_entered', 'needs_review', v_owner)
  on conflict (tenant_id, slug) do nothing;

  insert into dma.clients (tenant_id, slug, name, is_internal, needs_profile_completion, profile_notes, provenance, verification, created_by)
  values (v_agency, '5-star-sports-media', '5-Star Sports Media', true, true,
      'NEEDS_PROFILE_COMPLETION: no verified business facts available yet.',
      'human_entered', 'needs_review', v_owner)
  on conflict (tenant_id, slug) do nothing;
end $$;

do $$
declare
  v_owner  uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  v_agency uuid := (select id from platform.tenants where slug='herman-legacy-digital');
  v_hscs   uuid := (select c.id from dma.clients c join platform.tenants t on t.id=c.tenant_id
                     where t.slug='herman-legacy-digital' and c.slug='hscs');
begin
  if v_hscs is null then raise exception 'HSCS client not found — seed order error'; end if;

  if not exists (select 1 from dma.brands where client_id=v_hscs) then
    insert into dma.brands (tenant_id, client_id, name, positioning_statement, differentiator, value_proposition,
        brand_voice_traits, brand_voice_notes, tone, provenance, verification, created_by)
    values (v_agency, v_hscs, 'Herman Supply Chain Solutions',
      'Operations-first consulting for owners and executives who want practical, experienced help improving how their business actually runs.',
      '35+ years of practical operational experience combined with AI-enabled business improvement.',
      'Real operating experience — not theory — applied to reduce cost and improve throughput, now amplified by AI.',
      array['Experienced','Practical','Human-centered','Operations-first','Direct','Credible','No unnecessary corporate jargon'],
      'Voice traits taken verbatim from the CEO Phase-1 brief.',
      'Confident, plain-spoken, practitioner-to-practitioner.',
      'human_entered', 'needs_review', v_owner);
  end if;

  if not exists (select 1 from dma.offerings where client_id=v_hscs) then
    insert into dma.offerings (tenant_id, client_id, kind, name, summary, is_core, provenance, verification, created_by) values
      (v_agency, v_hscs, 'service', 'Operations & Supply Chain Consulting',
        'The core offer: hands-on operations and supply chain consulting for owners and operations executives.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'service', 'AI-Enabled Business Improvement',
        'Applying AI to operational and supply-chain problems to reduce cost and improve throughput.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'service', 'Government Logistics Contract Intelligence (HSCS-GLP)',
        'Discovery, subcontractability, pricing and bid administration for government logistics work (delivered via HSCS-GLP).', false, 'human_entered','needs_review', v_owner);
  end if;

  if not exists (select 1 from dma.markets where client_id=v_hscs) then
    insert into dma.markets (tenant_id, client_id, name, market_type, provenance, verification, created_by) values
      (v_agency, v_hscs, 'Operations',       'industry',  'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Logistics',        'industry',  'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Supply Chain',     'industry',  'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Transportation',   'industry',  'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Warehousing',      'industry',  'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Western New York', 'geography', 'human_entered','needs_review', v_owner);
  end if;

  if not exists (select 1 from dma.personas where client_id=v_hscs) then
    insert into dma.personas (tenant_id, client_id, name, role_titles, description, goals, pains, watering_holes, provenance, verification, created_by) values
      (v_agency, v_hscs, 'Operations Executive',
        array['COO','VP of Operations','Director of Operations','Operations Manager'],
        'Senior operations leaders accountable for cost, throughput and service in logistics-heavy businesses. Role titles from the CEO brief; goals/pains below are AI-inferred and need confirmation.',
        array['Reduce operating cost','Improve on-time performance','Scale operations without adding chaos'],
        array['Rising labor and transportation costs','Inconsistent execution across sites','Limited bandwidth to run improvement projects'],
        array['LinkedIn','Industry associations'],
        'ai_inferred', 'needs_review', v_owner),
      (v_agency, v_hscs, 'Business Owner / CEO',
        array['Owner','President','CEO'],
        'Owners of transportation companies, warehouses, 3PLs, distribution and manufacturing businesses. Role titles from the CEO brief; goals/pains AI-inferred.',
        array['Grow profitably','Get expert operational help without a full-time hire'],
        array['Margin pressure','Do not know where to start with AI'],
        array['LinkedIn','Referrals'],
        'ai_inferred', 'needs_review', v_owner),
      (v_agency, v_hscs, 'Logistics Operator',
        array['3PL Operator','Warehouse Manager','Transportation Manager','Distribution Manager'],
        'Operators at 3PLs, warehouses, transportation and distribution companies. Role titles from the CEO brief.',
        array['Increase throughput','Meet customer SLAs'],
        array['Driver and labor shortages','Aging processes and systems'],
        array['Industry publications','LinkedIn'],
        'ai_inferred', 'needs_review', v_owner);
  end if;

  if not exists (select 1 from dma.objectives where client_id=v_hscs) then
    insert into dma.objectives (tenant_id, client_id, title, objective_type, priority, status, provenance, verification, created_by) values
      (v_agency, v_hscs, 'Generate qualified consulting opportunities', 'lead_generation', 'primary',  'active', 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Build authority',                             'authority',       'secondary','active', 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Increase search visibility',                  'local_visibility','secondary','active', 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'Develop founder thought leadership',          'authority',       'secondary','active', 'human_entered','needs_review', v_owner);
  end if;

  if not exists (select 1 from dma.channels where client_id=v_hscs) then
    insert into dma.channels (tenant_id, client_id, kind, is_active, provenance, verification, created_by) values
      (v_agency, v_hscs, 'website',  true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'linkedin', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'google',   true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hscs, 'youtube',  true, 'human_entered','needs_review', v_owner);
  end if;

  if not exists (select 1 from dma.recommendations where client_id=v_hscs) then
    insert into dma.recommendations (tenant_id, client_id, title, rationale, recommended_action, status,
        objective_id, provenance, verification, created_by)
    values (v_agency, v_hscs,
      'Confirm HSCS competitor set before authority campaign',
      'The Competitors dimension is empty, so positioning claims cannot yet be differentiated with evidence.',
      'Interview the client to capture 3-5 named competitors with positioning, then re-score.',
      'draft',
      (select id from dma.objectives where client_id=v_hscs and priority='primary' limit 1),
      'human_entered', 'needs_review', v_owner);
  end if;
end $$;