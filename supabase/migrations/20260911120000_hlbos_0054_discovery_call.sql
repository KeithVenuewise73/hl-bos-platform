-- ===========================================================================
-- hlbos_0054_discovery_call — what the shop already runs, learned by asking
--
-- The audit can see a shop's WEBSITE from the outside. It cannot see the phone
-- log, the appointment book, or what the barber writes on a card in a drawer --
-- and those are where the money actually leaks. Several sessions were spent
-- looking for ways to infer them, and the answer turned out to be the obvious
-- one: ask, on the introductory call, when the audit has already earned the
-- shop's attention.
--
-- So the sale is two stages, and this table is the join between them:
--
--   1. the AUDIT produces the opener  -- what anyone can see from outside
--   2. the CALL produces the proposal -- what only the owner can tell us
--
-- ---------------------------------------------------------------------------
-- EVERY ANSWER IS THREE-STATE, AND THAT IS THE POINT
--
-- `true` = they have it. `false` = they were asked and do not.
-- `NULL`  = NOBODY ASKED.
--
-- These are three different facts and the schema refuses to collapse them.
-- A proposal built on "false" says "you have no way to book online"; a proposal
-- built on NULL must say "we did not get to booking on the call". Saying the
-- first when the second is true is how you get corrected by an owner in front
-- of their own staff, and lose the room.
--
-- This is the same rule the audit already enforces for scores -- an `unknown`
-- dimension carries no score and a scored one cannot be `unknown` -- applied to
-- the half of the picture that comes from a conversation instead of a crawler.
-- `capability_match.ts` reads these columns as `boolean | null` for exactly
-- this reason, and has a test that an unobserved signal produces a question
-- rather than a claim.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS A SATELLITE ON visibility.prospects, AGAIN
--
-- The same argument as `shop_profiles` in 0049: this is not a second prospect
-- store and not a second tenant model. It is Herman Legacy Digital's own sales
-- record about a business it is selling to, so it hangs off the prospect and
-- carries the agency's tenant.
--
-- One row per prospect, updated in place. A discovery call is a growing
-- picture of one shop, not an event stream -- what matters is the current
-- answer, and `answered_at` records when it was last true.
--
-- rollback:
--   DROP TABLE IF EXISTS transform_audit.discovery CASCADE;
--   DROP FUNCTION IF EXISTS transform_audit.record_discovery(uuid, jsonb);
--   DROP FUNCTION IF EXISTS transform_audit.discovery_for(uuid);
--   DELETE FROM identity.role_permissions
--    WHERE permission_key = 'transform_audit.discovery.manage';
--   DELETE FROM identity.permissions
--    WHERE key = 'transform_audit.discovery.manage';
--   (Additive: one new table, two functions, one permission.)
-- approved-destructive: the rollback block above is the only DROP here; this
--   migration creates and grants, and removes nothing.
-- ===========================================================================

create table if not exists transform_audit.discovery (
  prospect_id uuid primary key references visibility.prospects(id) on delete cascade,
  -- Denormalized for RLS, kept identical to the prospect's tenant by trigger --
  -- the same guard 0049 put on shop_profiles, for the same reason.
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,

  -- --- What they run today. NULL everywhere means the call has not happened.
  -- A site on a domain the shop controls, as opposed to a booking-platform page.
  own_website          boolean,
  -- Free text on purpose: "Booksy", "GlossGenius", "Square", "a guy who left".
  -- A closed vocabulary here would force whoever is on the call to pick a wrong
  -- answer, and a wrong answer is worse than a written one.
  booking_platform     text,
  online_booking       boolean,
  -- The one the audit can never see, and the one most likely to be the pitch.
  missed_call_handling boolean,
  review_process       boolean,
  -- Any record of a client beyond the barber's memory.
  client_records       boolean,
  takes_walkins        boolean,
  chairs               integer,

  -- --- Provenance. Who heard this, and when.
  -- An answer with nobody behind it is a rumour, and a proposal built on a
  -- rumour is worse than one that admits it does not know.
  answered_at timestamptz,
  answered_by uuid references auth.users(id) on delete set null,
  -- Anything the columns above cannot hold. The interesting thing an owner
  -- says is rarely one of eight booleans.
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint discovery_chairs_positive check (chairs is null or chairs > 0),
  -- If anything was answered at all, we know who and when. This is the
  -- provenance rule the platform applies to every other claim it stores.
  constraint discovery_answered_has_provenance check (
    (answered_at is null) = (answered_by is null)),
  -- A booking platform named implies they can be booked online. Recording
  -- "Booksy" alongside "no online booking" is a contradiction the schema
  -- should catch on the call, while the owner is still on the phone to correct
  -- it, rather than in a proposal a week later.
  constraint discovery_platform_implies_booking check (
    booking_platform is null or online_booking is not false)
);
comment on table transform_audit.discovery is
  'What a shop told us it already runs, on the introductory call. Every answer is three-state: true, false, or NULL meaning nobody asked. Those are different facts and a proposal must treat them differently.';
comment on column transform_audit.discovery.missed_call_handling is
  'Whether anything catches a call the shop misses. Invisible from outside -- this column is the only way the platform can ever know.';
comment on column transform_audit.discovery.answered_at is
  'When the answers were last updated. NULL means no call has happened, which is different from a call where nothing was learned.';

create index if not exists discovery_tenant_idx on transform_audit.discovery (tenant_id);

-- The satellite's tenant must be the prospect's tenant.
create trigger discovery_tenant_match
  before insert or update on transform_audit.discovery
  for each row execute function transform_audit.enforce_profile_tenant();

create trigger discovery_set_updated_at before update on transform_audit.discovery
  for each row execute function platform.set_updated_at();

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table transform_audit.discovery enable row level security;
alter table transform_audit.discovery force  row level security;

drop policy if exists discovery_select on transform_audit.discovery;
create policy discovery_select on transform_audit.discovery for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read')
         or identity.is_platform_admin());

grant select on transform_audit.discovery to authenticated;

-- ===========================================================================
-- Permission
--
-- Its own key rather than reusing `shop.manage`: recording what a business told
-- you on a call is a different act from importing a prospect list, and the
-- person who does the calls is not necessarily the person who manages the list.
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('transform_audit.discovery.manage',
   'Record what a prospect said about their current systems on a discovery call.',
   'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','transform_audit.discovery.manage'),
  ('tenant_admin','transform_audit.discovery.manage'),
  ('manager','transform_audit.discovery.manage')
on conflict do nothing;

-- ===========================================================================
-- Write path
--
-- One call, one upsert. Takes jsonb so a partial call -- which is most calls --
-- updates only what was actually discussed, and a key that is absent from the
-- payload leaves the stored answer alone. An explicit JSON null CLEARS an
-- answer back to "nobody asked", which is a thing someone will need when they
-- realise they wrote down the wrong shop's answer.
-- ===========================================================================
create or replace function transform_audit.record_discovery(
  p_prospect uuid, p_answers jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function transform_audit.record_discovery(uuid, jsonb) from public, anon;
grant execute on function transform_audit.record_discovery(uuid, jsonb) to authenticated;

-- ===========================================================================
-- Read path
--
-- Shaped for the cross-reference: exactly the fields `capability_match.ts`
-- reads, plus whether anyone has actually asked yet. Returns a row of NULLs
-- rather than nothing when no call has happened, because "we have not spoken
-- to them" is an answer the console needs to show.
-- ===========================================================================
create or replace function transform_audit.discovery_for(p_prospect uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
revoke all on function transform_audit.discovery_for(uuid) from public, anon;
grant execute on function transform_audit.discovery_for(uuid) to authenticated;
