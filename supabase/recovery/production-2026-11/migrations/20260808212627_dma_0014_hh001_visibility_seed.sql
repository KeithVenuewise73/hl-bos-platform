do $$
declare
  v_owner  uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  v_client uuid := (select c.id from dma.clients c join platform.tenants t on t.id=c.tenant_id
                    where t.slug='herman-legacy-digital' and c.slug='venuewise');
  v_ten    uuid := (select id from platform.tenants where slug='herman-legacy-digital');
  v_off    uuid := (select o.id from dma.offerings o where o.client_id=v_client and o.name='HomeHuddle');
  s_multisport uuid := (select id from dma.market_segments where offering_id=v_off and name='Multi-sport families');
  s_hockey     uuid := (select id from dma.market_segments where offering_id=v_off and name='Travel/competitive hockey families');
  a_id uuid; i_multi uuid; i_manage uuid; i_sync uuid; i_hockey uuid; i_local uuid; src_search uuid;
begin
  if v_off is null then raise exception 'HomeHuddle offering not found'; end if;

  insert into dma.market_alternatives (tenant_id,client_id,offering_id,name,alternative_kind,url,notes,strengths,weaknesses,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,'Orgo (Logistics Calendar)','direct_product','https://apps.apple.com/us/app/orgo-logistics-calendar/id6480088586','360-degree schedule across teams/kids/activities; syncs Google/Apple/TeamSnap; conflict detection + carpool.',array['Direct aggregator','Conflict detection','Carpool'],array['Newer/limited brand'],'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,'Schedule Caddie','direct_product','https://schedulecaddie.com/','Merge multiple teams/kids into one color-coded calendar via calendar links; free tier.',array['Direct aggregator','Free tier'],array['Utility-grade UX'],'medium','ai_inferred','needs_review',v_owner)
  on conflict do nothing;

  insert into dma.research_sources (tenant_id,client_id,offering_id,title,url,publisher,source_type,method,published_on,accessed_on,credibility,summary,created_by) values
   (v_ten,v_client,v_off,'Discovery-intent search — multi-sport family calendar (who ranks)','https://www.google.com/search?q=multi-sport+family+calendar+app','Web search observation','web','web_search','2026-08-08','2026-08-08','low','For core aggregation intents the visible players are TeamSnap, Orgo, Schedule Caddie, SportsCal, Cozi — HomeHuddle/Venuewise absent from organic results.',v_owner)
  on conflict do nothing;
  select id into src_search from dma.research_sources where url='https://www.google.com/search?q=multi-sport+family+calendar+app';

  insert into dma.discovery_intents (tenant_id,client_id,offering_id,segment_id,intent_phrase,description,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,s_multisport,'multi-sport family calendar','Aggregating multiple sports schedules into one family view.','medium','ai_inferred','needs_review',v_owner) returning id into i_multi;
  insert into dma.discovery_intents (tenant_id,client_id,offering_id,segment_id,intent_phrase,description,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,s_multisport,'manage multiple kids sports schedules','Parents coordinating several children/teams.','medium','ai_inferred','needs_review',v_owner) returning id into i_manage;
  insert into dma.discovery_intents (tenant_id,client_id,offering_id,segment_id,intent_phrase,description,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,s_multisport,'app that syncs multiple team schedules','Aggregating team apps into one calendar.','medium','ai_inferred','needs_review',v_owner) returning id into i_sync;
  insert into dma.discovery_intents (tenant_id,client_id,offering_id,segment_id,intent_phrase,description,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,s_hockey,'hockey family schedule app','Travel-hockey family coordination.','medium','ai_inferred','needs_review',v_owner) returning id into i_hockey;
  insert into dma.discovery_intents (tenant_id,client_id,offering_id,segment_id,intent_phrase,description,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,s_hockey,'sports family calendar Buffalo / WNY','Local beachhead discovery.','low','ai_inferred','needs_review',v_owner) returning id into i_local;

  insert into dma.visibility_assessments (tenant_id,client_id,offering_id,title,method,summary,assessed_on,overall_visibility,provenance,verification,created_by)
  values (v_ten,v_client,v_off,'HomeHuddle visibility vs HH-001 discovery intents','web_search',
    'HomeHuddle is discoverable by brand name only. For every core aggregation/discovery intent it is absent from organic results while incumbents (TeamSnap, Cozi) and direct aggregators (Orgo, Schedule Caddie, Onsides) are visible.',
    '2026-08-08','low','ai_inferred','needs_review',v_owner)
  returning id into a_id;

  insert into dma.visibility_findings (tenant_id,client_id,offering_id,assessment_id,segment_id,intent_id,dimension,current_visibility,competitor_visibility,top_competitors,gap,opportunity,recommended_action,website_build_required,source_id,confidence,provenance,verification,created_by) values
   (v_ten,v_client,v_off,a_id,s_multisport,i_multi,'seo','none','high',array['TeamSnap','Cozi','Orgo','Schedule Caddie'],'HomeHuddle does not appear for the core "multi-sport family calendar" intents; competitors dominate.','Own the aggregation intent with indexed content built for the exact phrasing.','Create SEO landing page: "One family calendar for all your kids'' sports"',true,src_search,'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,i_manage,'seo','none','high',array['Cozi','Maple','TimeTree','TeamSnap'],'Absent for "manage multiple kids sports schedules"; general calendars + team apps rank.','Target the multi-child coordination phrasing.','Create SEO/service page for multi-child sports scheduling',true,src_search,'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,i_sync,'competitive_position','low','high',array['Orgo','Schedule Caddie','TeamSnap','Onsides'],'Direct aggregators (Orgo, Schedule Caddie, Onsides) are already visible for the exact wedge HomeHuddle claims.','Differentiate on the sports-native sync (GameChanger/TeamSnap/LeagueApps) + family view.','Create comparison pages: HomeHuddle vs Cozi / TeamSnap / Orgo',true,src_search,'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,null,'website','medium','high',array['TeamSnap','Cozi'],'venuewise.net explains HomeHuddle clearly (product clarity is OK), but the site is not discoverable for non-brand intents.','Leverage the clear product story into indexed, intent-matched pages.','Expand site with intent-specific pages (product clarity is already good)',true,null,'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,null,'branding','low','high',array['TeamSnap','Cozi','Skylight'],'Brand presence limited to its own site; low discoverability/recognition.','Build brand footprint where sports families gather.','Establish consistent brand presence across sports-parent channels',false,null,'low','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,null,'social_presence','low','medium',array['TeamSnap','Cozi'],'No evidence of an active, discoverable social presence for the aggregation value prop.','Sports-family social content is a strong reach channel (per DMA-02 reachability).','Establish social presence targeting sports parents (FB/IG/TikTok)',false,null,'low','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,null,'reviews','none','high',array['TeamSnap','Cozi'],'No third-party reviews/ratings found; competitors have deep review footprints.','Trust signals are needed before paid acquisition converts.','Seed review/testimonial capture (no fabrication; ingest real reviews)',false,null,'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,null,'reputation','low','high',array['TeamSnap'],'Few external mentions/citations/press.','Earned mentions in youth-sports media (e.g., 5-Star Sports Media synergy) build authority.','Pursue citations/press in youth-sports communities',false,null,'low','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_multisport,null,'ai_readiness','medium','medium',array['TeamSnap','Cozi'],'venuewise.net describes HomeHuddle clearly (AI can understand it), but low authority/citations limit whether AI answer engines surface it. AI-search rank not directly measurable here.','Add structured data + authoritative descriptions to improve AI surfacing.','Add structured data (schema.org SoftwareApplication) + FAQ content',true,null,'low','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_hockey,i_hockey,'seo','none','high',array['TeamLinkt','Mad Puck','TeamSnap'],'Absent for hockey-family scheduling intents; hockey team apps rank.','Travel-hockey pain is acute; target hockey-family phrasing.','Create hockey-family scheduling landing page',true,src_search,'medium','ai_inferred','needs_review',v_owner),
   (v_ten,v_client,v_off,a_id,s_hockey,i_local,'google_business','low','medium',array['Local leagues/associations'],'No evidence of local (Buffalo/WNY) discoverability for the beachhead; needs verification.','Buffalo is the live beachhead — local presence could win travel-hockey families cheaply.','Create local Buffalo/WNY travel-hockey landing page + Google Business presence',true,null,'low','ai_inferred','needs_review',v_owner)
  on conflict do nothing;

  update dma.visibility_assessments set visibility_score = dma.compute_visibility_score(a_id) where id = a_id;
end $$;