create schema scorecard;
revoke all on schema scorecard from public,anon;
grant usage on schema scorecard to authenticated;
create table scorecard.definitions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references fleet.workspaces(id),
 root_id uuid not null,version integer not null check(version>0),name text not null,
 config jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,root_id,version),unique(workspace_id,id)
);
create index scorecard_definitions_company on scorecard.definitions(workspace_id,created_at desc);
create table scorecard.runs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references fleet.workspaces(id),
 definition_id uuid not null,name text not null,records jsonb not null,source jsonb not null default '{}',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,definition_id) references scorecard.definitions(workspace_id,id)
);
create index scorecard_runs_company on scorecard.runs(workspace_id,created_at desc);
alter table scorecard.definitions enable row level security;
alter table scorecard.runs enable row level security;
revoke all on all tables in schema scorecard from public,anon,authenticated;
create policy company_scorecard_read on scorecard.definitions for select to authenticated using(fleet.member_role(workspace_id) in ('owner','manager'));
create policy company_scorecard_run_read on scorecard.runs for select to authenticated using(fleet.member_role(workspace_id) in ('owner','manager'));
create trigger frozen_scorecard_definition before update or delete on scorecard.definitions for each row execute function fleet.immutable_record();
create trigger frozen_scorecard_run before update or delete on scorecard.runs for each row execute function fleet.immutable_record();
create function scorecard.api(op text,a jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();w uuid:=(a->>'workspace')::uuid;v jsonb;m jsonb;x jsonb;value jsonb;d scorecard.definitions%rowtype;root uuid;id uuid;version integer;total numeric:=0;keys text[];seen text[]:='{}';key text;
begin
 if actor is null or fleet.member_role(w) not in ('owner','manager') or fleet.member_role(w) is null then raise exception 'Company owner or manager access required' using errcode='42501';end if;
 if (auth.jwt()->>'session_id') is not null and not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=actor) then raise exception 'Session revoked' using errcode='42501';end if;
 if op='list' then return jsonb_build_object('definitions',coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at desc) from scorecard.definitions z where z.workspace_id=w),'[]'),'runs',coalesce((select jsonb_agg(to_jsonb(z) order by z.created_at desc) from (select id,definition_id,name,source,created_at,jsonb_array_length(records) as row_count from scorecard.runs where workspace_id=w order by created_at desc limit 100) z),'[]'));end if;
 if op='get_run' then select to_jsonb(z) into v from scorecard.runs z where z.workspace_id=w and z.id=(a->>'id')::uuid;if v is null then raise exception 'Run not found' using errcode='42501';end if;return v;end if;
 perform 1 from fleet.workspaces where id=w for update;
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
 insert into fleet.audit_events(workspace_id,actor,kind,details) values(w,actor,'scorecard_definition_saved',jsonb_build_object('definition',id,'version',version));return jsonb_build_object('id',id,'version',version);
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
 insert into fleet.audit_events(workspace_id,actor,kind,details) values(w,actor,'scorecard_run_saved',jsonb_build_object('run',id,'definition',d.id,'rows',jsonb_array_length(v)));return jsonb_build_object('id',id);
 end if;
 raise exception 'Unsupported scorecard operation';
end $$;
revoke all on all functions in schema scorecard from public,anon,authenticated;
grant execute on function scorecard.api(text,jsonb) to authenticated;
create function public.hlg_scorecard_rpc(p_op text,p_args jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select scorecard.api(p_op,p_args)$$;
revoke all on function public.hlg_scorecard_rpc(text,jsonb) from public,anon;
grant execute on function public.hlg_scorecard_rpc(text,jsonb) to authenticated;
notify pgrst,'reload schema';
