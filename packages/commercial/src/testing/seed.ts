/**
 * Seeding helpers for isolated-database tests and demos. They stand in for
 * HL-BOS provisioning (platform.provision_tenant + invitations) and run as
 * superuser, so they must never be pointed at a real project — IsolatedDb
 * already refuses anything but a local host.
 */

import type { PoolClient } from "pg";
import type { IsolatedDb } from "../db.ts";

export async function seedUser(
  db: IsolatedDb,
  email: string,
  password?: string,
): Promise<string> {
  return db.superuser(async (c: PoolClient) => {
    const r = await c.query(
      `insert into auth.users (email, email_confirmed_at, encrypted_password)
       values ($1, now(), case when $2::text is null then null else extensions.crypt($2, extensions.gen_salt('bf')) end)
       returning id`,
      [email, password ?? null],
    );
    return (r.rows[0] as { id: string }).id;
  });
}

export async function seedTenant(
  db: IsolatedDb,
  slug: string,
  name: string,
  status = "active",
): Promise<string> {
  return db.superuser(async (c) => {
    const r = await c.query(
      `insert into platform.tenants (slug, name, status) values ($1, $2, $3) returning id`,
      [slug, name, status],
    );
    return (r.rows[0] as { id: string }).id;
  });
}

/** An active HL-BOS membership with one tenant role (tenant_owner, manager, staff, ...). */
export async function seedMember(
  db: IsolatedDb,
  tenant: string,
  user: string,
  role: string,
): Promise<void> {
  await db.superuser(async (c) => {
    const m = await c.query(
      `insert into identity.memberships (tenant_id, user_id, status) values ($1, $2, 'active')
       on conflict (tenant_id, user_id) do update set status = 'active' returning id`,
      [tenant, user],
    );
    await c.query(
      `insert into identity.membership_roles (membership_id, role_key) values ($1, $2) on conflict do nothing`,
      [(m.rows[0] as { id: string }).id, role],
    );
  });
}

/** A platform service account (the billing / delivery worker identity). */
export async function seedServiceAccount(
  db: IsolatedDb,
  email: string,
): Promise<string> {
  const id = await seedUser(db, email);
  await db.superuser((c) =>
    c.query(
      `insert into identity.platform_admins (user_id, role_key) values ($1, 'platform_admin')`,
      [id],
    ),
  );
  return id;
}
