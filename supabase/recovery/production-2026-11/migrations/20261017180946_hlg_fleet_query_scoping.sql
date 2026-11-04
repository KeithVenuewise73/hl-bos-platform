create or replace function fleet.api(op text,a jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<request_context>>
declare
 actor uuid:=auth.uid();w uuid;r text;v jsonb;x jsonb;c jsonb;f jsonb;rows jsonb;act jsonb;existing jsonb;
 rec fleet.inspections%rowtype;target_user uuid;level integer;newlevel integer;needed text;validitems text[];
 objectpath text;memberid uuid;oldrole text;expected bigint;
begin
 if actor is null or not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null) then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if (auth.jwt()->>'session_id') is not null and not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=actor) then raise exception 'Session revoked' using errcode='42501';end if;
 if op='workspaces' then
 return coalesce((select jsonb_agg(jsonb_build_object('id',ws.id,'name',ws.name,'role',m.role,'version',ws.module_version)) from fleet.workspaces ws join fleet.members m on m.workspace_id=ws.id where m.user_id=actor and m.active and fleet.member_role(ws.id) is not null),'[]');
 end if;
 if op='claim_owner' then
 select ws.id into w from fleet.workspaces ws join auth.users u on lower(u.email)=lower(ws.bootstrap_owner_email) where u.id=actor and u.email_confirmed_at is not null and not exists(select 1 from fleet.members m where m.workspace_id=ws.id and m.role='owner') order by ws.created_at limit 1 for update of ws;
 if w is null then raise exception 'No pending owner workspace for this verified account' using errcode='42501';end if;
 insert into fleet.members(workspace_id,user_id,role) values(w,actor,'owner');
 insert into fleet.audit_events(workspace_id,actor,kind) values(w,actor,'owner_claimed');return jsonb_build_object('workspace',w);
 end if;
 w:=(a->>'workspace')::uuid;r:=fleet.member_role(w);
 if r is null then raise exception 'No active membership in this company' using errcode='42501';end if;
 if op='snapshot' then
 select jsonb_build_object('id',1,'revision',ws.revision,'payload',case when ws.initialized then
 jsonb_build_object('assets',coalesce((select jsonb_agg(case when r='driver' then jsonb_build_object('id',u.id,'name',u.payload->>'name','type',u.payload->>'type','tankConfig',u.payload->>'tankConfig','status',case when exists(select 1 from fleet.inspections ir where ir.workspace_id=w and ir.unit_id=u.id and fleet.inspection_level(w,ir.id)>=2) then 'Out of service' else u.payload->>'status' end) else u.payload end order by u.id) from fleet.units u where u.workspace_id=w and fleet.can_unit(w,u.id)),'[]'),
 'work',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(z.payload order by z.id) from fleet.work_orders z where z.workspace_id=w),'[]') end,
 'fuel',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(z.payload order by z.id) from fleet.fuel_entries z where z.workspace_id=w),'[]') end,
 'drivers',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(z.payload order by z.id) from fleet.driver_profiles z where z.workspace_id=w),'[]') end,
 'driverEvents',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(z.payload order by z.id) from fleet.driver_events z where z.workspace_id=w),'[]') end,'policy',ws.policy) else null end) into v from fleet.workspaces ws where ws.id=w;
 return jsonb_build_object('state',v,
 'inspections',coalesce((select jsonb_agg(jsonb_build_object('id',ir.id,'actor',ir.actor,'created_at',ir.created_at,'payload',ir.payload) order by ir.created_at,ir.id) from fleet.inspections ir where ir.workspace_id=w and fleet.can_unit(w,ir.unit_id)),'[]'),
 'inspection_actions',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'actor',ac.actor,'created_at',ac.created_at,'payload',ac.payload) order by ac.created_at,ac.id) from fleet.inspection_actions ac join fleet.inspections ir on ir.workspace_id=ac.workspace_id and ir.id=ac.inspection_id where ac.workspace_id=w and fleet.can_unit(w,ir.unit_id)),'[]'),
 'unit_records',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'asset',z.unit_id,'work_id',z.work_id,'actor',z.actor,'created_at',z.created_at,'payload',z.payload) order by z.created_at,z.id) from fleet.service_records z where z.workspace_id=w),'[]') end,
 'unit_documents',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'asset',z.unit_id,'record_id',z.record_id,'object_key',z.object_key,'actor',z.actor,'created_at',z.created_at,'payload',z.payload) order by z.created_at,z.id) from fleet.documents z where z.workspace_id=w),'[]') end,
 'unit_record_events',case when r='driver' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'actor',z.actor,'created_at',z.created_at,'payload',z.payload) order by z.created_at,z.id) from fleet.record_events z where z.workspace_id=w),'[]') end);
 end if;
 -- Serialize writes within a company, including repair release vs new defects and concurrent snapshots.
 perform 1 from fleet.workspaces where id=w for update;
 if op='save_fleet' then
 if r not in ('owner','manager') then raise exception 'Owner or manager required' using errcode='42501';end if;
 expected:=(a->>'revision')::bigint;
 if expected is null then raise exception 'Revision required';end if;
 if expected<>(select revision from fleet.workspaces where id=w) then return jsonb_build_object('changes',0);end if;
 f:=a->'fleet';
 if jsonb_typeof(f->'assets') is distinct from 'array' or jsonb_typeof(f->'work') is distinct from 'array' or jsonb_typeof(f->'fuel') is distinct from 'array' then raise exception 'Invalid fleet snapshot';end if;
 if jsonb_array_length(f->'assets')>10000 then raise exception 'Batch exceeds 10,000 units';end if;
 if exists(select 1 from jsonb_array_elements(f->'assets') z where coalesce(z->>'id','')!~'^[A-Za-z0-9_-]{1,80}$') or (select count(*)<>count(distinct z->>'id') from jsonb_array_elements(f->'assets') z) then raise exception 'Invalid or duplicate unit ID';end if;
 -- Existing units with records are protected by foreign keys. Removal of assigned equipment is also blocked.
 for x in select value from jsonb_array_elements(f->'assets') loop
 if exists(select 1 from fleet.inspections ir where ir.workspace_id=w and ir.unit_id=x->>'id' and fleet.inspection_level(w,ir.id)>=2) then x:=jsonb_set(x,'{status}','"Out of service"');end if;
 insert into fleet.units(workspace_id,id,payload) values(w,x->>'id',x) on conflict(workspace_id,id) do update set payload=excluded.payload;
 end loop;
 for x in select value from jsonb_array_elements(f->'work') loop
 if coalesce(x->>'id','')!~'^[A-Za-z0-9_-]{1,100}$' or (x->>'cost')::numeric<0 then raise exception 'Invalid work order';end if;
 insert into fleet.work_orders(workspace_id,id,unit_id,payload) values(w,x->>'id',x->>'asset',x) on conflict(workspace_id,id) do update set unit_id=excluded.unit_id,payload=excluded.payload;
 end loop;
 for x in select value from jsonb_array_elements(f->'fuel') loop
 if coalesce(x->>'id','')!~'^[A-Za-z0-9_-]{1,100}$' or (x->>'cost')::numeric<0 or (x->>'gallons')::numeric<=0 then raise exception 'Invalid fuel entry';end if;
 insert into fleet.fuel_entries(workspace_id,id,unit_id,payload) values(w,x->>'id',x->>'asset',x) on conflict(workspace_id,id) do update set unit_id=excluded.unit_id,payload=excluded.payload;
 end loop;
 delete from fleet.work_orders z where z.workspace_id=w and not exists(select 1 from jsonb_array_elements(f->'work') x where x->>'id'=z.id);
 delete from fleet.fuel_entries z where z.workspace_id=w and not exists(select 1 from jsonb_array_elements(f->'fuel') x where x->>'id'=z.id);
 delete from fleet.units z where z.workspace_id=w and not exists(select 1 from jsonb_array_elements(f->'assets') x where x->>'id'=z.id);
 delete from fleet.driver_profiles where workspace_id=w;
 for x in select value from jsonb_array_elements(coalesce(f->'drivers','[]')) loop insert into fleet.driver_profiles values(w,x->>'id',x);end loop;
 delete from fleet.driver_events where workspace_id=w;
 for x in select value from jsonb_array_elements(coalesce(f->'driverEvents','[]')) loop insert into fleet.driver_events values(w,x->>'id',x);end loop;
 update fleet.workspaces set revision=revision+1,initialized=true,policy=coalesce(f->'policy',policy) where id=w;
 insert into fleet.audit_events(workspace_id,actor,kind,details) values(w,actor,'fleet_saved',jsonb_build_object('previous_revision',expected));return jsonb_build_object('changes',1);
 end if;
 if op='submit_inspection' then
 v:=a->'report';
 if coalesce(v->>'id','')!~'^DV-[A-Za-z0-9-]{6,80}$' or not fleet.can_unit(w,v->>'asset') then raise exception 'Unit not assigned or invalid report' using errcode='42501';end if;
 if not exists(select 1 from fleet.units where workspace_id=w and id=v->>'asset') then raise exception 'Unit not found';end if;
 select ir.payload into existing from fleet.inspections ir where ir.workspace_id=w and ir.id=v->>'id' and ir.actor=request_context.actor;
 if existing is not null then return jsonb_build_object('changes',0,'duplicate',true);end if;
 if not (v ?& array['odometer','inspectedAt','checks']) or jsonb_typeof(v->'odometer')<>'number' or coalesce(v->>'phase','') not in ('Pre-trip','End-of-day','En-route') or coalesce(length(trim(v->>'signature')),0) not between 1 and 120 or v->'consent' is distinct from 'true'::jsonb or coalesce(length(trim(v->>'driver')),0) not between 1 and 120 or (v->>'odometer')::numeric<0 or (v->>'inspectedAt')::timestamptz>now()+interval '5 minutes' then raise exception 'Invalid signed inspection';end if;
 if jsonb_typeof(v->'checks') is distinct from 'array' or jsonb_array_length(v->'checks')>30 then raise exception 'Invalid checklist';end if;
 validitems:=array['Service brakes / connections','Parking brake','Steering','Lights / reflectors','Tires','Horn','Windshield wipers','Mirrors','Coupling devices','Wheels / rims','Emergency equipment'];
 if exists(select 1 from fleet.units u where u.workspace_id=w and u.id=v->>'asset' and (u.payload->>'type'='Tanker' or coalesce(u.payload->>'tankConfig','Not applicable') not in ('Not applicable',''))) then validitems:=validitems||array['Tank / fittings / leaks','Valves / caps / closures','Hoses / delivery equipment','Placards / markings','Emergency shutoff'];end if;
 foreach needed in array validitems loop if not exists(select 1 from jsonb_array_elements(v->'checks') c where c->>'item'=needed) then raise exception 'Required checklist item missing: %',needed;end if;end loop;
 if (select count(*)<>count(distinct c->>'item') from jsonb_array_elements(v->'checks') c) then raise exception 'Duplicate checklist items';end if;
 for c in select value from jsonb_array_elements(v->'checks') loop
 if coalesce(c->>'result','') not in ('Pass','Defect','Not applicable') then raise exception 'Invalid inspection result';end if;
 if c->>'result'='Defect' and (coalesce((c->>'level')::integer,0) not between 1 and 4 or coalesce(length(trim(c->>'note')),0) not between 1 and 1500) then raise exception 'Defect needs severity and description';end if;
 end loop;
 if v->>'photo' is not null and (v->>'photo'<>('dvir/'||(v->>'id')||'.jpg') or not exists(select 1 from storage.objects o where o.bucket_id='hlg-fleet-documents' and o.name=w::text||'/'||(v->>'photo') and o.owner_id=actor::text)) then raise exception 'Invalid inspection photo';end if;
 if v->>'phase'='Pre-trip' then
 for rec in select * from fleet.inspections ir where ir.workspace_id=w and ir.unit_id=v->>'asset' loop
 select payload into act from fleet.inspection_actions ac where ac.workspace_id=w and ac.inspection_id=rec.id and ac.payload->>'kind' in ('assess','certify') order by ac.created_at desc,ac.id desc limit 1;
 if act->>'kind'='certify' and not exists(select 1 from fleet.inspection_actions ac where ac.workspace_id=w and ac.inspection_id=rec.id and ac.actor=request_context.actor and ac.payload->>'kind'='review') then
 if not exists(select 1 from jsonb_array_elements(coalesce(a->'reviews','[]')) z where z->>'inspection'=rec.id) then raise exception 'Prior repair certification acknowledgment required';end if;
 insert into fleet.inspection_actions(workspace_id,id,inspection_id,actor,payload) values(w,gen_random_uuid()::text,rec.id,actor,jsonb_build_object('inspection',rec.id,'kind','review','signature',v->>'signature','consent',true,'note','Prior report and repair certification reviewed before driving.'));
 end if;
 end loop;end if;
 v:=v||jsonb_build_object('companyPolicy',(select policy from fleet.workspaces where id=w));
 insert into fleet.inspections(workspace_id,id,unit_id,actor,payload) values(w,v->>'id',v->>'asset',actor,v);
 return jsonb_build_object('changes',1);
 end if;
 if op='submit_action' then
 v:=a->'action';select * into rec from fleet.inspections ir where ir.workspace_id=w and ir.id=v->>'inspection';
 if rec.id is null or not fleet.can_unit(w,rec.unit_id) then raise exception 'Report not accessible' using errcode='42501';end if;
 if not exists(select 1 from jsonb_array_elements(rec.payload->'checks') c where c->>'result'='Defect') then raise exception 'No defect to act on';end if;
 if coalesce(v->>'kind','') not in ('acknowledge','assess','certify','review') or coalesce(length(trim(v->>'signature')),0) not between 1 and 120 or v->'consent' is distinct from 'true'::jsonb or coalesce(length(trim(v->>'note')),0) not between 1 and 2000 then raise exception 'Invalid signed action';end if;
 if r='driver' and v->>'kind'<>'review' then raise exception 'Maintenance permission required' using errcode='42501';end if;
 select payload into act from fleet.inspection_actions ac where ac.workspace_id=w and ac.inspection_id=rec.id and ac.payload->>'kind' in ('assess','certify') order by ac.created_at desc,ac.id desc limit 1;
 if v->>'kind' in ('assess','certify') and act->>'kind'='certify' then raise exception 'Already certified; submit a new defect';end if;
 if v->>'kind'='review' and coalesce(act->>'kind','')<>'certify' then raise exception 'Repair certification required first';end if;
 if v->>'kind'='assess' and (coalesce(v->>'level','0')::integer not between 1 and 4) then raise exception 'Invalid severity';end if;
 if v->>'kind'='certify' and (coalesce(v->>'resolution','') not in ('Repaired','Repair unnecessary') or (v->>'resolution'='Repair unnecessary' and fleet.inspection_level(w,rec.id)>=3)) then raise exception 'Safety holds require repair or signed reassessment';end if;
 insert into fleet.inspection_actions(workspace_id,id,inspection_id,actor,payload) values(w,gen_random_uuid()::text,rec.id,actor,v);return jsonb_build_object('changes',1);
 end if;
 if op in ('submit_service','submit_document','submit_event') and r='driver' then raise exception 'Maintenance permission required' using errcode='42501';end if;
 if op='submit_service' then
 v:=a->'record';
 if coalesce(v->>'category','') not in ('Repair','Preventive maintenance','Inspection / testing','Fuel','Insurance','Registration / permits','Tires','Tolls','Other') or coalesce(length(trim(v->>'title')),0) not between 1 and 160 or coalesce(v->>'id','')!~'^SRV-[A-Za-z0-9-]{6,80}$' or (v->>'costCents')!~'^[0-9]+$' then raise exception 'Invalid service record';end if;
 perform (v->>'date')::date;if nullif(v->>'due','') is not null then perform (v->>'due')::date;end if;
 if nullif(v->>'work','') is not null and not exists(select 1 from fleet.work_orders wo where wo.workspace_id=w and wo.id=v->>'work' and wo.unit_id=v->>'asset' and wo.payload->>'status'='Completed') then raise exception 'Completed work order must belong to this unit';end if;
 if nullif(v->>'inspection','') is not null and not exists(select 1 from fleet.inspections ir where ir.workspace_id=w and ir.id=v->>'inspection' and ir.unit_id=v->>'asset') then raise exception 'DVIR must belong to this unit';end if;
 insert into fleet.service_records(workspace_id,id,unit_id,work_id,inspection_id,cost_cents,actor,payload) values(w,v->>'id',v->>'asset',nullif(v->>'work',''),nullif(v->>'inspection',''),(v->>'costCents')::bigint,actor,v);return jsonb_build_object('changes',1);
 end if;
 if op='submit_document' then
 v:=a->'document';objectpath:=a->>'object_key';
 if coalesce(v->>'id','')!~'^DOC-[A-Za-z0-9-]{6,80}$' or coalesce(v->>'kind','') not in ('Repair report','Receipt / invoice','Inspection certificate','Registration / permit','Warranty','Other') or objectpath!~'^unit-documents/DOC-[A-Za-z0-9-]+\.(pdf|jpg|png|webp)$' or (v->>'size')::bigint not between 1 and 10485760 then raise exception 'Invalid document metadata';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='hlg-fleet-documents' and o.name=w::text||'/'||objectpath and o.owner_id=actor::text) then raise exception 'Document must be uploaded by this account first';end if;
 if nullif(v->>'record','') is not null and not exists(select 1 from fleet.service_records sr where sr.workspace_id=w and sr.id=v->>'record' and sr.unit_id=v->>'asset') then raise exception 'Document must link to this unit';end if;
 insert into fleet.documents(workspace_id,id,unit_id,record_id,object_key,actor,payload) values(w,v->>'id',v->>'asset',nullif(v->>'record',''),objectpath,actor,v);return jsonb_build_object('changes',1);
 end if;
 if op='submit_event' then
 v:=a->'event';
 if coalesce(v->>'kind','') not in ('Void cost record','Review document') or coalesce(length(trim(v->>'signature')),0) not between 1 and 120 or v->'consent' is distinct from 'true'::jsonb or coalesce(length(trim(v->>'reason')),0) not between 1 and 2000 then raise exception 'Invalid signed event';end if;
 if v->>'kind'='Void cost record' and not exists(select 1 from fleet.service_records sr where sr.workspace_id=w and sr.id=v->>'target') then raise exception 'Cost record not found';end if;
 if v->>'kind'='Review document' and not exists(select 1 from fleet.documents d where d.workspace_id=w and d.id=v->>'target') then raise exception 'Document not found';end if;
 insert into fleet.record_events(workspace_id,id,target,kind,actor,payload) values(w,v->>'id',v->>'target',v->>'kind',actor,v);return jsonb_build_object('changes',1);
 end if;
 if op='team' then
 if r not in ('owner','manager') then raise exception 'Manager required' using errcode='42501';end if;
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'email',u.email,'role',m.role,'active',m.active,'units',coalesce((select jsonb_agg(z.unit_id) from fleet.assignments z where z.workspace_id=w and z.user_id=m.user_id),'[]'))) from fleet.members m join auth.users u on u.id=m.user_id where m.workspace_id=w),'[]'));
 end if;
 if op='save_member' then
 if r<>'owner' then raise exception 'Only the company owner can manage access' using errcode='42501';end if;
 select id into target_user from auth.users where lower(email)=lower(trim(a->>'email')) and email_confirmed_at is not null;
 if target_user is null then raise exception 'This person must create and verify an HLG account first';end if;
 if coalesce(a->>'role','') not in ('owner','manager','maintenance','driver') then raise exception 'Invalid role';end if;
 if target_user=actor and ((a->>'role')<>'owner' or a->'active' is distinct from 'true'::jsonb) then raise exception 'You cannot remove your own owner access';end if;
 select role into oldrole from fleet.members where workspace_id=w and user_id=target_user;
 if oldrole='owner' and ((a->>'role')<>'owner' or a->'active' is distinct from 'true'::jsonb) and (select count(*) from fleet.members where workspace_id=w and role='owner' and active)<=1 then raise exception 'At least one owner is required';end if;
 insert into fleet.members(workspace_id,user_id,role,active) values(w,target_user,a->>'role',(a->>'active')::boolean) on conflict(workspace_id,user_id) do update set role=excluded.role,active=excluded.active;
 delete from fleet.assignments where workspace_id=w and user_id=target_user;
 for x in select value from jsonb_array_elements(coalesce(a->'units','[]')) loop insert into fleet.assignments values(w,x#>>'{}',target_user);end loop;
 insert into fleet.audit_events(workspace_id,actor,kind,details) values(w,actor,'member_updated',jsonb_build_object('user',target_user,'role',a->>'role','active',a->'active','units',a->'units'));return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unsupported operation';
end $$;
