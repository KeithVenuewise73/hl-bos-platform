-- LOCAL TESTS ONLY. Synthetic world for the Revenue Center persistence tests.
-- Applied as the database owner after scripts/local-test/supabase-shim.sql and
-- every migration in supabase/migrations. Never applied to a hosted project.
-- Every name and address here is fictitious (.test domains).

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000a001', 'owner@hlg.test',      now()),  -- the CEO
  ('00000000-0000-4000-8000-00000000a002', 'hld-lead@hlg.test',   now()),  -- HLD only
  ('00000000-0000-4000-8000-00000000a003', 'outsider@hlg.test',   now())   -- no membership
on conflict (id) do nothing;

-- One tenant per business line: RLS is what keeps them apart.
insert into platform.tenants (id, slug, name, status, tenant_class) values
  ('00000000-0000-4000-8000-0000000000d1', 'hld',  'Herman Legacy Digital',         'active', 'first_party'),
  ('00000000-0000-4000-8000-0000000000d2', 'hscs', 'Herman Supply Chain Solutions', 'active', 'first_party')
on conflict (id) do nothing;

insert into identity.memberships (id, tenant_id, user_id, status) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a001', 'active'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000a001', 'active'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a002', 'active')
on conflict (id) do nothing;

insert into identity.membership_roles (membership_id, role_key) values
  ('00000000-0000-4000-8000-0000000000e1', 'tenant_owner'),
  ('00000000-0000-4000-8000-0000000000e2', 'tenant_owner'),
  ('00000000-0000-4000-8000-0000000000e3', 'manager')
on conflict do nothing;

-- Proposal drafts live in visibility.content_assets, which is entitlement-gated.
insert into entitlements.module_activations (tenant_id, module) values
  ('00000000-0000-4000-8000-0000000000d1', 'visibility'),
  ('00000000-0000-4000-8000-0000000000d2', 'visibility')
on conflict do nothing;
insert into entitlements.tenant_entitlements (tenant_id, feature_key) values
  ('00000000-0000-4000-8000-0000000000d1', 'visibility.content'),
  ('00000000-0000-4000-8000-0000000000d2', 'visibility.content')
on conflict do nothing;
