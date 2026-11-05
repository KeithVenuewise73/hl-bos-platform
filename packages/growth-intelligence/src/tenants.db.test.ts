// The HSCS commercial-tenant package (supabase/proposed/revenue-center/provision_hscs_commercial.md),
// run step by step through the real platform functions on an isolated database, next to a stand-in
// for the government-contracting tenant. Runs when HLBOS_LOCAL_PG is set.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { psql, psqlRpc, type LocalPg } from "./local-pg.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const ROOT = path.resolve(import.meta.dirname, "../../..");
const OWNER = "00000000-0000-4000-8000-00000000a001";
const PLATFORM = "00000000-0000-4000-8000-00000000a006";
const HSCS_MGR = "00000000-0000-4000-8000-00000000a004";
const GOV = "00000000-0000-4000-8000-0000000000f1"; // stand-in for hscs-government

describe.skipIf(!ENV)("Provisioning the HSCS commercial tenant", () => {
  const i = (ENV ?? "/tmp:0").lastIndexOf(":");
  const pg: LocalPg = {
    host: (ENV ?? "/tmp:0").slice(0, i),
    port: (ENV ?? "/tmp:0").slice(i + 1),
    user: "postgres",
    database: "hlbos_tenant_test",
  };
  const rpc = psqlRpc(pg);
  const db = (sql: string) => psql(pg, sql).trim();
  let hscs = "";

  beforeAll(() => {
    psql(
      pg,
      `drop database if exists ${pg.database};\ncreate database ${pg.database};`,
      "postgres",
    );
    psql(
      pg,
      readFileSync(path.join(ROOT, "scripts/local-test/supabase-shim.sql"), "utf8"),
    );
    const dir = path.join(ROOT, "supabase/migrations");
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith(".sql"))
      .sort())
      psql(
        pg,
        readFileSync(path.join(dir, f), "utf8").replace(
          /create extension if not exists pgtap[^;]*;/gi,
          "",
        ),
      );
    psql(
      pg,
      readFileSync(
        path.join(ROOT, "supabase/proposed/revenue-center/revenue_center_controls.sql"),
        "utf8",
      ),
    );
    psql(
      pg,
      readFileSync(
        path.join(ROOT, "scripts/local-test/revenue-center-fixture.sql"),
        "utf8",
      ),
    );
    // Stand-in for hscs-government: first-party, owned by the same person, holding BTI records.
    psql(
      pg,
      `
      insert into platform.tenants (id, slug, name, status, tenant_class) values ('${GOV}', 'hscs-government', 'HSCS Government', 'trial', 'first_party');
      insert into identity.memberships (id, tenant_id, user_id, status) values ('00000000-0000-4000-8000-0000000000e9', '${GOV}', '${OWNER}', 'active');
      insert into identity.membership_roles (membership_id, role_key) values ('00000000-0000-4000-8000-0000000000e9', 'tenant_owner');
      insert into bti.businesses (tenant_id, key, name) values ('${GOV}', 'gov_one', 'Government record (synthetic)'), ('${GOV}', 'gov_two', 'Government record 2 (synthetic)');
    `,
    );
  }, 300_000);

  it("step 1 — the platform owner provisions a new first-party tenant (nobody else can)", async () => {
    await expect(
      rpc.call(OWNER, "platform.provision_tenant", {
        p_slug: "herman-supply-chain-solutions",
        p_name: "x",
        p_owner: OWNER,
        p_tenant_class: "first_party",
      }),
    ).rejects.toThrow();
    hscs = await rpc.call<string>(PLATFORM, "platform.provision_tenant", {
      p_slug: "herman-supply-chain-solutions",
      p_name: "Herman Supply Chain Solutions",
      p_owner: OWNER,
      p_tenant_class: "first_party",
    });
    expect(
      db(
        `select tenant_class||'/'||(select count(*) from identity.memberships where tenant_id='${hscs}') from platform.tenants where id='${hscs}'`,
      ),
    ).toBe("first_party/1");
  });

  it("steps 2–4 — business line, approver, first-party enablement; lines are unique", async () => {
    await rpc.call(PLATFORM, "revenue.set_business_line", {
      p_tenant: hscs,
      p_line: "hscs",
    });
    await expect(
      rpc.call(PLATFORM, "revenue.set_business_line", {
        p_tenant: GOV,
        p_line: "hscs",
      }),
    ).rejects.toThrow(/business_lines_line_key|duplicate/);
    await rpc.call(PLATFORM, "revenue.designate_approver", {
      p_tenant: hscs,
      p_user: OWNER,
    });
    await expect(
      rpc.call(OWNER, "revenue.enable_first_party_tenant", { p_tenant: hscs }),
    ).rejects.toThrow(/platform owner/);
    await rpc.call(PLATFORM, "revenue.enable_first_party_tenant", { p_tenant: hscs });
    expect(
      db(
        `select count(*) from entitlements.module_activations where tenant_id='${hscs}' and module='visibility' and active`,
      ),
    ).toBe("1");
    // a customer tenant can never be enabled this way
    const cust = await rpc.call<string>(PLATFORM, "platform.provision_tenant", {
      p_slug: "some-customer",
      p_name: "Customer",
      p_owner: OWNER,
      p_tenant_class: "customer",
    });
    await expect(
      rpc.call(PLATFORM, "revenue.enable_first_party_tenant", { p_tenant: cust }),
    ).rejects.toThrow(/first-party/);
  });

  it("step 5 — HSCS campaigns accept only HSCS industries", async () => {
    await rpc.call(OWNER, "revenue.upsert_campaign", {
      p_tenant: hscs,
      p_key: "hscs_movers_wny",
      p_industry: "moving",
      p_name: "Movers",
      p_market_label: "Buffalo, NY",
      p_radius_miles: 30,
    });
    await rpc.call(OWNER, "revenue.set_campaign_status", {
      p_tenant: hscs,
      p_key: "hscs_movers_wny",
      p_status: "approved",
    });
    await expect(
      rpc.call(OWNER, "revenue.upsert_campaign", {
        p_tenant: hscs,
        p_key: "hscs_salons",
        p_industry: "salon",
        p_name: "x",
        p_market_label: "Buffalo, NY",
        p_radius_miles: 30,
      }),
    ).rejects.toThrow(/belongs to HLD/);
  });

  it("isolation: a member of the new HSCS tenant sees nothing of the government tenant, and vice versa", async () => {
    // give the HSCS manager a membership in the NEW tenant only
    psql(
      pg,
      `insert into identity.memberships (id, tenant_id, user_id, status) values ('00000000-0000-4000-8000-0000000000ea', '${hscs}', '${HSCS_MGR}', 'active');
              insert into identity.membership_roles (membership_id, role_key) values ('00000000-0000-4000-8000-0000000000ea', 'manager');`,
    );
    // the pilot default forbids synthetic records — the provisioning test must not need any
    await expect(
      rpc.call(HSCS_MGR, "revenue.register_prospect", {
        p_tenant: hscs,
        p_business: "Example Movers (synthetic)",
        p_industry: "moving",
        p_dedupe: "name:examplemovers|buffalo",
        p_source: "import",
        p_is_synthetic: true,
      }),
    ).rejects.toThrow(/not allowed in this environment/);
    const real = await rpc.call<{ prospect_id: string }>(
      HSCS_MGR,
      "revenue.register_prospect",
      {
        p_tenant: hscs,
        p_business: "Example Movers",
        p_industry: "moving",
        p_dedupe: "name:examplemovers|buffalo",
        p_source: "import",
        p_is_synthetic: false,
      },
    );
    expect(await rpc.rows(HSCS_MGR, "bti.businesses", { tenant_id: GOV })).toEqual([]);
    expect(await rpc.rows(HSCS_MGR, "platform.tenants", { id: GOV })).toEqual([]);
    expect(
      await rpc.rows(OWNER, "visibility.prospects", { id: real.prospect_id }),
    ).toHaveLength(1); // the owner sees both
    expect(db(`select count(*) from bti.businesses where tenant_id='${GOV}'`)).toBe(
      "2",
    ); // untouched
    expect(
      db(`select count(*) from revenue.business_lines where tenant_id='${GOV}'`),
    ).toBe("0");
  });
});
