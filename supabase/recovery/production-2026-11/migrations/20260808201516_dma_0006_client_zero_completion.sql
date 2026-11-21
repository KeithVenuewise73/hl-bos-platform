do $$
declare
  v_owner  uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  v_agency uuid := (select id from platform.tenants where slug='herman-legacy-digital');
  v_hld    uuid := (select c.id from dma.clients c where c.tenant_id=v_agency and c.slug='hld');
  v_vw     uuid := (select c.id from dma.clients c where c.tenant_id=v_agency and c.slug='venuewise');
  v_5s     uuid := (select c.id from dma.clients c where c.tenant_id=v_agency and c.slug='5-star-sports-media');
begin
  update dma.clients set
     website_url = coalesce(website_url,'https://hermanlegacygroup.com'),
     hq_location = 'Buffalo, NY',
     description = 'Herman Legacy Digital delivers digital marketing, AI, and software implementation for the Herman Legacy portfolio and its clients — including website modernization, marketing automation, SEO, and industry operating systems.',
     profile_notes = 'Identity from CEO Phase-1.5 statement + HL-BOS bti record (Keith Herman). Confirm specifics before external use.'
   where id=v_hld;
  if not exists (select 1 from dma.offerings where client_id=v_hld) then
    insert into dma.offerings (tenant_id, client_id, kind, name, summary, is_core, provenance, verification, created_by) values
      (v_agency, v_hld, 'service', 'Digital Marketing', 'Full-funnel digital marketing for Herman Legacy businesses and clients.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hld, 'service', 'AI Software Implementation', 'Implementing AI software and automation for operating businesses.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hld, 'service', 'Software Implementation & Industry Operating Systems', 'Building and deploying industry operating systems and business software.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_hld, 'service', 'Website Modernization & SEO', 'Website modernization, SEO, and marketing automation.', false, 'imported','needs_review', v_owner);
  end if;
  if not exists (select 1 from dma.markets where client_id=v_hld) then
    insert into dma.markets (tenant_id, client_id, name, market_type, provenance, verification, created_by) values
      (v_agency, v_hld, 'Small & Mid-Sized Businesses', 'segment',   'human_entered','needs_review', v_owner),
      (v_agency, v_hld, 'Professional Services',        'industry',  'imported','needs_review', v_owner),
      (v_agency, v_hld, 'Western New York',             'geography', 'imported','needs_review', v_owner);
  end if;
  if not exists (select 1 from dma.objectives where client_id=v_hld) then
    insert into dma.objectives (tenant_id, client_id, title, objective_type, priority, status, provenance, verification, created_by) values
      (v_agency, v_hld, 'Grow recurring revenue across the Herman Legacy portfolio', 'retention', 'primary', 'active', 'imported','needs_review', v_owner),
      (v_agency, v_hld, 'Operate Herman Legacy marketing as the DMA-OS proving ground', 'authority', 'secondary', 'active', 'human_entered','needs_review', v_owner);
  end if;
  if not exists (select 1 from dma.channels where client_id=v_hld) then
    insert into dma.channels (tenant_id, client_id, kind, handle_or_url, is_active, provenance, verification, created_by) values
      (v_agency, v_hld, 'website', 'https://hermanlegacygroup.com', true, 'imported','needs_review', v_owner);
  end if;

  update dma.clients set
     one_liner = 'A sports and family scheduling and sports-technology ecosystem.',
     description = 'Venuewise is a sports/family scheduling and sports-technology ecosystem. Within the Herman Legacy estate it also provides shared identity, workflow, and automation infrastructure.',
     profile_notes = 'Identity from CEO Phase-1.5 statement + HSCS-GLP repo. Personas/objectives still needed.'
   where id=v_vw;
  if not exists (select 1 from dma.offerings where client_id=v_vw) then
    insert into dma.offerings (tenant_id, client_id, kind, name, summary, is_core, provenance, verification, created_by) values
      (v_agency, v_vw, 'product', 'Sports & Family Scheduling', 'Scheduling for sports and families.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_vw, 'product', 'Sports Technology Platform', 'The broader sports-technology ecosystem.', true, 'human_entered','needs_review', v_owner);
  end if;
  if not exists (select 1 from dma.markets where client_id=v_vw) then
    insert into dma.markets (tenant_id, client_id, name, market_type, provenance, verification, created_by) values
      (v_agency, v_vw, 'Sports Technology',      'industry', 'human_entered','needs_review', v_owner),
      (v_agency, v_vw, 'Youth & Family Sports',  'segment',  'human_entered','needs_review', v_owner),
      (v_agency, v_vw, 'Sports Organizations',   'segment',  'human_entered','needs_review', v_owner);
  end if;
  if not exists (select 1 from dma.channels where client_id=v_vw) then
    insert into dma.channels (tenant_id, client_id, kind, handle_or_url, is_active, provenance, verification, created_by) values
      (v_agency, v_vw, 'website', 'https://venuewise.net', true, 'human_entered','needs_review', v_owner);
  end if;

  update dma.clients set
     one_liner = 'Sports media covering athletes, teams, and organizations, with related media operations.',
     description = 'Five-Star Sports Media produces sports media covering athletes, teams, and organizations, and runs related media operations.',
     profile_notes = 'Identity from CEO Phase-1.5 statement. Website, personas, objectives and channels still needed.'
   where id=v_5s;
  if not exists (select 1 from dma.offerings where client_id=v_5s) then
    insert into dma.offerings (tenant_id, client_id, kind, name, summary, is_core, provenance, verification, created_by) values
      (v_agency, v_5s, 'service', 'Sports Media Coverage', 'Coverage of athletes, teams, and organizations.', true, 'human_entered','needs_review', v_owner),
      (v_agency, v_5s, 'service', 'Media Operations', 'Related sports-media production and operations.', false, 'human_entered','needs_review', v_owner);
  end if;
  if not exists (select 1 from dma.markets where client_id=v_5s) then
    insert into dma.markets (tenant_id, client_id, name, market_type, provenance, verification, created_by) values
      (v_agency, v_5s, 'Sports Media',        'industry', 'human_entered','needs_review', v_owner),
      (v_agency, v_5s, 'Athletes',            'segment',  'human_entered','needs_review', v_owner),
      (v_agency, v_5s, 'Teams & Organizations','segment', 'human_entered','needs_review', v_owner);
  end if;
end $$;