-- ===========================================================================
-- hlbos_0005_seed_platform_reference_data
--
-- 8 roles, 17 permissions, 45 grants. VERSIONED, not seed.sql -- production
-- needs these rows, so they must be reviewable and reproducible.
--
-- NO tenant. NO user. NO platform admin. Bootstrapping the first platform_owner
-- is an operator action against a real human's auth.users row; seeding one would
-- put a known-identity superuser into production. See
-- docs/operations/bootstrap-first-platform-owner.md.
--
-- Idempotent: ON CONFLICT DO UPDATE throughout. Re-runnable.
--
-- rollback:
--   DELETE FROM identity.role_permissions;
--   DELETE FROM identity.permissions;
--   DELETE FROM identity.roles;
-- ===========================================================================

-- --- Roles (8) -------------------------------------------------------------
insert into identity.roles (key, name, description, scope) values
  ('platform_owner',  'Platform Owner',  'HLSV ownership. Full platform authority.',                 'platform'),
  ('platform_admin',  'Platform Admin',  'HLSV operations. Explicitly enumerated, never blanket.',   'platform'),
  ('tenant_owner',    'Tenant Owner',    'Customer owner. Full authority within their tenant.',      'tenant'),
  ('tenant_admin',    'Tenant Admin',    'Customer administrator.',                                  'tenant'),
  ('manager',         'Manager',         'Manages people, not the tenant itself.',                   'tenant'),
  ('staff',           'Staff',           'Day-to-day operator.',                                     'tenant'),
  ('viewer',          'Viewer',          'Read-only.',                                               'tenant'),
  ('service_account', 'Service Account', 'Non-human integration. Deliberately minimal.',             'tenant')
on conflict (key) do update
  set name = excluded.name, description = excluded.description, scope = excluded.scope;

-- --- Permissions (17: 13 tenant + 4 platform) ------------------------------
-- Frozen for Phase 2. identity.invitation.accept is DELIBERATELY ABSENT --
-- owner ruling 2026-07-15: the invitee has no active membership, so the check
-- would be false by construction. Acceptance is token-authorized.
insert into identity.permissions (key, description, scope) values
  ('tenancy.tenant.read',         'Read own tenant row',                        'tenant'),
  ('tenancy.tenant.update',       'Rename, change branding and settings',       'tenant'),
  ('tenancy.tenant.manage',       'Lifecycle: suspend, deactivate',             'tenant'),
  ('identity.profile.read',       'Read co-members'' profiles',                 'tenant'),
  ('identity.membership.read',    'See who is in the tenant',                   'tenant'),
  ('identity.membership.create',  'Directly add a member',                      'tenant'),
  ('identity.membership.update',  'Change a member''s status',                  'tenant'),
  ('identity.membership.delete',  'Remove a member',                            'tenant'),
  ('identity.invitation.read',    'See pending invitations',                    'tenant'),
  ('identity.invitation.create',  'Invite someone',                             'tenant'),
  ('identity.invitation.revoke',  'Withdraw a pending invitation',              'tenant'),
  ('identity.role.assign',        'Grant or withdraw a role on a membership',   'tenant'),
  ('audit.event.read',            'Read the tenant''s own audit log',           'tenant'),
  ('platform.tenant.create',      'Create a tenant (checked by provision_tenant)', 'platform'),
  ('platform.tenant.read',        'List and read all tenants',                  'platform'),
  ('platform.tenant.manage',      'Suspend or deactivate any tenant',           'platform'),
  ('platform.audit.read',         'Read all tenants'' audit and security events','platform')
on conflict (key) do update
  set description = excluded.description, scope = excluded.scope;

-- --- Role -> permission grants (45) ----------------------------------------
insert into identity.role_permissions (role_key, permission_key) values
  -- tenant_owner: 13
  ('tenant_owner','tenancy.tenant.read'),      ('tenant_owner','tenancy.tenant.update'),
  ('tenant_owner','tenancy.tenant.manage'),    ('tenant_owner','identity.profile.read'),
  ('tenant_owner','identity.membership.read'), ('tenant_owner','identity.membership.create'),
  ('tenant_owner','identity.membership.update'),('tenant_owner','identity.membership.delete'),
  ('tenant_owner','identity.invitation.read'), ('tenant_owner','identity.invitation.create'),
  ('tenant_owner','identity.invitation.revoke'),('tenant_owner','identity.role.assign'),
  ('tenant_owner','audit.event.read'),
  -- tenant_admin: 12 (no tenancy.tenant.manage -- deactivation is near-irreversible)
  ('tenant_admin','tenancy.tenant.read'),      ('tenant_admin','tenancy.tenant.update'),
  ('tenant_admin','identity.profile.read'),    ('tenant_admin','identity.membership.read'),
  ('tenant_admin','identity.membership.create'),('tenant_admin','identity.membership.update'),
  ('tenant_admin','identity.membership.delete'),('tenant_admin','identity.invitation.read'),
  ('tenant_admin','identity.invitation.create'),('tenant_admin','identity.invitation.revoke'),
  ('tenant_admin','identity.role.assign'),     ('tenant_admin','audit.event.read'),
  -- manager: 7. Can invite and update, but NOT delete memberships or assign
  -- roles. Managers manage staff; they do not decide who holds authority.
  -- Without that split, manager is tenant_admin with a different name.
  ('manager','tenancy.tenant.read'),           ('manager','identity.profile.read'),
  ('manager','identity.membership.read'),      ('manager','identity.membership.update'),
  ('manager','identity.invitation.read'),      ('manager','identity.invitation.create'),
  ('manager','identity.invitation.revoke'),
  -- staff: 3
  ('staff','tenancy.tenant.read'), ('staff','identity.profile.read'), ('staff','identity.membership.read'),
  -- viewer: 3, all read. Zero writes -- tested.
  ('viewer','tenancy.tenant.read'), ('viewer','identity.profile.read'), ('viewer','identity.membership.read'),
  -- service_account: 1. An integration credential lives in someone else's
  -- config and is the most likely thing to leak, so it gets the least. No
  -- profiles, no memberships -- nothing about people.
  ('service_account','tenancy.tenant.read'),
  -- platform_owner: 4
  ('platform_owner','platform.tenant.create'), ('platform_owner','platform.tenant.read'),
  ('platform_owner','platform.tenant.manage'), ('platform_owner','platform.audit.read'),
  -- platform_admin: 3. Sees every tenant but CANNOT suspend one -- ops needs
  -- visibility, not a kill switch.
  ('platform_admin','platform.tenant.create'), ('platform_admin','platform.tenant.read'),
  ('platform_admin','platform.audit.read')
on conflict (role_key, permission_key) do nothing;
