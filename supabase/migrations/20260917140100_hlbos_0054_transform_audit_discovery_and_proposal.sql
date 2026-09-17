-- ===========================================================================
-- hlbos_0054 — Business Transformation Audit: the discovery call and the proposal
--
-- PROVENANCE: see 0053. This reconstructs the rest of the `transform_audit`
-- schema's end state as it already exists in canonical production, where it was
-- applied under the names hlbos_0054_discovery_call and hlbos_0055_proposal.
-- ALREADY APPLIED THERE — do not re-apply.
--
-- WHAT THIS IS
--
-- Two things the audit alone cannot know, and the document that follows them.
--
-- The DISCOVERY CALL is what the owner says about their own systems: do they
-- own their website, what do they book with, does anyone call back a missed
-- call, do they ask for reviews, do they keep client records, do they take
-- walk-ins, how many chairs. An automated scan can infer some of this from
-- outside; only a conversation establishes it.
--
-- The PROPOSAL is what we then put in front of them, and it is the most
-- dangerous document this platform produces — the one place where an
-- overstatement becomes a commercial promise. Hence the guards below.
--
-- THE THREE PROPOSAL RULES, ENFORCED BY TRIGGER
--
-- enforce_proposal_honesty() reads every line of the offer against the BarberOS
-- capability catalog and refuses the write unless:
--
--   1. the capability EXISTS in the catalog. A proposal cannot invent a module.
--   2. the capability is not `deferred`. Deferred is a decision NOT to build
--      something, so it must not appear in a proposal in any form — not even
--      as "coming soon".
--   3. a line marked `deliverable_today` names a capability the catalog says is
--      `available`. Only what has shipped may be sold as ready.
--
-- Two more, on the lifecycle:
--
--   * a SENT proposal cannot be edited. Not its document, not its prospect, not
--     its audit, not its send stamp. If it needs to change, draft a new one —
--     because the copy the shop owner is holding cannot be revised.
--   * the only permitted path is draft -> sent -> accepted|declined|withdrawn,
--     with no way back.
--
-- And record_discovery() will not stamp `answered_at` for a call that
-- established nothing, so "we spoke to them" cannot become true by accident.
--
-- rollback:
--   -- approved-destructive: reverses only what this migration created.
--   DROP TABLE IF EXISTS transform_audit.proposals, transform_audit.discovery CASCADE;
--   DROP TYPE IF EXISTS transform_audit.proposal_status;
--   DELETE FROM identity.role_permissions
--     WHERE permission_key IN ('transform_audit.discovery.manage','transform_audit.proposal.manage');
--   DELETE FROM identity.permissions
--     WHERE key IN ('transform_audit.discovery.manage','transform_audit.proposal.manage');
-- ===========================================================================

do $$ begin create type transform_audit.proposal_status as enum ('draft','sent','accepted','declined','withdrawn');
exception when duplicate_object then null; end $$;

-- --- the discovery call -----------------------------------------------------
-- Every answer is nullable and three-valued on purpose: true, false, and "we
-- have not asked". A boolean defaulted to false would record an assumption as
-- an answer.
create table if not exists transform_audit.discovery (
  prospect_id          uuid primary key references visibility.prospects(id) on delete cascade,
  tenant_id            uuid not null references platform.tenants(id) on delete cascade,
  own_website          boolean,
  booking_platform     text,
  online_booking       boolean,
  missed_call_handling boolean,
  review_process       boolean,
  client_records       boolean,
  takes_walkins        boolean,
  chairs               integer,
  answered_at          timestamptz,
  answered_by          uuid references auth.users(id) on delete set null,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint discovery_chairs_positive check (chairs is null or chairs > 0),
  -- If a call was answered, we know who took it.
  constraint discovery_answered_has_provenance check ((answered_at is null) = (answered_by is null)),
  -- Naming the platform they book with contradicts "they have no online booking".
  constraint discovery_platform_implies_booking
    check (booking_platform is null or online_booking is not false)
);
create index if not exists discovery_tenant_idx on transform_audit.discovery (tenant_id);

-- --- the proposal -----------------------------------------------------------
create table if not exists transform_audit.proposals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  prospect_id   uuid not null references visibility.prospects(id) on delete cascade,
  -- RESTRICT, not CASCADE: the audit a proposal was built on cannot be deleted
  -- out from under it while the proposal still cites it.
  run_id        uuid references transform_audit.runs(id) on delete restrict,
  status        transform_audit.proposal_status not null default 'draft',
  document      jsonb not null,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  sent_by       uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null,
  decision_note text,
  constraint proposals_document_is_object check (jsonb_typeof(document) = 'object'),
  constraint proposals_sent_has_provenance check ((sent_at is null) = (sent_by is null)),
  constraint proposals_decided_has_provenance check ((decided_at is null) = (decided_by is null)),
  -- Anything past draft was sent; an outcome means it was decided.
  constraint proposals_past_draft_was_sent check (status = 'draft' or sent_at is not null),
  constraint proposals_decision_implies_decided
    check ((decided_at is not null) = (status = any (array['accepted','declined','withdrawn']::transform_audit.proposal_status[]))),
  constraint proposals_note_needs_decision check (decision_note is null or decided_at is not null)
);
create index if not exists proposals_tenant_idx on transform_audit.proposals (tenant_id);
create index if not exists proposals_prospect_idx on transform_audit.proposals (prospect_id, created_at desc);

-- --- the guards -------------------------------------------------------------
create or replace function transform_audit.enforce_proposal_honesty()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_offer jsonb;
  v_line  jsonb;
  v_key   text;
  v_status barberos.capability_status;
begin
  v_offer := new.document->'offer';
  if v_offer is null or jsonb_typeof(v_offer) <> 'array' then
    raise exception 'a proposal document must carry an "offer" array (got %)',
      coalesce(jsonb_typeof(v_offer), 'nothing') using errcode = 'check_violation';
  end if;

  for v_line in select * from pg_catalog.jsonb_array_elements(v_offer) loop
    v_key := v_line->>'capability';
    if v_key is null or pg_catalog.btrim(v_key) = '' then
      raise exception 'an offer line names no capability'
        using errcode = 'check_violation';
    end if;

    select c.status into v_status
      from barberos.capabilities c
     where c.key = v_key::extensions.citext;

    -- Rule 3: the catalog is the vocabulary. A proposal cannot invent a module.
    if v_status is null then
      raise exception
        'proposal names capability %, which is not in the BarberOS catalog', v_key
        using errcode = 'foreign_key_violation';
    end if;

    -- Rule 1: deferred is a decision not to build, not a roadmap entry.
    if v_status = 'deferred' then
      raise exception
        'capability % is deferred -- a decision NOT to build it -- and must not appear in a proposal in any form',
        v_key using errcode = 'check_violation';
    end if;

    -- Rule 2: only what has shipped may be sold as available.
    if coalesce((v_line->>'deliverable_today')::boolean, false)
       and v_status <> 'available' then
      raise exception
        'proposal offers % as deliverable today, but the catalog says it is %',
        v_key, v_status using errcode = 'check_violation';
    end if;
  end loop;

  return new;
end; $function$;

create or replace function transform_audit.enforce_proposal_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if old.status <> 'draft' then
    if new.document   is distinct from old.document
    or new.prospect_id is distinct from old.prospect_id
    or new.run_id     is distinct from old.run_id
    or new.sent_at    is distinct from old.sent_at
    or new.sent_by    is distinct from old.sent_by then
      raise exception
        'proposal % was sent on %; a sent proposal cannot be edited -- draft a new one',
        old.id, old.sent_at using errcode = 'check_violation';
    end if;
  end if;

  -- draft -> sent -> accepted|declined|withdrawn, and no way back.
  if new.status <> old.status then
    if not (
         (old.status = 'draft' and new.status = 'sent')
      or (old.status = 'sent'  and new.status in ('accepted','declined','withdrawn'))
    ) then
      raise exception 'a proposal cannot move from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end; $function$;

drop trigger if exists discovery_tenant_match on transform_audit.discovery;
create trigger discovery_tenant_match before insert or update on transform_audit.discovery
  for each row execute function transform_audit.enforce_profile_tenant();
drop trigger if exists discovery_set_updated_at on transform_audit.discovery;
create trigger discovery_set_updated_at before update on transform_audit.discovery
  for each row execute function platform.set_updated_at();

drop trigger if exists proposals_tenant_match on transform_audit.proposals;
create trigger proposals_tenant_match before insert or update on transform_audit.proposals
  for each row execute function transform_audit.enforce_profile_tenant();
drop trigger if exists proposals_honesty on transform_audit.proposals;
create trigger proposals_honesty before insert or update of document on transform_audit.proposals
  for each row execute function transform_audit.enforce_proposal_honesty();
drop trigger if exists proposals_lifecycle on transform_audit.proposals;
create trigger proposals_lifecycle before update on transform_audit.proposals
  for each row execute function transform_audit.enforce_proposal_lifecycle();
drop trigger if exists proposals_set_updated_at on transform_audit.proposals;
create trigger proposals_set_updated_at before update on transform_audit.proposals
  for each row execute function platform.set_updated_at();

-- --- RLS --------------------------------------------------------------------
alter table transform_audit.discovery enable row level security; alter table transform_audit.discovery force row level security;
alter table transform_audit.proposals enable row level security; alter table transform_audit.proposals force row level security;

drop policy if exists discovery_select on transform_audit.discovery;
create policy discovery_select on transform_audit.discovery for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read') or identity.is_platform_admin());
drop policy if exists proposals_select on transform_audit.proposals;
create policy proposals_select on transform_audit.proposals for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read') or identity.is_platform_admin());

grant select on transform_audit.discovery, transform_audit.proposals to authenticated;

-- --- permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('transform_audit.discovery.manage', 'Record what a prospect said about their current systems on a discovery call.', 'tenant'),
  ('transform_audit.proposal.manage',  'Draft, send and record the outcome of a proposal to a prospect.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','transform_audit.discovery.manage'),('tenant_owner','transform_audit.proposal.manage'),
  ('tenant_admin','transform_audit.discovery.manage'),('tenant_admin','transform_audit.proposal.manage'),
  ('manager','transform_audit.discovery.manage')
on conflict do nothing;

-- --- the discovery call -----------------------------------------------------
create or replace function transform_audit.record_discovery(p_prospect uuid, p_answers jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_anything boolean;
begin
  select p.tenant_id into v_tenant from visibility.prospects p where p.id = p_prospect;
  if v_tenant is null then
    raise exception 'prospect % does not exist', p_prospect using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.discovery.manage') then
    raise exception 'insufficient privilege to record a discovery call'
      using errcode = 'insufficient_privilege';
  end if;

  -- Did this call actually establish anything? An upsert that learned nothing
  -- must not stamp a timestamp claiming it did.
  v_anything := (
    p_answers ?| array['own_website','booking_platform','online_booking',
                       'missed_call_handling','review_process','client_records',
                       'takes_walkins','chairs','notes']);

  insert into transform_audit.discovery as d (
    prospect_id, tenant_id, own_website, booking_platform, online_booking,
    missed_call_handling, review_process, client_records, takes_walkins, chairs,
    notes, answered_at, answered_by)
  values (
    p_prospect, v_tenant,
    (p_answers->>'own_website')::boolean,
    p_answers->>'booking_platform',
    (p_answers->>'online_booking')::boolean,
    (p_answers->>'missed_call_handling')::boolean,
    (p_answers->>'review_process')::boolean,
    (p_answers->>'client_records')::boolean,
    (p_answers->>'takes_walkins')::boolean,
    (p_answers->>'chairs')::integer,
    p_answers->>'notes',
    case when v_anything then now() end,
    case when v_anything then auth.uid() end)
  on conflict (prospect_id) do update set
    -- `?` asks whether the key was SUPPLIED, so an absent key keeps what is
    -- stored and an explicit null clears it. A call that only covered booking
    -- does not wipe what a previous call learned about the phones.
    own_website = case when p_answers ? 'own_website'
      then (p_answers->>'own_website')::boolean else d.own_website end,
    booking_platform = case when p_answers ? 'booking_platform'
      then p_answers->>'booking_platform' else d.booking_platform end,
    online_booking = case when p_answers ? 'online_booking'
      then (p_answers->>'online_booking')::boolean else d.online_booking end,
    missed_call_handling = case when p_answers ? 'missed_call_handling'
      then (p_answers->>'missed_call_handling')::boolean else d.missed_call_handling end,
    review_process = case when p_answers ? 'review_process'
      then (p_answers->>'review_process')::boolean else d.review_process end,
    client_records = case when p_answers ? 'client_records'
      then (p_answers->>'client_records')::boolean else d.client_records end,
    takes_walkins = case when p_answers ? 'takes_walkins'
      then (p_answers->>'takes_walkins')::boolean else d.takes_walkins end,
    chairs = case when p_answers ? 'chairs'
      then (p_answers->>'chairs')::integer else d.chairs end,
    notes = case when p_answers ? 'notes' then p_answers->>'notes' else d.notes end,
    answered_at = case when v_anything then now() else d.answered_at end,
    answered_by = case when v_anything then auth.uid() else d.answered_by end;

  return p_prospect;
end; $function$;

create or replace function transform_audit.discovery_for(p_prospect uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_tenant uuid; v_d transform_audit.discovery%rowtype;
begin
  select p.tenant_id into v_tenant from visibility.prospects p where p.id = p_prospect;
  if v_tenant is null then
    raise exception 'prospect % does not exist', p_prospect using errcode = 'no_data_found';
  end if;
  if not (identity.has_permission(v_tenant, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this discovery call'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_d from transform_audit.discovery where prospect_id = p_prospect;

  return jsonb_build_object(
    'prospect_id', p_prospect,
    'called', v_d.answered_at is not null,
    'answered_at', v_d.answered_at,
    'own_website', v_d.own_website,
    'booking_platform', v_d.booking_platform,
    'online_booking', v_d.online_booking,
    'missed_call_handling', v_d.missed_call_handling,
    'review_process', v_d.review_process,
    'client_records', v_d.client_records,
    'takes_walkins', v_d.takes_walkins,
    'chairs', v_d.chairs,
    'notes', v_d.notes);
end; $function$;

-- --- the proposal lifecycle -------------------------------------------------
create or replace function transform_audit.draft_proposal(p_prospect uuid, p_run uuid, p_document jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_tenant uuid; v_id uuid; v_run_prospect uuid;
begin
  select p.tenant_id into v_tenant from visibility.prospects p where p.id = p_prospect;
  if v_tenant is null then
    raise exception 'prospect % does not exist', p_prospect using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.proposal.manage') then
    raise exception 'insufficient privilege to draft a proposal'
      using errcode = 'insufficient_privilege';
  end if;

  -- A proposal citing another shop's audit would be a document full of
  -- evidence about somebody else.
  if p_run is not null then
    select r.prospect_id into v_run_prospect
      from transform_audit.runs r where r.id = p_run;
    if v_run_prospect is null then
      raise exception 'audit run % does not exist', p_run using errcode = 'no_data_found';
    end if;
    if v_run_prospect <> p_prospect then
      raise exception 'audit run % is for a different shop', p_run
        using errcode = 'check_violation';
    end if;
  end if;

  insert into transform_audit.proposals (tenant_id, prospect_id, run_id, document, created_by)
  values (v_tenant, p_prospect, p_run, p_document, auth.uid())
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function transform_audit.save_proposal(p_id uuid, p_document jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_p transform_audit.proposals%rowtype;
begin
  select * into v_p from transform_audit.proposals where id = p_id;
  if v_p.id is null then
    raise exception 'proposal % does not exist', p_id using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_p.tenant_id, 'transform_audit.proposal.manage') then
    raise exception 'insufficient privilege to edit this proposal'
      using errcode = 'insufficient_privilege';
  end if;
  if v_p.status <> 'draft' then
    raise exception 'proposal % is % -- only a draft can be edited; draft a new one',
      p_id, v_p.status using errcode = 'check_violation';
  end if;

  update transform_audit.proposals set document = p_document where id = p_id;
  return p_id;
end; $function$;

create or replace function transform_audit.send_proposal(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $function$
declare v_p transform_audit.proposals%rowtype; v_now timestamptz;
begin
  select * into v_p from transform_audit.proposals where id = p_id;
  if v_p.id is null then
    raise exception 'proposal % does not exist', p_id using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_p.tenant_id, 'transform_audit.proposal.manage') then
    raise exception 'insufficient privilege to send this proposal'
      using errcode = 'insufficient_privilege';
  end if;
  if v_p.status <> 'draft' then
    raise exception 'proposal % has already been sent (%)', p_id, v_p.status
      using errcode = 'check_violation';
  end if;
  if pg_catalog.jsonb_array_length(coalesce(v_p.document->'offer','[]'::jsonb)) = 0 then
    raise exception 'proposal % offers nothing; there is no document to send here', p_id
      using errcode = 'check_violation';
  end if;
  if auth.uid() is null then
    raise exception 'a proposal must be sent by somebody'
      using errcode = 'check_violation';
  end if;

  v_now := now();
  update transform_audit.proposals
     set status = 'sent', sent_at = v_now, sent_by = auth.uid()
   where id = p_id;
  return v_now;
end; $function$;

create or replace function transform_audit.decide_proposal(p_id uuid, p_status text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_p transform_audit.proposals%rowtype;
begin
  if p_status not in ('accepted','declined','withdrawn') then
    raise exception 'outcome must be accepted, declined or withdrawn (got %)', p_status
      using errcode = 'check_violation';
  end if;
  select * into v_p from transform_audit.proposals where id = p_id;
  if v_p.id is null then
    raise exception 'proposal % does not exist', p_id using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_p.tenant_id, 'transform_audit.proposal.manage') then
    raise exception 'insufficient privilege to record an outcome on this proposal'
      using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is null then
    raise exception 'an outcome must be recorded by somebody'
      using errcode = 'check_violation';
  end if;

  update transform_audit.proposals
     set status = p_status::transform_audit.proposal_status,
         decided_at = now(), decided_by = auth.uid(), decision_note = p_note
   where id = p_id;
  return p_id;
end; $function$;

create or replace function transform_audit.proposal(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_p transform_audit.proposals%rowtype;
begin
  select * into v_p from transform_audit.proposals where id = p_id;
  if v_p.id is null then return null; end if;
  if not (identity.has_permission(v_p.tenant_id, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this proposal'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'id', v_p.id, 'prospect_id', v_p.prospect_id, 'run_id', v_p.run_id,
    'status', v_p.status, 'document', v_p.document,
    'created_at', v_p.created_at, 'sent_at', v_p.sent_at,
    'decided_at', v_p.decided_at, 'decision_note', v_p.decision_note);
end; $function$;

create or replace function transform_audit.proposals_for(p_prospect uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_tenant uuid;
begin
  select p.tenant_id into v_tenant from visibility.prospects p where p.id = p_prospect;
  if v_tenant is null then
    raise exception 'prospect % does not exist', p_prospect using errcode = 'no_data_found';
  end if;
  if not (identity.has_permission(v_tenant, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s proposals'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pr.id, 'status', pr.status,
             'created_at', pr.created_at, 'sent_at', pr.sent_at,
             'decided_at', pr.decided_at,
             'offer_lines', pg_catalog.jsonb_array_length(
                              coalesce(pr.document->'offer','[]'::jsonb)))
           order by pr.created_at desc)
      from transform_audit.proposals pr
     where pr.prospect_id = p_prospect), '[]'::jsonb);
end; $function$;

revoke all on function transform_audit.record_discovery(uuid, jsonb) from public, anon;
revoke all on function transform_audit.discovery_for(uuid) from public, anon;
revoke all on function transform_audit.draft_proposal(uuid, uuid, jsonb) from public, anon;
revoke all on function transform_audit.save_proposal(uuid, jsonb) from public, anon;
revoke all on function transform_audit.send_proposal(uuid) from public, anon;
revoke all on function transform_audit.decide_proposal(uuid, text, text) from public, anon;
revoke all on function transform_audit.proposal(uuid) from public, anon;
revoke all on function transform_audit.proposals_for(uuid) from public, anon;

grant execute on function transform_audit.record_discovery(uuid, jsonb) to authenticated;
grant execute on function transform_audit.discovery_for(uuid) to authenticated;
grant execute on function transform_audit.draft_proposal(uuid, uuid, jsonb) to authenticated;
grant execute on function transform_audit.save_proposal(uuid, jsonb) to authenticated;
grant execute on function transform_audit.send_proposal(uuid) to authenticated;
grant execute on function transform_audit.decide_proposal(uuid, text, text) to authenticated;
grant execute on function transform_audit.proposal(uuid) to authenticated;
grant execute on function transform_audit.proposals_for(uuid) to authenticated;
