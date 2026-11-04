create table fleet.medical_cards(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references fleet.workspaces(id),driver_id text not null,object_key text not null unique,uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),size_bytes integer not null check(size_bytes between 1 and 8388608));
create index medical_cards_driver on fleet.medical_cards(workspace_id,driver_id,created_at desc);
alter table fleet.medical_cards enable row level security;
revoke all on fleet.medical_cards from public,anon,authenticated;
create policy medical_card_company_read on fleet.medical_cards for select to authenticated using(fleet.member_role(workspace_id) in ('owner','manager'));
create trigger medical_card_immutable before update or delete on fleet.medical_cards for each row execute function fleet.immutable_record();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('hlg-driver-medical-cards','hlg-driver-medical-cards',false,8388608,array['image/jpeg']);
create function fleet.medical_storage_allowed(path text,operation text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare w uuid;begin
 if path !~ '^[a-f0-9-]{36}/[A-Za-z0-9_-]{1,100}/[a-f0-9-]{36}\.jpg$' then return false;end if;
 w:=split_part(path,'/',1)::uuid;
 if coalesce(fleet.member_role(w),'') not in ('owner','manager') then return false;end if;
 if operation='insert' then return exists(select 1 from fleet.driver_profiles where workspace_id=w and id=split_part(path,'/',2));end if;
 if operation='select' then return exists(select 1 from fleet.medical_cards where workspace_id=w and object_key=path);end if;
 if operation='delete' then return not exists(select 1 from fleet.medical_cards where object_key=path);end if;
 return false;
 exception when invalid_text_representation then return false;
end$$;
revoke all on function fleet.medical_storage_allowed(text,text) from public,anon;
grant execute on function fleet.medical_storage_allowed(text,text) to authenticated;
create policy medical_card_upload on storage.objects for insert to authenticated with check(bucket_id='hlg-driver-medical-cards' and fleet.medical_storage_allowed(name,'insert'));
create policy medical_card_download on storage.objects for select to authenticated using(bucket_id='hlg-driver-medical-cards' and fleet.medical_storage_allowed(name,'select'));
create policy medical_card_orphan_cleanup on storage.objects for delete to authenticated using(bucket_id='hlg-driver-medical-cards' and owner_id=auth.uid()::text and fleet.medical_storage_allowed(name,'delete'));
create function fleet.medical_api(op text,a jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=(a->>'workspace')::uuid;actor uuid:=auth.uid();driver text:=a->>'driver';key text;doc fleet.medical_cards%rowtype;begin
 if coalesce(fleet.member_role(w),'') not in ('owner','manager') then raise exception 'Company owner or manager access required' using errcode='42501';end if;
 if auth.jwt()->>'session_id' is not null and not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=actor) then raise exception 'Session revoked' using errcode='42501';end if;
 if op='list' then
 if not exists(select 1 from fleet.driver_profiles where workspace_id=w and id=driver) then raise exception 'Save this driver to the shared fleet first';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'size',size_bytes) order by created_at desc) from fleet.medical_cards where workspace_id=w and driver_id=driver),'[]');end if;
 if op='save' then
 key:=a->>'key';if not fleet.medical_storage_allowed(key,'insert') or split_part(key,'/',1)<>w::text or split_part(key,'/',2)<>driver or (a->>'size')::integer not between 1 and 8388608 then raise exception 'Invalid medical card upload';end if;
 if not exists(select 1 from storage.objects where bucket_id='hlg-driver-medical-cards' and name=key and owner_id=actor::text and (metadata->>'size')::integer=(a->>'size')::integer and metadata->>'mimetype'='image/jpeg') then raise exception 'Upload the card image first';end if;
 insert into fleet.medical_cards(workspace_id,driver_id,object_key,uploaded_by,size_bytes) values(w,driver,key,actor,(a->>'size')::integer) returning * into doc;
 insert into fleet.audit_events(workspace_id,actor,kind,details) values(w,actor,'driver_medical_card_uploaded',jsonb_build_object('driver',driver,'card',doc.id));return jsonb_build_object('id',doc.id);end if;
 if op='download' then
 select * into doc from fleet.medical_cards where workspace_id=w and id=(a->>'id')::uuid;if doc.id is null then raise exception 'Medical card not found' using errcode='42501';end if;
 insert into fleet.audit_events(workspace_id,actor,kind,details) values(w,actor,'driver_medical_card_viewed',jsonb_build_object('driver',doc.driver_id,'card',doc.id));return jsonb_build_object('key',doc.object_key);end if;
 raise exception 'Unsupported medical card operation';
end$$;
revoke all on function fleet.medical_api(text,jsonb) from public,anon;
grant execute on function fleet.medical_api(text,jsonb) to authenticated;
create function public.hlg_fleet_medical_rpc(p_op text,p_args jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select fleet.medical_api(p_op,p_args)$$;
revoke all on function public.hlg_fleet_medical_rpc(text,jsonb) from public,anon;
grant execute on function public.hlg_fleet_medical_rpc(text,jsonb) to authenticated;
notify pgrst,'reload schema';
