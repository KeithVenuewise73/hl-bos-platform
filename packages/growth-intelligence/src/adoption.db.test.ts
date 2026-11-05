// Adoption of existing HLD barbershop prospects (supabase/proposed/revenue-center/adopt_hld_barbershops.sql),
// on the PRODUCTION-EQUIVALENT schema only (it needs production's transform_audit).
// Synthetic stand-ins shaped like production's 50 records: 50 prospects with shop
// profiles, 40 with a Transformation Audit run, findings and recommendations.
// Runs when HLBOS_LOCAL_PG is set.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { psql, psqlRpc, type LocalPg } from "./local-pg.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const ROOT = path.resolve(import.meta.dirname, "../../..");
const OWNER = "00000000-0000-4000-8000-00000000a001";
const HLD_MGR = "00000000-0000-4000-8000-00000000a002";
const PLATFORM = "00000000-0000-4000-8000-00000000a006";
const HLD = "00000000-0000-4000-8000-0000000000d1";

describe.skipIf(!ENV)(
  "Adopting existing HLD barbershops (production-equivalent schema)",
  () => {
    const i = (ENV ?? "/tmp:0").lastIndexOf(":");
    const pg: LocalPg = {
      host: (ENV ?? "/tmp:0").slice(0, i),
      port: (ENV ?? "/tmp:0").slice(i + 1),
      user: "postgres",
      database: "hlbos_adoption_test",
    };
    const rpc = psqlRpc(pg);
    const db = (sql: string) => psql(pg, sql).trim();
    /** A fingerprint of every pre-existing row adoption must not touch. */
    const untouched = () =>
      db(`select md5(string_agg(x, '|' order by x)) from (
          select to_jsonb(p)::text x from visibility.prospects p where tenant_id='${HLD}'
          union all select to_jsonb(s)::text from transform_audit.shop_profiles s
          union all select to_jsonb(r)::text from transform_audit.runs r
          union all select to_jsonb(f)::text from transform_audit.findings f
          union all select to_jsonb(c)::text from transform_audit.recommendations c) t`);
    const adopt = (who: string, dry: boolean) =>
      rpc.call<{
        dry_run: boolean;
        eligible: number;
        adopted: number;
        already_adopted: number;
        conflicts: unknown[];
      }>(who, "revenue.adopt_from_transform_audit", {
        p_tenant: HLD,
        p_ta_campaign_key: "wny_barbers_50",
        p_revenue_campaign: "hld_barbers_wny",
        p_dry_run: dry,
      });
    let before = "";

    beforeAll(async () => {
      psql(
        pg,
        `drop database if exists ${pg.database};\ncreate database ${pg.database};`,
        "postgres",
      );
      execFileSync(
        "bash",
        [path.join(ROOT, "scripts/local-test/build-prod-equivalent.sh"), pg.database],
        {
          env: { ...process.env, PGHOST: pg.host, PGPORT: pg.port, PGUSER: pg.user },
          stdio: "pipe",
        },
      );
      for (const f of [
        "supabase/proposed/revenue-center/revenue_center_controls.sql",
        "supabase/proposed/revenue-center/adopt_hld_barbershops.sql",
        "scripts/local-test/revenue-center-fixture.sql",
      ])
        psql(pg, readFileSync(path.join(ROOT, f), "utf8"));
      await rpc.call(PLATFORM, "revenue.set_release_settings", {
        p_environment: "development",
        p_allow_synthetic: true,
        p_allow_mock_delivery: false,
        p_allow_paid_discovery: false,
        p_allow_auto_notifications: false,
        p_allow_outbound_delivery: false,
      });
      await rpc.call(PLATFORM, "revenue.set_business_line", {
        p_tenant: HLD,
        p_line: "hld",
      });
      await rpc.call(PLATFORM, "revenue.designate_approver", {
        p_tenant: HLD,
        p_user: OWNER,
      });
      await rpc.call(HLD_MGR, "revenue.upsert_campaign", {
        p_tenant: HLD,
        p_key: "hld_barbers_wny",
        p_industry: "barbershop",
        p_name: "WNY barbershops",
        p_market_label: "Buffalo, NY",
        p_radius_miles: 25,
        p_target: 50,
      });
      await rpc.call(OWNER, "revenue.set_campaign_status", {
        p_tenant: HLD,
        p_key: "hld_barbers_wny",
        p_status: "approved",
      });
      // Synthetic stand-in for production's imported list (written as the owner of the tables, like the original import).
      psql(
        pg,
        `
      insert into transform_audit.campaigns (id, tenant_id, key, name) values ('00000000-0000-4000-8000-0000000000c1', '${HLD}', 'wny_barbers_50', 'WNY 50 (synthetic stand-in)');
      insert into visibility.prospects (id, tenant_id, business_name, phone, website_url, industry)
        select ('00000000-0000-4000-8001-' || lpad(n::text, 12, '0'))::uuid, '${HLD}', 'Synthetic Barbershop ' || n,
               case when n <= 30 then '716555' || lpad(n::text, 4, '0') end, case when n <= 10 then 'https://barber' || n || '.example.test' end, 'barbershop'
        from generate_series(1, 50) n;
      insert into transform_audit.shop_profiles (prospect_id, tenant_id, locality, region, source_file, source_row, dedupe_key)
        select ('00000000-0000-4000-8001-' || lpad(n::text, 12, '0'))::uuid, '${HLD}', 'Buffalo', 'NY', 'wny_barbers.csv', n, 'name:synthetic barbershop ' || n
        from generate_series(1, 50) n;
      insert into transform_audit.runs (id, tenant_id, campaign_id, prospect_id, status, weights, composite_score, dimensions_scored, dimensions_possible, started_at)
        select ('00000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid, '${HLD}', '00000000-0000-4000-8000-0000000000c1',
               ('00000000-0000-4000-8001-' || lpad(n::text, 12, '0'))::uuid,
               (select enumlabel::transform_audit.run_status from pg_enum where enumtypid='transform_audit.run_status'::regtype order by enumsortorder desc limit 1),
               '{"website": 1}', 40 + n, 1, 1, now()
        from generate_series(1, 40) n;
    `,
      );
      // First value of whatever enum a column uses (read from the catalog, not assumed).
      const firstEnum = (table: string, col: string) =>
        db(`select e.enumlabel from pg_attribute a join pg_enum e on e.enumtypid = a.atttypid
          where a.attrelid = '${table}'::regclass and a.attname = '${col}' order by e.enumsortorder limit 1`);
      const dim = firstEnum("transform_audit.findings", "dimension");
      const conf = firstEnum("transform_audit.findings", "confidence");
      const pri = firstEnum("transform_audit.recommendations", "priority");
      const cap =
        firstEnum("transform_audit.recommendations", "capability_key") ||
        db(`select key from barberos.capabilities limit 1`);
      psql(
        pg,
        `insert into transform_audit.findings (run_id, dimension, code, statement, observed, confidence, detector)
      select ('00000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid, '${dim}', 'synthetic_finding', 'Synthetic finding', '{}', '${conf}', 'synthetic'
      from generate_series(1, 40) n;`,
      );
      psql(
        pg,
        `insert into transform_audit.recommendations (run_id, priority, rank, title, detail, capability_key)
      select ('00000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid, '${pri}', 1, 'Synthetic recommendation', '', '${cap}'
      from generate_series(1, 40) n;`,
      );
      expect(
        db(
          `select (select count(*) from transform_audit.findings)||'/'||(select count(*) from transform_audit.recommendations)`,
        ),
      ).toBe("40/40");
      before = untouched();
    }, 300_000);

    it("only the designated owner can adopt", async () => {
      await expect(adopt(HLD_MGR, true)).rejects.toThrow(/designated owner/);
    });

    it("a dry run reports the plan and writes nothing", async () => {
      const r = await adopt(OWNER, true);
      expect(r).toMatchObject({
        dry_run: true,
        eligible: 50,
        adopted: 50,
        already_adopted: 0,
        conflicts: [],
      });
      expect(db(`select count(*) from revenue.prospect_profiles`)).toBe("0");
      expect(untouched()).toBe(before);
    });

    it("adoption adds a profile and identity keys per prospect, with source attribution; changes nothing existing", async () => {
      const r = await adopt(OWNER, false);
      expect(r).toMatchObject({ dry_run: false, eligible: 50, adopted: 50 });
      expect(untouched()).toBe(before);
      expect(
        db(
          `select count(*)||'/'||count(*) filter (where not is_synthetic and discovery_source='import' and industry_key='barbershop') from revenue.prospect_profiles`,
        ),
      ).toBe("50/50");
      expect(
        db(`select source_ref->>'source_file'||'#'||(source_ref->>'source_row')||' runs='||jsonb_array_length(source_ref->'transform_audit_run_ids')
               from revenue.prospect_profiles where prospect_id='00000000-0000-4000-8001-000000000001'`),
      ).toBe("wny_barbers.csv#1 runs=1");
      expect(
        db(`select count(*) from revenue.identity_keys where key like 'phone:%'`),
      ).toBe("30");
      expect(
        db(`select count(*) from revenue.identity_keys where key like 'domain:%'`),
      ).toBe("10");
      expect(
        db(
          `select stage from visibility.prospects where id='00000000-0000-4000-8001-000000000001'`,
        ),
      ).toBe("prospect");
      expect(
        db(
          `select count(*) from audit.security_events where action='revenue.adopt_from_transform_audit'`,
        ),
      ).toBe("1");
    });

    it("history is preserved and visible alongside the Revenue Center", async () => {
      const h = await rpc.rows<{ source: string }>(OWNER, "revenue.prospect_history", {
        prospect_id: "00000000-0000-4000-8001-000000000001",
      });
      expect(h.map((x) => x.source)).toContain("transform_audit");
      expect(
        Number(
          db(
            `select count(*) from revenue.prospect_history where source='transform_audit'`,
          ),
        ),
      ).toBe(40);
    });

    it("running it again adopts nothing new; a rediscovered barbershop is a duplicate", async () => {
      expect(await adopt(OWNER, false)).toMatchObject({
        adopted: 0,
        already_adopted: 50,
      });
      const r = await rpc.call<{ duplicate: boolean }>(
        HLD_MGR,
        "revenue.register_prospect",
        {
          p_tenant: HLD,
          p_business: "SYNTHETIC BARBER SHOP 7",
          p_industry: "barbershop",
          p_dedupe: "domain:barber7.example.test",
          p_source: "import",
          p_is_synthetic: false,
          p_phone: "(716) 555-0007",
        },
      );
      expect(r.duplicate).toBe(true);
    });

    it("an adopted record without a website scan cannot be sent to review until scanned", async () => {
      await expect(
        rpc.call(HLD_MGR, "revenue.send_to_review", {
          p_prospect: "00000000-0000-4000-8001-000000000001",
          p_request_key: "x",
          p_payload: { scores: [] },
        }),
      ).rejects.toThrow(/nothing was checked/);
    });

    it("the adoption can be reversed without touching the original records, and redone", async () => {
      await expect(
        rpc.call(HLD_MGR, "revenue.unadopt_transform_audit", { p_tenant: HLD }),
      ).rejects.toThrow(/designated owner/);
      expect(
        await rpc.call<number>(OWNER, "revenue.unadopt_transform_audit", {
          p_tenant: HLD,
        }),
      ).toBe(50);
      expect(db(`select count(*) from revenue.prospect_profiles`)).toBe("0");
      expect(db(`select count(*) from revenue.identity_keys`)).toBe("0");
      expect(untouched()).toBe(before);
      expect(await adopt(OWNER, false)).toMatchObject({ adopted: 50 });
    });
  },
);
