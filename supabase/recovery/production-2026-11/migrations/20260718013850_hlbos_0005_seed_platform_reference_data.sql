-- hlbos_0005_seed_platform_reference_data
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

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','tenancy.tenant.read'),      ('tenant_owner','tenancy.tenant.update'),
  ('tenant_owner','tenancy.tenant.manage'),    ('tenant_owner','identity.profile.read'),
  ('tenant_owner','identity.membership.read'), ('tenant_owner','identity.membership.create'),
  ('tenant_owner','identity.membership.update'),('tenant_owner','identity.membership.delete'),
  ('tenant_owner','identity.invitation.read'), ('tenant_owner','identity.invitation.create'),
  ('tenant_owner','identity.invitation.revoke'),('tenant_owner','identity.role.assign'),
  ('tenant_owner','audit.event.read'),
  ('tenant_admin','tenancy.tenant.read'),      ('tenant_admin','tenancy.tenant.update'),
  ('tenant_admin','identity.profile.read'),    ('tenant_admin','identity.membership.read'),
  ('tenant_admin','identity.membership.create'),('tenant_admin','identity.membership.update'),
  ('tenant_admin','identity.membership.delete'),('tenant_admin','identity.invitation.read'),
  ('tenant_admin','identity.invitation.create'),('tenant_admin','identity.invitation.revoke'),
  ('tenant_admin','identity.role.assign'),     ('tenant_admin','audit.event.read'),
  ('manager','tenancy.tenant.read'),           ('manager','identity.profile.read'),
  ('manager','identity.membership.read'),      ('manager','identity.membership.update'),
  ('manager','identity.invitation.read'),      ('manager','identity.invitation.create'),
  ('manager','identity.invitation.revoke'),
  ('staff','tenancy.tenant.read'), ('staff','identity.profile.read'), ('staff','identity.membership.read'),
  ('viewer','tenancy.tenant.read'), ('viewer','identity.profile.read'), ('viewer','identity.membership.read'),
  ('service_account','tenancy.tenant.read'),
  ('platform_owner','platform.tenant.create'), ('platform_owner','platform.tenant.read'),
  ('platform_owner','platform.tenant.manage'), ('platform_owner','platform.audit.read'),
  ('platform_admin','platform.tenant.create'), ('platform_admin','platform.tenant.read'),
  ('platform_admin','platform.audit.read')
on conflict (role_key, permission_key) do nothing;