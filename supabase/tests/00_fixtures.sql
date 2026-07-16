-- ---------------------------------------------------------------------------
-- Shared fixtures + impersonation helpers for the Phase 2 pgTAP suite.
--
-- Loaded before each test file. Creates 2 tenants and 6 users spanning every
-- tenant role, plus a platform admin.
--
-- Fixtures are inserted as the OWNER (bypassing RLS) on purpose: we are
-- constructing a world, not testing the write paths here. The tests then
-- SET ROLE authenticated and impersonate a user, which is when RLS applies.
-- ---------------------------------------------------------------------------

create schema if not exists tests;

-- Impersonate a user exactly as PostgREST does: set the JWT claims GUC and
-- assume the `authenticated` role. auth.uid() reads request.jwt.claims.
create or replace function tests.login_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end; $$;

create or replace function tests.login_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end; $$;

create or replace function tests.logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end; $$;

-- Deterministic UUIDs so tests can reference them directly.
create or replace function tests.uid(p_label text)
returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(abs(hashtext(p_label))::text, 12, '0'))::uuid;
$$;

create or replace function tests.seed()
returns void language plpgsql as $$
declare
  v_ta uuid; v_tb uuid; v_m uuid;
begin
  -- users
  insert into auth.users (id, email, email_confirmed_at) values
    (tests.uid('owner_a'),   'owner-a@example.test',   now()),
    (tests.uid('admin_a'),   'admin-a@example.test',   now()),
    (tests.uid('manager_a'), 'manager-a@example.test', now()),
    (tests.uid('staff_a'),   'staff-a@example.test',   now()),
    (tests.uid('viewer_a'),  'viewer-a@example.test',  now()),
    (tests.uid('svc_a'),     'svc-a@example.test',     now()),
    (tests.uid('owner_b'),   'owner-b@example.test',   now()),
    (tests.uid('padmin'),    'padmin@example.test',    now()),
    (tests.uid('powner'),    'powner@example.test',    now()),
    (tests.uid('outsider'),  'outsider@example.test',  now()),
    (tests.uid('invitee'),   'invitee@example.test',   now()),
    (tests.uid('unconfirmed'),'unconfirmed@example.test', null)
  on conflict (id) do nothing;

  -- tenants
  v_ta := tests.uid('tenant_a'); v_tb := tests.uid('tenant_b');
  insert into platform.tenants (id, slug, name, status) values
    (v_ta, 'tenant-a', 'Tenant A', 'active'),
    (v_tb, 'tenant-b', 'Tenant B', 'active')
  on conflict (id) do nothing;

  -- tenant A memberships, one per role
  insert into identity.memberships (id, tenant_id, user_id, status) values
    (tests.uid('m_owner_a'),   v_ta, tests.uid('owner_a'),   'active'),
    (tests.uid('m_admin_a'),   v_ta, tests.uid('admin_a'),   'active'),
    (tests.uid('m_manager_a'), v_ta, tests.uid('manager_a'), 'active'),
    (tests.uid('m_staff_a'),   v_ta, tests.uid('staff_a'),   'active'),
    (tests.uid('m_viewer_a'),  v_ta, tests.uid('viewer_a'),  'active'),
    (tests.uid('m_svc_a'),     v_ta, tests.uid('svc_a'),     'active'),
    (tests.uid('m_owner_b'),   v_tb, tests.uid('owner_b'),   'active')
  on conflict (id) do nothing;

  insert into identity.membership_roles (membership_id, role_key) values
    (tests.uid('m_owner_a'),   'tenant_owner'),
    (tests.uid('m_admin_a'),   'tenant_admin'),
    (tests.uid('m_manager_a'), 'manager'),
    (tests.uid('m_staff_a'),   'staff'),
    (tests.uid('m_viewer_a'),  'viewer'),
    (tests.uid('m_svc_a'),     'service_account'),
    (tests.uid('m_owner_b'),   'tenant_owner')
  on conflict do nothing;

  insert into identity.platform_admins (user_id, role_key) values
    (tests.uid('padmin'), 'platform_admin'),
    (tests.uid('powner'), 'platform_owner')
  on conflict (user_id) do nothing;
end; $$;

-- Build an invitation and return the RAW token (selector.verifier). The raw
-- token exists only here and in the caller -- exactly as in production, where
-- it is generated, emailed once, and never stored.
create or replace function tests.make_invitation(
  p_tenant uuid, p_email text, p_role text default 'staff',
  p_expires timestamptz default now() + interval '7 days',
  p_status identity.invitation_status default 'pending'
) returns text language plpgsql as $$
declare
  v_sel text := encode(extensions.gen_random_bytes(12), 'hex');
  v_ver text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  -- created_at is backdated relative to expires_at because the table enforces
  -- expires_at > created_at -- you cannot create an already-expired invitation.
  -- That constraint is correct; the fixture has to respect it to build one.
  insert into identity.invitations
    (tenant_id, email, role_key, token_selector, token_verifier_hash, status,
     expires_at, created_at)
  values
    (p_tenant, p_email::extensions.citext, p_role::extensions.citext, v_sel,
     encode(extensions.digest(v_ver, 'sha256'), 'hex'), p_status,
     p_expires, least(now(), p_expires - interval '1 hour'));
  return v_sel || '.' || v_ver;
end; $$;

-- The helpers must remain callable AFTER `set local role authenticated`,
-- otherwise tests.logout() cannot run. The tests schema is a fixture, never
-- part of a migration, and never exists in a real project.
grant usage on schema tests to public;
grant execute on all functions in schema tests to public;
