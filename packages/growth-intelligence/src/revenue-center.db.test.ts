// Persistence tests for the Revenue Center workflow against the REAL HL-BOS
// schema: every migration in supabase/migrations, applied to a throwaway local
// PostgreSQL, with RLS and permission checks live. Synthetic records only; the
// only "provider" is the seeded mock_email; nothing is sent.
//
// Runs when HLBOS_LOCAL_PG is set (host:port of a local server, socket dir or
// localhost). See scripts/local-test/revenue-center-db.sh. Without it the suite
// is skipped and says so.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { prospect } from "./fixtures.test-helpers.ts";
import { psql, psqlRpc, type LocalPg } from "./psql-rpc.test-helpers.ts";
import {
  RevenueCenter,
  WorkflowError,
  type Campaign,
  type PriceBook,
} from "./index.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const ROOT = path.resolve(import.meta.dirname, "../../..");

const OWNER = "00000000-0000-4000-8000-00000000a001";
const HLD_LEAD = "00000000-0000-4000-8000-00000000a002";
const OUTSIDER = "00000000-0000-4000-8000-00000000a003";
const TENANTS = {
  hld: "00000000-0000-4000-8000-0000000000d1",
  hscs: "00000000-0000-4000-8000-0000000000d2",
};
const CAMPAIGNS: Campaign[] = [
  {
    key: "wny_barbers",
    line: "hld",
    name: "WNY barbers (synthetic)",
    status: "approved",
  },
  {
    key: "wny_carriers",
    line: "hscs",
    name: "WNY carriers (synthetic)",
    status: "approved",
  },
];
const NOW = new Date("2026-11-05T12:00:00.000Z");
const HLD_PRICES: PriceBook = {
  line: "hld",
  oneTimeCents: { "hld.booking": 50_000 },
  monthlyCents: { "hld.booking": 0 },
  approvedBy: "synthetic",
  approvedAt: NOW.toISOString(),
};

function pgFromEnv(v: string): LocalPg {
  const i = v.lastIndexOf(":");
  return {
    host: v.slice(0, i),
    port: v.slice(i + 1),
    user: "postgres",
    database: "hlbos_revenue_center_test",
  };
}

describe.skipIf(!ENV)(
  "Revenue Center workflow, persisted in HL-BOS (local PostgreSQL)",
  () => {
    const pg = pgFromEnv(ENV ?? "/tmp:0");
    const db = (sql: string) => psql(pg, sql).trim();
    let rc: RevenueCenter;

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
        .sort()) {
        // pgTAP is a test-only extension; not installed on this local server.
        psql(
          pg,
          readFileSync(path.join(dir, f), "utf8").replace(
            /create extension if not exists pgtap[^;]*;/gi,
            "",
          ),
        );
      }
      psql(
        pg,
        readFileSync(
          path.join(ROOT, "scripts/local-test/revenue-center-fixture.sql"),
          "utf8",
        ),
      );
      rc = new RevenueCenter(psqlRpc(pg), TENANTS, CAMPAIGNS);
    }, 180_000);

    it("runs the whole chain: discovered → persisted → review → findings → HLD pipeline → proposal → owner approval → outreach queued, never sent", async () => {
      const lead = prospect({
        id: "syn-1",
        name: "Synthetic Barber One",
        email: "owner@synthetic-barber.test",
      });

      const p = await rc.persistDiscovered(HLD_LEAD, lead, "wny_barbers");
      expect(p.status).toBe("persisted");
      if (p.status !== "persisted") return;
      expect(p.line).toBe("hld");
      expect(
        db(`select tenant_id from visibility.prospects where id='${p.prospectId}'`),
      ).toBe(TENANTS.hld);

      const a = await rc.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW });
      expect(a.categoriesScored).toEqual(["calls_to_action"]); // only the checked component
      expect(
        db(
          `select status||'/'||growth_score from visibility.assessments where id='${a.assessmentId}'`,
        ),
      ).toBe("completed/20");
      expect(
        db(`select stage from visibility.prospects where id='${p.prospectId}'`),
      ).toBe("assessed");
      const recs = db(
        `select kind||'|'||coalesce(recommended_service,'')||'|'||left(detail,20) from visibility.recommendations where assessment_id='${a.assessmentId}' order by id`,
      );
      expect(recs).toBe(
        "weakness||OBSERVED (website, 2\nservice|hld.booking|ESTIMATED OPPORTUNIT",
      );

      const d = await rc.draftProposal(HLD_LEAD, p.prospectId, a.review, HLD_PRICES);
      expect(d.proposal.status).toBe("ready_for_approval");
      expect(d.approvalInstanceId).toBeDefined();
      expect(
        db(
          `select kind||'/'||status from visibility.content_assets where id='${d.contentId}'`,
        ),
      ).toBe("proposal/pending_approval");
      expect(
        db(`select stage from visibility.prospects where id='${p.prospectId}'`),
      ).toBe("proposed");

      // Outreach is refused until the owner approves the proposal.
      await expect(
        rc.requestOutreach(HLD_LEAD, d.contentId, "owner@synthetic-barber.test", {
          business: "x",
          contact: "x",
          link: "x",
        }),
      ).rejects.toThrow(WorkflowError);

      await rc.decide(OWNER, d.approvalInstanceId!, "approved", "synthetic test");

      // The database itself refuses marketing without consent.
      await expect(
        rc.requestOutreach(HLD_LEAD, d.contentId, "owner@synthetic-barber.test", {
          business: "x",
          contact: "x",
          link: "x",
        }),
      ).rejects.toThrow(/requires prior consent/);

      await psqlRpc(pg).call(OWNER, "comms.set_consent", {
        p_tenant: TENANTS.hld,
        p_channel: "email",
        p_contact: "owner@synthetic-barber.test",
        p_status: "granted",
        p_source: "synthetic test record",
      });
      const o = await rc.requestOutreach(
        HLD_LEAD,
        d.contentId,
        "owner@synthetic-barber.test",
        {
          business: "Synthetic Barber One",
          contact: "Owner",
          link: "https://example.test/p/1",
        },
      );
      expect(db(`select status from comms.messages where id='${o.messageId}'`)).toBe(
        "pending",
      );
      await expect(rc.releaseOutreach(HLD_LEAD, o.messageId)).rejects.toThrow(
        /not approved by a human/,
      );

      await rc.decide(OWNER, o.approvalInstanceId, "approved");
      await rc.releaseOutreach(OWNER, o.messageId);
      expect(
        db(
          `select status||'|'||provider_key||'|'||coalesce(sent_at::text,'never sent') from comms.messages where id='${o.messageId}'`,
        ),
      ).toBe("approved|mock_email|never sent");
      expect(
        db(`select count(*) from comms.messages where status in ('sent','delivered')`),
      ).toBe("0");
    });

    it("keeps CRM history: a second review adds a record and the first survives", async () => {
      const lead = prospect({ id: "syn-2", name: "Synthetic Barber Two" });
      const p = await rc.persistDiscovered(HLD_LEAD, lead, "wny_barbers");
      if (p.status !== "persisted") throw new Error("not persisted");
      await rc.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW });
      // A fresh instance reads what the first one wrote: it is in the database.
      const again = new RevenueCenter(psqlRpc(pg), TENANTS, CAMPAIGNS);
      await again.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW });
      expect(
        db(
          `select count(*) from visibility.assessments where prospect_id='${p.prospectId}' and status='completed'`,
        ),
      ).toBe("2");
      // Every change is in the audit trail, attributed to the user who made it.
      expect(
        db(
          `select count(*) from audit.events where resource_type='visibility.assessments' and actor_id='${HLD_LEAD}' and after->>'prospect_id'='${p.prospectId}'`,
        ),
      ).toBe("4"); // 2 inserts + 2 completions
    });

    it("routes an HSCS campaign lead into the HSCS tenant, and the HLD lead cannot see or write HSCS", async () => {
      // The scanner has no transportation vertical yet, so the industry comes from
      // the Places type. Without it, routing (correctly) asks a person.
      const lead = prospect({
        id: "syn-3",
        name: "Synthetic Carrier",
        vertical: "professional_services",
        places: {
          record: { primaryTypeLabel: "Trucking company" } as never,
          observedAt: NOW.toISOString(),
          expiresAt: NOW.toISOString(),
        },
      });
      const p = await rc.persistDiscovered(OWNER, lead, "wny_carriers");
      if (p.status !== "persisted") throw new Error("not persisted");
      expect(p.line).toBe("hscs");
      expect(
        await psqlRpc(pg).rows(HLD_LEAD, "visibility.prospects", { id: p.prospectId }),
      ).toEqual([]);
      expect(
        await psqlRpc(pg).rows(OWNER, "visibility.prospects", { id: p.prospectId }),
      ).toHaveLength(1);
      await expect(
        rc.persistDiscovered(HLD_LEAD, lead, "wny_carriers"),
      ).rejects.toThrow(/insufficient privilege/);
      await expect(
        rc.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW }),
      ).rejects.toThrow(/not visible to you/);
      expect(await psqlRpc(pg).rows(OUTSIDER, "visibility.prospects", {})).toEqual([]);
    });

    it("persists nothing for a lead whose business line is uncertain", async () => {
      const before = db(`select count(*) from visibility.prospects`);
      const r = await rc.persistDiscovered(
        OWNER,
        prospect({ id: "syn-4" }),
        "unregistered_campaign",
      );
      expect(r.status).toBe("needs_review");
      expect(db(`select count(*) from visibility.prospects`)).toBe(before);
    });

    it("an unpriced proposal is stored as a draft and the owner is not asked", async () => {
      const lead = prospect({ id: "syn-5", name: "Synthetic Barber Five" });
      const p = await rc.persistDiscovered(HLD_LEAD, lead, "wny_barbers");
      if (p.status !== "persisted") throw new Error("not persisted");
      const a = await rc.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW });
      const d = await rc.draftProposal(HLD_LEAD, p.prospectId, a.review);
      expect(d.proposal.status).toBe("blocked");
      expect(d.approvalInstanceId).toBeUndefined();
      expect(
        db(`select status from visibility.content_assets where id='${d.contentId}'`),
      ).toBe("draft");
      expect(
        db(`select stage from visibility.prospects where id='${p.prospectId}'`),
      ).toBe("assessed");
    });

    it("a lead with nothing checked is refused before anything is written", async () => {
      const lead = prospect({
        id: "syn-6",
        score: { version: "v", total: 0, checkedMax: 0, components: [] },
      });
      const p = await rc.persistDiscovered(HLD_LEAD, lead, "wny_barbers");
      if (p.status !== "persisted") throw new Error("not persisted");
      await expect(
        rc.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW }),
      ).rejects.toThrow(/nothing to review/);
      expect(
        db(
          `select count(*) from visibility.assessments where prospect_id='${p.prospectId}'`,
        ),
      ).toBe("0");
    });

    it("KNOWN GAP, pinned: the database lets a line manager approve their own outreach", async () => {
      // PR #115's in-code gate is owner-only; the existing schema is not. The
      // 'manager' role (needed to work prospects) also holds
      // workflows.approval.manage. Fixing that needs a migration and your
      // approval; this test fails the day it is fixed, so it cannot be forgotten.
      const lead = prospect({ id: "syn-7", name: "Synthetic Barber Seven" });
      const p = await rc.persistDiscovered(HLD_LEAD, lead, "wny_barbers");
      if (p.status !== "persisted") throw new Error("not persisted");
      const a = await rc.sendToReview(HLD_LEAD, p.prospectId, lead, { now: NOW });
      const d = await rc.draftProposal(HLD_LEAD, p.prospectId, a.review, HLD_PRICES);
      await expect(
        rc.decide(HLD_LEAD, d.approvalInstanceId!, "approved"),
      ).resolves.toBeUndefined();
    });
  },
);

describe("Revenue Center persistence suite", () => {
  it(
    ENV
      ? "is running against a local database"
      : "was SKIPPED: set HLBOS_LOCAL_PG to run it",
    () => {
      expect(true).toBe(true);
    },
  );
});
