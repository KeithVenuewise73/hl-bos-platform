-- ===========================================================================
-- hlbos_0055_proposal — the document that comes out of the call
--
-- The audit produces the opener. The call (0054) produces the other half of
-- the picture. This is the artefact the two of them exist to make: a document
-- you can put in front of a barber.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS STORED, AND NOT RENDERED FRESH EACH TIME
--
-- The tempting design is to keep nothing: read the audit, read the call, run
-- the cross-reference, render. It is less code and it is always current.
--
-- It is also wrong, for one reason: a proposal that was SENT is a fact about a
-- business relationship. "What did we offer Truth Barbershop in September" has
-- exactly one right answer, and a live-rendered document silently rewrites it
-- every time the catalog changes, a later call corrects an answer, or a
-- re-audit lowers a score. The shop's copy would then say something our copy
-- does not. That is the kind of discrepancy you discover in front of the
-- customer.
--
-- So a proposal is a SNAPSHOT: the shop's facts, the audit's findings, the
-- answers as given, and the matched offer, frozen at the moment it was built.
-- Re-proposing later creates a NEW proposal, exactly as re-auditing creates a
-- new run (0049). History is kept because history is evidence.
--
-- WHAT IS *NOT* FROZEN is the typography. `document` holds the words; the
-- renderer holds the presentation. A styling fix should reach a proposal
-- already sent -- it is the same document, better set. A wording change must
-- not, and cannot: it is not in the code.
--
-- ---------------------------------------------------------------------------
-- THE THREE RULES OF capability_match.ts, PROMOTED TO DATABASE LAW
--
-- The cross-reference enforces them in TypeScript and has tests. That is
-- sufficient right up until somebody assembles a document another way -- a
-- script, a fix-up, a second screen -- and the guarantees quietly stop
-- applying. A proposal is a PROMISE, so the promise is checked where it is
-- stored:
--
--   1. A capability the catalog marks `deferred` can never appear in a
--      proposal in any form. `deferred` is not "not yet"; it is a decision not
--      to build. `payments` is deferred for PCI reasons and must never be
--      implied to a shop as coming.
--
--   2. An offer line may claim `deliverable_today` only if the catalog says
--      that module is `available` -- checked at write time, which is the
--      moment that matters. You cannot CREATE a document that over-promises.
--      A module that ships later does not retroactively improve a proposal,
--      and a module withdrawn later does not retroactively make an honest
--      proposal a lie.
--
--   3. A proposal cannot name a capability the catalog has never heard of.
--
-- Rule 3 in capability_match.ts -- unknown is not absent -- lives in the
-- document's own words rather than here, because "we did not get to that on
-- the call" is a sentence, not a constraint.
--
-- ---------------------------------------------------------------------------
-- SENT IS IMMUTABLE
--
-- Until it is sent, a proposal is a draft and may be reworked freely. The
-- moment it is sent it freezes: document, prospect, run and the sending
-- provenance can no longer change, and the only permitted moves are forward
-- through the lifecycle. Correcting a sent proposal means sending a new one,
-- which is also what honesty looks like from the shop's side -- they have the
-- old one in their inbox.
--
-- Status moves: draft -> sent -> accepted | declined | withdrawn. Terminal is
-- terminal. Nothing returns to draft, because a document that went out cannot
-- be un-gone.
--
-- rollback:
--   DROP TABLE IF EXISTS transform_audit.proposals CASCADE;
--   DROP FUNCTION IF EXISTS transform_audit.draft_proposal(uuid, uuid, jsonb);
--   DROP FUNCTION IF EXISTS transform_audit.save_proposal(uuid, jsonb);
--   DROP FUNCTION IF EXISTS transform_audit.send_proposal(uuid);
--   DROP FUNCTION IF EXISTS transform_audit.decide_proposal(uuid, text, text);
--   DROP FUNCTION IF EXISTS transform_audit.proposal(uuid);
--   DROP FUNCTION IF EXISTS transform_audit.proposals_for(uuid);
--   DROP FUNCTION IF EXISTS transform_audit.enforce_proposal_honesty();
--   DROP FUNCTION IF EXISTS transform_audit.enforce_proposal_lifecycle();
--   DROP TYPE IF EXISTS transform_audit.proposal_status;
--   DELETE FROM identity.role_permissions
--    WHERE permission_key = 'transform_audit.proposal.manage';
--   DELETE FROM identity.permissions
--    WHERE key = 'transform_audit.proposal.manage';
--   (Additive: one new table, one enum, six functions, two trigger functions,
--    one permission. Nothing existing is altered.)
-- approved-destructive: the rollback block above is the only DROP here; this
--   migration creates and grants, and removes nothing.
-- ===========================================================================

do $$ begin create type transform_audit.proposal_status as enum
  ('draft','sent','accepted','declined','withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists transform_audit.proposals (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  -- Denormalized for RLS, kept identical to the prospect's tenant by trigger.
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  -- The audit this was built from. ON DELETE RESTRICT, not SET NULL: a sent
  -- proposal's evidence must not be deletable out from under it.
  run_id      uuid references transform_audit.runs(id) on delete restrict,

  status      transform_audit.proposal_status not null default 'draft',

  -- The frozen words. Shape is documented in proposal-doc.ts, which is the
  -- only thing that writes it and the only thing that reads it back.
  document    jsonb not null,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  -- When it went to the shop, and who sent it.
  sent_at     timestamptz,
  sent_by     uuid references auth.users(id) on delete set null,
  -- What came back.
  decided_at  timestamptz,
  decided_by  uuid references auth.users(id) on delete set null,
  decision_note text,

  constraint proposals_document_is_object
    check (jsonb_typeof(document) = 'object'),
  -- The platform's provenance rule, again: a fact with nobody behind it is a
  -- rumour, and "this was sent" is a fact.
  constraint proposals_sent_has_provenance
    check ((sent_at is null) = (sent_by is null)),
  constraint proposals_decided_has_provenance
    check ((decided_at is null) = (decided_by is null)),
  -- Anything past draft has, by definition, been sent.
  constraint proposals_past_draft_was_sent
    check (status = 'draft' or sent_at is not null),
  -- And a decision only exists once there is something to decide about.
  constraint proposals_decision_implies_decided
    check ((decided_at is not null) = (status in ('accepted','declined','withdrawn'))),
  constraint proposals_note_needs_decision
    check (decision_note is null or decided_at is not null)
);
comment on table transform_audit.proposals is
  'A proposal to a shop, frozen at the moment it was built. Re-proposing creates a NEW row -- "what did we offer them in September" has exactly one answer, and a live-rendered document would not.';
comment on column transform_audit.proposals.document is
  'The snapshot: the shop, the audit findings, the answers as given, and the matched offer. The WORDS are frozen here; the typography lives in the renderer and may improve.';
comment on column transform_audit.proposals.run_id is
  'The audit this was built from. RESTRICT on delete: a sent proposal''s evidence must not vanish from under it.';

create index if not exists proposals_prospect_idx
  on transform_audit.proposals (prospect_id, created_at desc);
create index if not exists proposals_tenant_idx on transform_audit.proposals (tenant_id);

-- The satellite's tenant must be the prospect's tenant -- 0049's guard, reused.
create trigger proposals_tenant_match
  before insert or update on transform_audit.proposals
  for each row execute function transform_audit.enforce_profile_tenant();

create trigger proposals_set_updated_at before update on transform_audit.proposals
  for each row execute function platform.set_updated_at();

-- ===========================================================================
-- Rule 1 and rule 2, as a trigger
--
-- Runs on every insert and on every update of `document`, so there is no path
-- -- function, script or hand-written statement -- that puts an over-promise
-- in this table.
-- ===========================================================================
create or replace function transform_audit.enforce_proposal_honesty()
returns trigger language plpgsql security definer set search_path = '' as $$
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
end; $$;
comment on function transform_audit.enforce_proposal_honesty() is
  'capability_match.ts''s first two rules, checked where the promise is stored rather than only where it is composed.';

create trigger proposals_honesty
  before insert or update of document on transform_audit.proposals
  for each row execute function transform_audit.enforce_proposal_honesty();

-- ===========================================================================
-- Sent is immutable, and the lifecycle only moves forward
-- ===========================================================================
create or replace function transform_audit.enforce_proposal_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
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
end; $$;
comment on function transform_audit.enforce_proposal_lifecycle() is
  'A document that went out cannot be un-gone. Past draft, only the status moves, and only forward.';

create trigger proposals_lifecycle
  before update on transform_audit.proposals
  for each row execute function transform_audit.enforce_proposal_lifecycle();

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table transform_audit.proposals enable row level security;
alter table transform_audit.proposals force  row level security;

drop policy if exists proposals_select on transform_audit.proposals;
create policy proposals_select on transform_audit.proposals for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read')
         or identity.is_platform_admin());

grant select on transform_audit.proposals to authenticated;

-- ===========================================================================
-- Permission
--
-- Its own key. Reading an audit and PUTTING A NUMBER IN FRONT OF A CUSTOMER
-- are different acts, and the second is the one that commits the business.
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('transform_audit.proposal.manage',
   'Draft, send and record the outcome of a proposal to a prospect.',
   'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','transform_audit.proposal.manage'),
  ('tenant_admin','transform_audit.proposal.manage')
on conflict do nothing;

-- ===========================================================================
-- Write path
-- ===========================================================================
create or replace function transform_audit.draft_proposal(
  p_prospect uuid, p_run uuid, p_document jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
comment on function transform_audit.draft_proposal(uuid, uuid, jsonb) is
  'Start a proposal. The honesty trigger vets the document before it is stored, so a draft cannot hold an over-promise either.';
revoke all on function transform_audit.draft_proposal(uuid, uuid, jsonb) from public, anon;
grant execute on function transform_audit.draft_proposal(uuid, uuid, jsonb) to authenticated;

create or replace function transform_audit.save_proposal(p_id uuid, p_document jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function transform_audit.save_proposal(uuid, jsonb) from public, anon;
grant execute on function transform_audit.save_proposal(uuid, jsonb) to authenticated;

-- Sending is the commitment. It is also the last moment anything can be
-- checked, so this is where an EMPTY offer is refused: a proposal that offers
-- nothing is not a proposal, and a Send button that let one out would be a
-- control that does not control anything.
create or replace function transform_audit.send_proposal(p_id uuid)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
comment on function transform_audit.send_proposal(uuid) is
  'Freeze a draft and record that it went out. Refuses an empty offer, and refuses to record a send with nobody behind it.';
revoke all on function transform_audit.send_proposal(uuid) from public, anon;
grant execute on function transform_audit.send_proposal(uuid) to authenticated;

create or replace function transform_audit.decide_proposal(
  p_id uuid, p_status text, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function transform_audit.decide_proposal(uuid, text, text) from public, anon;
grant execute on function transform_audit.decide_proposal(uuid, text, text) to authenticated;

-- ===========================================================================
-- Read path
-- ===========================================================================
create or replace function transform_audit.proposal(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
comment on function transform_audit.proposal(uuid) is
  'One proposal, or NULL. Enables nothing.';
revoke all on function transform_audit.proposal(uuid) from public, anon;
grant execute on function transform_audit.proposal(uuid) to authenticated;

-- The history for one shop, newest first, WITHOUT the documents -- a list
-- screen needs to know what was sent and when, not to carry four snapshots.
create or replace function transform_audit.proposals_for(p_prospect uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
revoke all on function transform_audit.proposals_for(uuid) from public, anon;
grant execute on function transform_audit.proposals_for(uuid) to authenticated;
