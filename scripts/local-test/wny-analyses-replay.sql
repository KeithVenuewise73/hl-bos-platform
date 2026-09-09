do $do$
declare
  v_tenant uuid := '8a669381-1756-4231-949f-26954f2281e3';
  v_user   uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  -- The six DISTINCT analyses the runner produced for the 40 shops that need
  -- no fetch, and which sheet row got which. Computed by
  -- _shared/transform_audit/run.ts; this block only stores them.
  v_shapes jsonb := '[{"findings": [{"code": "no_website", "statement": "No dedicated website was found for this shop, so there is no page for a customer to land on.", "confidence": "inferred", "severity": "critical", "evidence_url": null, "observed": {"source": "prospect list"}, "detector": "barber_web_rubric"}], "recommendations": [{"priority": "structural", "rank": 1, "title": "Put up a real site the shop owns", "detail": "There is nowhere for a search result or a social profile to send anyone. A single page with hours, services, prices and a booking button covers most of what is missing.", "capability_key": "owned_website", "addresses_code": "no_website"}], "dimension": {"score": 0, "confidence": "inferred", "rubric_version": "barber-web-0.1.0", "note": "No website to assess: the prospect list records none. Scored 0 because there is nothing there, not because something scored badly."}, "hook": {"code": "no_website", "text": "There is no website behind your name, so every search that finds you ends there."}}, {"findings": [{"code": "owned_domain", "statement": "The shop''s web presence is a page on square_appointments; no owned domain was found.", "confidence": "inferred", "severity": "high", "evidence_url": null, "observed": {"platform": "square_appointments", "source": "prospect list", "note": "Square booking site / dedicated domain not confirmed"}, "detector": "barber_web_rubric"}, {"code": "online_booking", "statement": "A booking presence was found on square_appointments, so customers can book without calling.", "confidence": "inferred", "severity": "info", "evidence_url": null, "observed": {"platform": "square_appointments", "note": "Square booking site / dedicated domain not confirmed"}, "detector": "barber_web_rubric"}], "recommendations": [{"priority": "structural", "rank": 2, "title": "Move off the booking platform''s hosted page onto an owned site", "detail": "The shop''s presence, its reviews and its customer list currently belong to someone else''s platform. An owned site keeps the booking flow and the audience.", "capability_key": "owned_website", "addresses_code": "owned_domain"}], "dimension": {"score": null, "confidence": "unknown", "rubric_version": "barber-web-0.1.0", "note": "No page was fetched. Two facts are taken from the prospect list: a booking presence on square_appointments, and no owned domain. The site itself has not been assessed."}, "hook": {"code": "owned_domain", "text": "Your only web presence is a page on someone else''s booking platform, and so is your audience."}}, {"findings": [{"code": "owned_domain", "statement": "The shop''s web presence is a page on vistaprint; no owned domain was found.", "confidence": "inferred", "severity": "high", "evidence_url": null, "observed": {"platform": "vistaprint", "source": "prospect list", "note": "Vistaprint/booking presence reported; dedicated domain not confirmed"}, "detector": "barber_web_rubric"}, {"code": "online_booking", "statement": "A booking presence was found on vistaprint, so customers can book without calling.", "confidence": "inferred", "severity": "info", "evidence_url": null, "observed": {"platform": "vistaprint", "note": "Vistaprint/booking presence reported; dedicated domain not confirmed"}, "detector": "barber_web_rubric"}], "recommendations": [{"priority": "structural", "rank": 2, "title": "Move off the booking platform''s hosted page onto an owned site", "detail": "The shop''s presence, its reviews and its customer list currently belong to someone else''s platform. An owned site keeps the booking flow and the audience.", "capability_key": "owned_website", "addresses_code": "owned_domain"}], "dimension": {"score": null, "confidence": "unknown", "rubric_version": "barber-web-0.1.0", "note": "No page was fetched. Two facts are taken from the prospect list: a booking presence on vistaprint, and no owned domain. The site itself has not been assessed."}, "hook": {"code": "owned_domain", "text": "Your only web presence is a page on someone else''s booking platform, and so is your audience."}}, {"findings": [{"code": "owned_domain", "statement": "The shop''s web presence is a page on booksy; no owned domain was found.", "confidence": "inferred", "severity": "high", "evidence_url": null, "observed": {"platform": "booksy", "source": "prospect list", "note": "Booksy presence; dedicated site not confirmed"}, "detector": "barber_web_rubric"}, {"code": "online_booking", "statement": "A booking presence was found on booksy, so customers can book without calling.", "confidence": "inferred", "severity": "info", "evidence_url": null, "observed": {"platform": "booksy", "note": "Booksy presence; dedicated site not confirmed"}, "detector": "barber_web_rubric"}], "recommendations": [{"priority": "structural", "rank": 2, "title": "Move off the booking platform''s hosted page onto an owned site", "detail": "The shop''s presence, its reviews and its customer list currently belong to someone else''s platform. An owned site keeps the booking flow and the audience.", "capability_key": "owned_website", "addresses_code": "owned_domain"}], "dimension": {"score": null, "confidence": "unknown", "rubric_version": "barber-web-0.1.0", "note": "No page was fetched. Two facts are taken from the prospect list: a booking presence on booksy, and no owned domain. The site itself has not been assessed."}, "hook": {"code": "owned_domain", "text": "Your only web presence is a page on someone else''s booking platform, and so is your audience."}}, {"findings": [{"code": "owned_domain", "statement": "The shop''s web presence is a page on square_appointments; no owned domain was found.", "confidence": "inferred", "severity": "high", "evidence_url": null, "observed": {"platform": "square_appointments", "source": "prospect list", "note": "Square booking presence; dedicated site not confirmed"}, "detector": "barber_web_rubric"}, {"code": "online_booking", "statement": "A booking presence was found on square_appointments, so customers can book without calling.", "confidence": "inferred", "severity": "info", "evidence_url": null, "observed": {"platform": "square_appointments", "note": "Square booking presence; dedicated site not confirmed"}, "detector": "barber_web_rubric"}], "recommendations": [{"priority": "structural", "rank": 2, "title": "Move off the booking platform''s hosted page onto an owned site", "detail": "The shop''s presence, its reviews and its customer list currently belong to someone else''s platform. An owned site keeps the booking flow and the audience.", "capability_key": "owned_website", "addresses_code": "owned_domain"}], "dimension": {"score": null, "confidence": "unknown", "rubric_version": "barber-web-0.1.0", "note": "No page was fetched. Two facts are taken from the prospect list: a booking presence on square_appointments, and no owned domain. The site itself has not been assessed."}, "hook": {"code": "owned_domain", "text": "Your only web presence is a page on someone else''s booking platform, and so is your audience."}}, {"findings": [{"code": "owned_domain", "statement": "The shop''s web presence is a page on a booking platform; no owned domain was found.", "confidence": "inferred", "severity": "high", "evidence_url": null, "observed": {"platform": null, "source": "prospect list", "note": "Booking-platform presence; dedicated site not confirmed"}, "detector": "barber_web_rubric"}, {"code": "online_booking", "statement": "A booking presence was found on a booking platform, so customers can book without calling.", "confidence": "inferred", "severity": "info", "evidence_url": null, "observed": {"platform": null, "note": "Booking-platform presence; dedicated site not confirmed"}, "detector": "barber_web_rubric"}], "recommendations": [{"priority": "structural", "rank": 2, "title": "Move off the booking platform''s hosted page onto an owned site", "detail": "The shop''s presence, its reviews and its customer list currently belong to someone else''s platform. An owned site keeps the booking flow and the audience.", "capability_key": "owned_website", "addresses_code": "owned_domain"}], "dimension": {"score": null, "confidence": "unknown", "rubric_version": "barber-web-0.1.0", "note": "No page was fetched. Two facts are taken from the prospect list: a booking presence on a booking platform, and no owned domain. The site itself has not been assessed."}, "hook": {"code": "owned_domain", "text": "Your only web presence is a page on someone else''s booking platform, and so is your audience."}}]'::jsonb;
  v_map text := '2:0,6:0,7:0,8:0,11:0,12:0,14:0,15:0,16:0,17:0,18:0,21:0,22:0,23:0,24:1,25:0,26:0,27:0,28:0,29:0,30:0,31:0,32:0,33:0,34:2,35:0,36:0,37:3,38:4,40:0,41:0,42:0,43:0,44:0,45:0,46:0,47:5,49:0,50:0,51:0';
  v_campaign uuid; v_pair text; v_row int; v_shape jsonb;
  v_prospect uuid; v_run uuid; v_f jsonb; v_r jsonb; v_fid bigint;
  v_ids jsonb; v_n int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select id into v_campaign from transform_audit.campaigns
   where tenant_id = v_tenant and key = 'wny_barbers_50';

  foreach v_pair in array string_to_array(v_map, ',') loop
    v_row   := split_part(v_pair, ':', 1)::int;
    v_shape := v_shapes -> split_part(v_pair, ':', 2)::int;

    select sp.prospect_id into v_prospect from transform_audit.shop_profiles sp
     where sp.tenant_id = v_tenant and sp.source_row = v_row;
    if v_prospect is null then
      raise exception 'no shop imported at sheet row %', v_row;
    end if;

    v_run := transform_audit.start_run(v_campaign, v_prospect);
    v_ids := '{}'::jsonb;

    -- Findings first: a dimension cannot claim 'verified' before its evidence.
    for v_f in select * from jsonb_array_elements(v_shape->'findings') loop
      v_fid := transform_audit.record_finding(
        v_run, 'website', (v_f->>'code')::extensions.citext, v_f->>'statement',
        (v_f->>'confidence')::transform_audit.confidence,
        (v_f->>'severity')::transform_audit.severity,
        v_f->>'evidence_url', v_f->'observed',
        (v_f->>'detector')::extensions.citext);
      v_ids := v_ids || jsonb_build_object(v_f->>'code', v_fid);
    end loop;

    perform transform_audit.record_dimension(
      v_run, 'website',
      nullif(v_shape->'dimension'->>'score','')::int,
      (v_shape->'dimension'->>'confidence')::transform_audit.confidence,
      (v_shape->'dimension'->>'rubric_version')::extensions.citext,
      v_shape->'dimension'->>'note');

    for v_r in select * from jsonb_array_elements(v_shape->'recommendations') loop
      perform transform_audit.add_recommendation(
        v_run, (v_r->>'priority')::transform_audit.priority, v_r->>'title',
        v_r->>'detail', (v_r->>'capability_key')::extensions.citext,
        (v_ids ->> (v_r->>'addresses_code'))::bigint,
        (v_r->>'rank')::int);
    end loop;

    if v_shape->'hook' is not null and v_shape->'hook' <> 'null'::jsonb then
      perform transform_audit.set_outreach_hook(
        v_run, (v_ids ->> (v_shape->'hook'->>'code'))::bigint,
        v_shape->'hook'->>'text');
    end if;

    perform transform_audit.finish_run(v_run);
    v_n := v_n + 1;
  end loop;

  reset role;
  raise notice 'analysed % shops', v_n;
end $do$;