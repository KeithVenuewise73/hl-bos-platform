-- Product-owned company and membership records. Existing scorecards retain their company IDs.
create table scorecard.companies(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),bootstrap_owner_email text,created_by uuid references auth.users(id),created_at timestamptz not null default now());
create table scorecard.members(workspace_id uuid not null references scorecard.companies(id),user_id uuid not null references auth.users(id),role text not null check(role in ('owner','manager')),active boolean not null default true,primary key(workspace_id,user_id));
create table scorecard.audit_events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references scorecard.companies(id),actor uuid not null references auth.users(id),kind text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
insert into scorecard.companies(id,name,bootstrap_owner_email) select id,name,bootstrap_owner_email from fleet.workspaces;
insert into scorecard.members(workspace_id,user_id,role,active) select workspace_id,user_id,role,active from fleet.members where role in ('owner','manager');
alter table scorecard.definitions drop constraint definitions_workspace_id_fkey;
alter table scorecard.definitions add constraint definitions_company_fkey foreign key(workspace_id) references scorecard.companies(id);
alter table scorecard.runs drop constraint runs_workspace_id_fkey;
alter table scorecard.runs add constraint runs_company_fkey foreign key(workspace_id) references scorecard.companies(id);
create function scorecard.member_role(w uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from scorecard.members m join auth.users u on u.id=m.user_id where m.workspace_id=w and m.user_id=(select auth.uid()) and m.active and u.email_confirmed_at is not null
$$;
revoke all on function scorecard.member_role(uuid) from public,anon;
grant execute on function scorecard.member_role(uuid) to authenticated;
alter table scorecard.companies enable row level security;
alter table scorecard.members enable row level security;
alter table scorecard.audit_events enable row level security;
revoke all on scorecard.companies,scorecard.members,scorecard.audit_events from public,anon,authenticated;
create policy company_read on scorecard.companies for select to authenticated using(scorecard.member_role(id) is not null);
create policy member_read on scorecard.members for select to authenticated using(scorecard.member_role(workspace_id) is not null);
create policy audit_read on scorecard.audit_events for select to authenticated using(scorecard.member_role(workspace_id)='owner');
drop policy company_scorecard_read on scorecard.definitions;
drop policy company_scorecard_run_read on scorecard.runs;
create policy company_scorecard_read on scorecard.definitions for select to authenticated using(scorecard.member_role(workspace_id) is not null);
create policy company_scorecard_run_read on scorecard.runs for select to authenticated using(scorecard.member_role(workspace_id) is not null);
create function scorecard.immutable_record() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Saved scorecard records are immutable';end$$;
revoke all on function scorecard.immutable_record() from public,anon,authenticated;
drop trigger frozen_scorecard_definition on scorecard.definitions;
drop trigger frozen_scorecard_run on scorecard.runs;
create trigger frozen_scorecard_definition before update or delete on scorecard.definitions for each row execute function scorecard.immutable_record();
create trigger frozen_scorecard_run before update or delete on scorecard.runs for each row execute function scorecard.immutable_record();
create trigger frozen_scorecard_audit before update or delete on scorecard.audit_events for each row execute function scorecard.immutable_record();
create or replace function scorecard.api(op text,a jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();w uuid:=(a->>'workspace')::uuid;v jsonb;m jsonb;x jsonb;value jsonb;d scorecard.definitions%rowtype;root uuid;id uuid;version integer;total numeric:=0;keys text[];seen text[]:='{}';key text;
begin
 if actor is null or scorecard.member_role(w) not in ('owner','manager') or scorecard.member_role(w) is null then raise exception 'Company owner or manager access required' using errcode='42501';end if;
 if (auth.jwt()->>'session_id') is not null and not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=actor) then raise exception 'Session revoked' using errcode='42501';end if;
 if op='list' then return jsonb_build_object('definitions',coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at desc) from scorecard.definitions z where z.workspace_id=w),'[]'),'runs',coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at desc) from (select id,definition_id,name,source,created_at,jsonb_array_length(records) as row_count from scorecard.runs where workspace_id=w order by created_at desc limit 100) z),'[]'));end if;
 if op='get_run' then select to_jsonb(z) into v from scorecard.runs z where z.workspace_id=w and z.id=(a->>'id')::uuid;if v is null then raise exception 'Run not found' using errcode='42501';end if;return v;end if;
 perform 1 from scorecard.companies where id=w for update;
 if op='save_definition' then
 v:=a->'config';if coalesce(length(trim(v->>'name')),0) not between 1 and 100 or coalesce(v->>'missing','') not in ('incomplete','zero','redistribute') or coalesce(jsonb_typeof(v->'metrics'),'')<>'array' or jsonb_array_length(v->'metrics') not between 1 and 20 then raise exception 'Invalid scorecard definition';end if;
 if jsonb_typeof(v->'good') is distinct from 'number' or jsonb_typeof(v->'excellent') is distinct from 'number' or not(v ?& array['good','excellent']) or (v->>'good')::numeric<0 or (v->>'excellent')::numeric>100 or (v->>'good')::numeric >= (v->>'excellent')::numeric then raise exception 'Invalid performance thresholds';end if;
 for m in select value from jsonb_array_elements(v->'metrics') loop
 if coalesce(m->>'id','')!~'^[A-Za-z][A-Za-z0-9_-]{0,39}$' or coalesce(length(trim(m->>'name')),0) not between 1 and 100 or coalesce(m->>'direction','') not in ('higher','lower') or not(m ?& array['weight','worst','target','enabled']) or jsonb_typeof(m->'enabled')<>'boolean' then raise exception 'Invalid category';end if;
 if jsonb_typeof(m->'weight')<>'number' or jsonb_typeof(m->'worst')<>'number' or jsonb_typeof(m->'target')<>'number' or (m->>'weight')::numeric not between 0 and 100 or (m->>'weight')::numeric*100<>round((m->>'weight')::numeric*100) then raise exception 'Invalid category numeric settings';end if;
 if (m->>'direction'='higher' and (m->>'target')::numeric <= (m->>'worst')::numeric) or (m->>'direction'='lower' and (m->>'target')::numeric >= (m->>'worst')::numeric) then raise exception 'Category target must be better than its zero-point boundary';end if;
 if (m->>'enabled')::boolean then total:=total+(m->>'weight')::numeric;elsif (m->>'weight')::numeric<>0 then raise exception 'Disabled categories must have zero weight';end if;
 end loop;
 if total<>100 or (select count(*)<>count(distinct z->>'id') from jsonb_array_elements(v->'metrics') z) then raise exception 'Unique categories with enabled weights totaling 100%% are required';end if;
 if nullif(a->>'previous','') is not null then select * into d from scorecard.definitions z where z.workspace_id=w and z.id=(a->>'previous')::uuid;if d.id is null then raise exception 'Previous definition not found';end if;root:=d.root_id;select max(z.version)+1 into version from scorecard.definitions z where z.workspace_id=w and z.root_id=root;else root:=gen_random_uuid();version:=1;end if;
 insert into scorecard.definitions(workspace_id,root_id,version,name,config,created_by) values(w,root,version,trim(v->>'name'),v,actor) returning definitions.id into id;
 insert into scorecard.audit_events(workspace_id,actor,kind,details) values(w,actor,'scorecard_definition_saved',jsonb_build_object('definition',id,'version',version));return jsonb_build_object('id',id,'version',version);
 end if;
 if op='save_run' then
 select * into d from scorecard.definitions z where z.workspace_id=w and z.id=(a->>'definition')::uuid;if d.id is null then raise exception 'Select a saved company scorecard version';end if;
 v:=a->'records';if coalesce(jsonb_typeof(v),'')<>'array' or jsonb_array_length(v) not between 1 and 5000 or coalesce(length(trim(a->>'name')),0) not between 1 and 120 then raise exception 'Use a named run with 1–5,000 records';end if;
 for x in select value from jsonb_array_elements(v) loop
 if coalesce(length(trim(x->>'entity')),0) not between 1 and 160 or coalesce(length(x->>'entityId'),0) not between 1 and 160 or coalesce(length(x->>'entityType'),0) not between 1 and 40 or coalesce(jsonb_typeof(x->'metrics'),'')<>'object' then raise exception 'Each record needs an entity, ID, type, and metrics';end if;
 key:=jsonb_build_array(x->>'entityId',x->>'entityType',x->>'period',x->>'group',x->>'location')::text;if key=any(seen) then raise exception 'Duplicate entity/period/group/location; do not silently average rates';end if;seen:=array_append(seen,key);
 for m in select value from jsonb_array_elements(d.config->'metrics') loop value:=x->'metrics'->(m->>'id');if value is not null and value<>'null'::jsonb and jsonb_typeof(value)<>'number' then raise exception 'Metric values must be numbers or null';end if;end loop;
 if exists(select 1 from jsonb_object_keys(x->'metrics') k where not exists(select 1 from jsonb_array_elements(d.config->'metrics') z where z->>'id'=k)) then raise exception 'Unknown metric in run';end if;
 end loop;
 insert into scorecard.runs(workspace_id,definition_id,name,records,source,created_by) values(w,d.id,trim(a->>'name'),v,coalesce(a->'source','{}'),actor) returning runs.id into id;
 insert into scorecard.audit_events(workspace_id,actor,kind,details) values(w,actor,'scorecard_run_saved',jsonb_build_object('run',id,'definition',d.id,'rows',jsonb_array_length(v)));return jsonb_build_object('id',id);
 end if;
 raise exception 'Unsupported scorecard operation';
end $$;

create function scorecard.account_api(op text,a jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();w uuid:=(a->>'workspace')::uuid;target_user uuid;result jsonb;r text;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Verified HLG account required' using errcode='42501';end if;
 if (auth.jwt()->>'session_id') is not null and not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=actor) then raise exception 'Session revoked' using errcode='42501';end if;
 if op='workspaces' then return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',m.role) order by c.name) from scorecard.companies c join scorecard.members m on m.workspace_id=c.id where m.user_id=actor and m.active),'[]');end if;
 if op='claim_owner' then
 insert into scorecard.members(workspace_id,user_id,role,active) select c.id,actor,'owner',true from scorecard.companies c join auth.users u on u.id=actor where lower(c.bootstrap_owner_email)=lower(u.email) and not exists(select 1 from scorecard.members m where m.workspace_id=c.id and m.active and m.role='owner') on conflict(workspace_id,user_id) do update set role='owner',active=true;
 return jsonb_build_object('claimed',true);
 end if;
 if op='create_company' then
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if coalesce(length(trim(a->>'name')),0) not between 1 and 100 then raise exception 'Enter a company name (1–100 characters)';end if;
 if (select count(*) from scorecard.companies where created_by=actor)>=5 then raise exception 'Contact HLG to add more company workspaces';end if;
 insert into scorecard.companies(name,created_by) values(trim(a->>'name'),actor) returning id into w;
 insert into scorecard.members values(w,actor,'owner',true);
 insert into scorecard.audit_events(workspace_id,actor,kind) values(w,actor,'company_created');
 return jsonb_build_object('workspace',w);
 end if;
 if scorecard.member_role(w) is distinct from 'owner' then raise exception 'Scorecards company owner access required' using errcode='42501';end if;
 if op='team' then return coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'role',m.role,'active',m.active) order by u.email) from scorecard.members m join auth.users u on u.id=m.user_id where m.workspace_id=w),'[]');end if;
 if op='save_member' then
 perform 1 from scorecard.companies where id=w for update;
 r:=a->>'role';if r not in ('owner','manager') or r is null or jsonb_typeof(a->'active') is distinct from 'boolean' then raise exception 'Choose owner or manager and active status';end if;
 select id into target_user from auth.users where lower(email)=lower(trim(a->>'email')) and email_confirmed_at is not null;
 if target_user is null then raise exception 'That email must first register and verify an HLG account';end if;
 if target_user=actor and (r<>'owner' or not (a->>'active')::boolean) then raise exception 'You cannot remove your own owner access';end if;
 insert into scorecard.members(workspace_id,user_id,role,active) values(w,target_user,r,(a->>'active')::boolean) on conflict(workspace_id,user_id) do update set role=excluded.role,active=excluded.active;
 insert into scorecard.audit_events(workspace_id,actor,kind,details) values(w,actor,'member_updated',jsonb_build_object('user',target_user,'role',r,'active',a->'active'));
 return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unsupported company operation';
end$$;
revoke all on function scorecard.account_api(text,jsonb) from public,anon;
grant execute on function scorecard.account_api(text,jsonb) to authenticated;
create function public.hlg_scorecard_account_rpc(p_op text,p_args jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select scorecard.account_api(p_op,p_args)$$;
revoke all on function public.hlg_scorecard_account_rpc(text,jsonb) from public,anon;
grant execute on function public.hlg_scorecard_account_rpc(text,jsonb) to authenticated;
notify pgrst,'reload schema';
