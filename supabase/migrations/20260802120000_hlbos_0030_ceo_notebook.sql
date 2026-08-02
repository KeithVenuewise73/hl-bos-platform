-- ===========================================================================
-- v0_ceo_notebook — HLVS V2 Workstream B1 (Executive Intelligence)
--
-- ASSEMBLES on the existing `vstudio.notes` table — it does NOT create a new
-- store, app or duplicate schema. It extends notes ADDITIVELY so a note becomes
-- a typed "notebook entry": it may stand alone (no opportunity) or be linked to
-- one, it carries a kind (reusing vstudio.note_type + four new intelligence
-- intents), a task lifecycle status, an optional due date, an owning
-- intelligence program, and structured meta. Two SECURITY DEFINER RPCs create
-- entries and move their status. Nothing here is auto-applied.
--
-- Reuse (unchanged): identity/permissions, platform.tenants, events.emit,
-- platform.set_updated_at. No new permission key — notebook writes reuse
-- `vstudio.opportunity.manage`; reads reuse `vstudio.opportunity.read`.
--
-- Additive & reversible (except enum-value removal, which PostgreSQL does not
-- support — the four added note_type values are inert if unused).
--
-- rollback: (manual, pre-approval only — this migration is not auto-applied)
--   DROP FUNCTION IF EXISTS vstudio.set_notebook_entry_status(uuid, vstudio.task_status);
--   DROP FUNCTION IF EXISTS vstudio.create_notebook_entry(uuid, vstudio.note_type, text, jsonb);
--   DROP TRIGGER IF EXISTS notes_set_updated_at ON vstudio.notes;
--   ALTER TABLE vstudio.notes DROP CONSTRAINT IF EXISTS notes_anchored;
--   ALTER TABLE vstudio.notes
--     DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS meta,
--     DROP COLUMN IF EXISTS program, DROP COLUMN IF EXISTS due_date,
--     DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS title,
--     DROP COLUMN IF EXISTS tenant_id;
--   ALTER TABLE vstudio.notes ALTER COLUMN opportunity_id SET NOT NULL;  -- only if no standalone rows exist
--   DROP TYPE IF EXISTS vstudio.task_status;
--   -- note: the four added vstudio.note_type values cannot be dropped (PG limitation); they are harmless.
--
-- VERIFICATION (after apply): notes has (tenant_id,title,status,due_date,program,
--   meta,updated_at); opportunity_id is nullable; task_status enum exists; two
--   create/status RPCs are SECURITY DEFINER + permission-gated. pgTAP:
--   supabase/tests/23_ceo_notebook.sql.
-- ===========================================================================

-- Task lifecycle for task-like entries (brand-new type: usable immediately).
do $$ begin
  create type vstudio.task_status as enum ('open','in_progress','blocked','done','archived');
exception when duplicate_object then null; end $$;

-- Four additive intelligence intents on the EXISTING note_type vocabulary.
-- (ADD VALUE is additive; the new values are not referenced elsewhere in this
--  migration, so the same-transaction restriction does not apply.)
alter type vstudio.note_type add value if not exists 'research_request';
alter type vstudio.note_type add value if not exists 'ai_analysis_request';
alter type vstudio.note_type add value if not exists 'personal_task';
alter type vstudio.note_type add value if not exists 'executive_status';

-- Extend notes into notebook entries (all additive; existing rows keep defaults).
alter table vstudio.notes alter column opportunity_id drop not null;
alter table vstudio.notes
  add column if not exists tenant_id  uuid references platform.tenants(id) on delete cascade,
  add column if not exists title      text,
  add column if not exists status     vstudio.task_status not null default 'open',
  add column if not exists due_date    date,
  add column if not exists program    extensions.citext,   -- in-code intelligence program key (no FK)
  add column if not exists meta       jsonb not null default '{}'::jsonb,
  add column if not exists updated_at  timestamptz not null default now();

comment on column vstudio.notes.tenant_id is
  'Owning tenant for a STANDALONE notebook entry (opportunity_id null). For opportunity-linked notes the tenant is derived from the opportunity.';
comment on column vstudio.notes.program is
  'Which in-code Intelligence Program (opportunity|acquisition|research|grant|competitive|portfolio) this entry belongs to. Not an authorization input.';

-- Every note must be anchored: to an opportunity OR to a tenant (never orphaned).
do $$ begin
  alter table vstudio.notes
    add constraint notes_anchored check (opportunity_id is not null or tenant_id is not null);
exception when duplicate_object then null; end $$;

drop trigger if exists notes_set_updated_at on vstudio.notes;
create trigger notes_set_updated_at
  before update on vstudio.notes
  for each row execute function platform.set_updated_at();

create index if not exists notes_tenant_idx  on vstudio.notes (tenant_id) where tenant_id is not null;
create index if not exists notes_status_idx  on vstudio.notes (status);
create index if not exists notes_program_idx on vstudio.notes (program) where program is not null;

-- ---------------------------------------------------------------------------
-- Write RPCs (SECURITY DEFINER; permission-checked; auth.uid() provenance)
-- ---------------------------------------------------------------------------

-- Create a notebook entry. Standalone (uses p_tenant) or linked (derives tenant
-- from the opportunity in p_attrs.opportunity_id).
create or replace function vstudio.create_notebook_entry(
  p_tenant uuid, p_kind vstudio.note_type, p_body text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_opp uuid; v_tenant uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  v_opp := nullif(p_attrs->>'opportunity_id','')::uuid;
  if v_opp is not null then
    select tenant_id into v_tenant from vstudio.opportunities where id = v_opp;
    if v_tenant is null then
      raise exception 'opportunity % not found', v_opp using errcode = 'no_data_found'; end if;
  else
    v_tenant := p_tenant;
    if v_tenant is null then
      raise exception 'a tenant is required for a standalone notebook entry'
        using errcode = 'not_null_violation'; end if;
    if not exists (select 1 from platform.tenants t where t.id = v_tenant) then
      raise exception 'tenant % not found', v_tenant using errcode = 'foreign_key_violation'; end if;
  end if;
  insert into vstudio.notes
    (opportunity_id, tenant_id, note_type, title, body, visibility, decision_relevant,
     status, due_date, program, meta, created_by)
  values
    (v_opp, case when v_opp is null then v_tenant else null end, p_kind,
     nullif(p_attrs->>'title',''), p_body,
     coalesce(nullif(p_attrs->>'visibility','')::vstudio.note_visibility, 'executive'),
     coalesce((p_attrs->>'decision_relevant')::boolean, false),
     coalesce(nullif(p_attrs->>'status','')::vstudio.task_status, 'open'),
     nullif(p_attrs->>'due_date','')::date,
     nullif(p_attrs->>'program','')::extensions.citext,
     coalesce(p_attrs->'meta', '{}'::jsonb),
     auth.uid())
  returning id into v_id;
  perform events.emit('vstudio.notebook.entry_created', v_tenant,
    jsonb_build_object('note', v_id, 'kind', p_kind::text));
  return v_id;
end; $$;
revoke all on function vstudio.create_notebook_entry(uuid, vstudio.note_type, text, jsonb) from public, anon;
grant execute on function vstudio.create_notebook_entry(uuid, vstudio.note_type, text, jsonb) to authenticated;

-- Move a task-like entry's status.
create or replace function vstudio.set_notebook_entry_status(
  p_id uuid, p_status vstudio.task_status)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_opp uuid;
begin
  perform vstudio._require('vstudio.opportunity.manage');
  update vstudio.notes set status = p_status where id = p_id
    returning tenant_id, opportunity_id into v_tenant, v_opp;
  if not found then
    raise exception 'notebook entry % not found', p_id using errcode = 'no_data_found'; end if;
  if v_tenant is null and v_opp is not null then
    select tenant_id into v_tenant from vstudio.opportunities where id = v_opp; end if;
  perform events.emit('vstudio.notebook.status_changed', v_tenant,
    jsonb_build_object('note', p_id, 'status', p_status::text));
end; $$;
revoke all on function vstudio.set_notebook_entry_status(uuid, vstudio.task_status) from public, anon;
grant execute on function vstudio.set_notebook_entry_status(uuid, vstudio.task_status) to authenticated;
