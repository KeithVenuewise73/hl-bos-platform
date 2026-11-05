// Persistence and security tests for the Revenue Center against a REAL schema
// with RLS and permission checks live, plus the PROPOSED migration
// supabase/proposed/revenue-center/revenue_center_controls.sql.
//
//   HLBOS_TEST_BASE=main (default)        the 54 migrations on main
//   HLBOS_TEST_BASE=production-equivalent production's 111 recovered migrations
//                                         (scripts/local-test/build-prod-equivalent.sh)
//
// Synthetic records only (mock discovery, example.test addresses). The only
// delivery is the seeded mock provider. Nothing is sent.
// Runs when HLBOS_LOCAL_PG=<socket-dir-or-localhost>:<port>; otherwise skipped.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { psql, psqlRpc, type LocalPg } from "./local-pg.ts";
import {
  CORE_INDUSTRIES,
  INDUSTRIES,
  OFFERS,
  REVENUE_CENTER_CAPTURED_KINDS,
  RevenueCenter,
  backfillCampaign,
  buildInquiry,
  connectorReadiness,
  contentSha256,
  fromHscsAssessmentRequest,
  industry,
  lineDashboard,
  mockDiscovery,
  submitInquiry,
  type InquiryInput,
  type Principal,
  type PriceBook,
  type ReviewPayload,
} from "./index.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const BASE =
  process.env["HLBOS_TEST_BASE"] === "production-equivalent"
    ? "production-equivalent"
    : "main";
const ROOT = path.resolve(import.meta.dirname, "../../..");

const OWNER = "00000000-0000-4000-8000-00000000a001";
const HLD_MGR = "00000000-0000-4000-8000-00000000a002";
const OUTSIDER = "00000000-0000-4000-8000-00000000a003";
const HSCS_MGR = "00000000-0000-4000-8000-00000000a004";
const CO_OWNER = "00000000-0000-4000-8000-00000000a005";
const PLATFORM = "00000000-0000-4000-8000-00000000a006";
const HLD_WEB = "00000000-0000-4000-8000-00000000a007";
const HSCS_WEB = "00000000-0000-4000-8000-00000000a008";
const TENANTS = {
  hld: "00000000-0000-4000-8000-0000000000d1",
  hscs: "00000000-0000-4000-8000-0000000000d2",
};
const NOW = new Date("2026-11-05T12:00:00.000Z");
/** SYNTHETIC test prices so proposals can be complete. Not HLG's prices. */
const priceBook = (line: "hld" | "hscs"): PriceBook => ({
  line,
  oneTimeCents: Object.fromEntries(
    OFFERS.filter((o) => o.line === line).map((o, i) => [
      o.key,
      o.kind === "recurring" ? 0 : 10_000 * (i + 1),
    ]),
  ),
  monthlyCents: Object.fromEntries(
    OFFERS.filter((o) => o.line === line).map((o) => [
      o.key,
      o.kind === "recurring" ? 4_900 : 0,
    ]),
  ),
  approvedBy: "synthetic test",
  approvedAt: NOW.toISOString(),
});
const OWNER_P: Principal = { id: OWNER, role: "owner", lines: [] };
const DEV_SETTINGS = {
  p_environment: "development",
  p_allow_synthetic: true,
  p_allow_mock_delivery: true,
  p_allow_paid_discovery: true,
  p_allow_auto_notifications: true,
  p_allow_outbound_delivery: false,
};
const PILOT_SETTINGS = {
  p_environment: "pilot",
  p_allow_synthetic: false,
  p_allow_mock_delivery: false,
  p_allow_paid_discovery: false,
  p_allow_auto_notifications: false,
  p_allow_outbound_delivery: false,
};
const VARS = {
  business: "Synthetic",
  contact: "Owner",
  link: "https://example.test/p",
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
  `Revenue Center in HL-BOS — isolated database (${BASE} schema)`,
  () => {
    const pg = pgFromEnv(ENV ?? "/tmp:0");
    const rpc = psqlRpc(pg);
    const db = (sql: string) => psql(pg, sql).trim();
    const rc = new RevenueCenter(rpc, TENANTS);
    const mock = mockDiscovery(() => NOW);
    const s: Record<string, string> = {};
    const profilesOf = (industryKey: string) =>
      rpc.rows<{ prospect_id: string; status: string }>(
        HLD_MGR,
        "revenue.prospect_profiles",
        { industry_key: industryKey },
      );

    beforeAll(async () => {
      psql(
        pg,
        `drop database if exists ${pg.database};\ncreate database ${pg.database};`,
        "postgres",
      );
      if (BASE === "production-equivalent") {
        execFileSync(
          "bash",
          [path.join(ROOT, "scripts/local-test/build-prod-equivalent.sh"), pg.database],
          {
            env: { ...process.env, PGHOST: pg.host, PGPORT: pg.port, PGUSER: pg.user },
            stdio: "pipe",
          },
        );
      } else {
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
      }
      psql(
        pg,
        readFileSync(
          path.join(
            ROOT,
            "supabase/proposed/revenue-center/revenue_center_controls.sql",
          ),
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
      // Platform owner: which tenant is which business, who approves, where notifications go.
      await rpc.call(PLATFORM, "revenue.set_business_line", {
        p_tenant: TENANTS.hld,
        p_line: "hld",
        p_notify: "owner@hlg.test",
      });
      await rpc.call(PLATFORM, "revenue.set_business_line", {
        p_tenant: TENANTS.hscs,
        p_line: "hscs",
        p_notify: "owner@hlg.test",
      });
      // This isolated database is a DEVELOPMENT environment: synthetic data and
      // mock delivery allowed. The migration's default is the pilot posture
      // (everything off); that is tested below.
      await rpc.call(PLATFORM, "revenue.set_release_settings", DEV_SETTINGS);
      await rpc.call(PLATFORM, "revenue.designate_approver", {
        p_tenant: TENANTS.hld,
        p_user: OWNER,
      });
      await rpc.call(PLATFORM, "revenue.designate_approver", {
        p_tenant: TENANTS.hscs,
        p_user: OWNER,
      });
      // Managers draft campaigns; the owner approves them.
      const campaigns = [
        ["hld", "hld_salons_wny", "salon"],
        ["hld", "hld_landscaping_wny", "landscaping"],
        ["hld", "hld_dental_rochester", "dental"],
        ["hscs", "hscs_transport_wny", "transportation"],
        ["hscs", "hscs_moving_wny", "moving"],
      ] as const;
      for (const [line, key, ind] of campaigns) {
        await rc.upsertCampaign(line === "hld" ? HLD_MGR : HSCS_MGR, line, {
          key,
          industryKey: ind,
          name: `${ind} (synthetic)`,
          marketLabel: key.endsWith("rochester") ? "Rochester, NY" : "Buffalo, NY",
          radiusMiles: 25,
          targetActive: 3,
        });
        await rc.setCampaignStatus(OWNER, line, key, "approved");
      }
    }, 300_000);

    // ---- configuration and authority ---------------------------------------
    it("registry: the database's industries equal the code's", () => {
      const rows = db(
        `select string_agg(key||'/'||line||'/'||default_target, ',' order by key) from revenue.industries`,
      );
      expect(rows).toBe(
        INDUSTRIES.map((i) => `${i.key}/${i.line}/${i.targetActive}`)
          .sort()
          .join(","),
      );
    });

    it("only the platform owner assigns lines and approvers; only the designated owner approves campaigns", async () => {
      await expect(
        rpc.call(HLD_MGR, "revenue.designate_approver", {
          p_tenant: TENANTS.hld,
          p_user: HLD_MGR,
        }),
      ).rejects.toThrow(/platform owner/);
      await expect(
        rpc.call(OWNER, "revenue.set_business_line", {
          p_tenant: TENANTS.hld,
          p_line: "hscs",
        }),
      ).rejects.toThrow(/platform owner/);
      await rc.upsertCampaign(HLD_MGR, "hld", {
        key: "hld_unapproved",
        industryKey: "barbershop",
        name: "x",
        marketLabel: "Erie, PA",
        radiusMiles: 10,
      });
      await expect(
        rc.setCampaignStatus(HLD_MGR, "hld", "hld_unapproved", "approved"),
      ).rejects.toThrow(/designated owner/);
      await expect(
        rc.setCampaignStatus(CO_OWNER, "hld", "hld_unapproved", "approved"),
      ).rejects.toThrow(/designated owner/);
    });

    it("geography is per campaign, not hard-coded", () => {
      expect(
        db(
          `select string_agg(distinct market_label, '|' order by market_label) from revenue.campaigns`,
        ),
      ).toBe("Buffalo, NY|Erie, PA|Rochester, NY");
    });

    // ---- 1-2: discovery, storage, routing ----------------------------------
    it("DEMO 1–2 — backfill discovers (mock), stores, routes and records the run", async () => {
      const r = await backfillCampaign(rc, HLD_MGR, "hld", "hld_salons_wny", mock);
      expect(r.added).toHaveLength(3);
      expect(
        db(
          `select status||'/'||source||'/'||added||'/'||paid_requests from revenue.discovery_runs where id='${r.runId}'`,
        ),
      ).toBe("finished/mock/3/0");
      expect(
        db(
          `select count(*) from revenue.prospect_profiles where industry_key='salon' and tenant_id='${TENANTS.hld}' and is_synthetic and discovery_run_id='${r.runId}'`,
        ),
      ).toBe("3");
      const t = await backfillCampaign(
        rc,
        HSCS_MGR,
        "hscs",
        "hscs_transport_wny",
        mock,
      );
      expect(t.added).toHaveLength(3);
      expect(
        db(
          `select count(*) from revenue.prospect_profiles where industry_key='transportation' and tenant_id='${TENANTS.hscs}'`,
        ),
      ).toBe("3");
      s["salon"] = r.added[0]!;
      s["carrier"] = t.added[0]!;
    });

    it("DEMO 2b — the database refuses the wrong business, an unknown industry, and an unapproved campaign", async () => {
      const [lead] = await mock.discover(
        industry("moving")!,
        { label: "Buffalo, NY", zip: undefined, radiusMiles: 10 },
        "",
        1,
        90,
      );
      const base = {
        p_business: lead!.name,
        p_dedupe: "x:1",
        p_source: "mock",
        p_is_synthetic: true,
      };
      await expect(
        rpc.call(OWNER, "revenue.register_prospect", {
          ...base,
          p_tenant: TENANTS.hld,
          p_industry: "moving",
        }),
      ).rejects.toThrow(/belongs to HSCS/);
      await expect(
        rpc.call(OWNER, "revenue.register_prospect", {
          ...base,
          p_tenant: TENANTS.hld,
          p_industry: "bakery",
        }),
      ).rejects.toThrow(/unknown industry/);
      await expect(
        rpc.call(OWNER, "revenue.register_prospect", {
          ...base,
          p_tenant: TENANTS.hld,
          p_industry: "barbershop",
          p_campaign: "hld_unapproved",
        }),
      ).rejects.toThrow(/not an approved/);
      const mismatch = await rc.persistDiscovered(OWNER, lead!, {
        industryKey: "moving",
        campaignKey: "hld_salons_wny",
        source: "mock",
        isSynthetic: true,
      });
      expect(mismatch.status).toBe("needs_review");
    });

    // ---- 3-5: review, evidence, recommendations ----------------------------
    it("DEMO 3 — Send to Review is atomic and idempotent", async () => {
      const first = await rc.sendToReview(HLD_MGR, s["salon"]!);
      const [x, y] = await Promise.all([
        rc.sendToReview(HLD_MGR, s["salon"]!),
        rc.sendToReview(HLD_MGR, s["salon"]!),
      ]);
      expect([x.assessmentId, y.assessmentId]).toEqual([
        first.assessmentId,
        first.assessmentId,
      ]);
      expect(
        db(
          `select count(*) from visibility.assessments where prospect_id='${s["salon"]}'`,
        ),
      ).toBe("1");
      s["assessment"] = first.assessmentId;
      const bad: ReviewPayload = {
        scores: [{ category: "no_such_category", score: 3, note: "" }],
        evidence: [],
        recommendations: [],
      };
      const [, second] = await profilesOf("salon");
      await expect(
        rpc.call(HLD_MGR, "revenue.send_to_review", {
          p_prospect: second!.prospect_id,
          p_request_key: "k",
          p_payload: bad,
        }),
      ).rejects.toThrow(/unknown category/);
      expect(
        db(
          `select count(*) from visibility.assessments where prospect_id='${second!.prospect_id}'`,
        ),
      ).toBe("0");
    });

    it("DEMO 4–5 — findings stored by kind; recommendations visible; assumptions can never pass as facts", async () => {
      const a = s["assessment"]!;
      expect(
        db(
          `select count(*) from revenue.assessment_evidence where assessment_id='${a}' and kind='observed' and source is not null and observed_at is not null`,
        ),
      ).not.toBe("0");
      expect(
        db(
          `select count(*) from revenue.assessment_evidence where assessment_id='${a}' and kind='assumption' and confidence is null and how_to_verify is not null`,
        ),
      ).not.toBe("0");
      expect(
        db(
          `select count(*) from revenue.assessment_evidence where assessment_id='${a}' and kind='estimate' and recommendation_id is not null`,
        ),
      ).not.toBe("0");
      const recs = await rpc.rows<{ kind: string; detail: string }>(
        HLD_MGR,
        "visibility.recommendations",
        { assessment_id: a },
      );
      expect(
        recs.some(
          (r) => r.kind === "service" && r.detail.startsWith("ESTIMATED OPPORTUNITY"),
        ),
      ).toBe(true);
      const [, , third] = await profilesOf("salon");
      const onAssumption: ReviewPayload = {
        scores: [{ category: "website", score: 1, note: "" }],
        evidence: [
          {
            key: "a1",
            kind: "assumption",
            label: "A",
            statement: "Busy weekends",
            source: null,
            source_ref: null,
            observed_at: null,
            confidence: null,
            how_to_verify: "Ask",
            rationale: null,
            offer_key: null,
            basis: [],
          },
          {
            key: "e1",
            kind: "estimate",
            label: "E",
            statement: "More bookings",
            source: null,
            source_ref: null,
            observed_at: null,
            confidence: null,
            how_to_verify: null,
            rationale: "Because busy",
            offer_key: "hld.booking",
            basis: ["a1"],
          },
        ],
        recommendations: [],
      };
      await expect(
        rpc.call(HLD_MGR, "revenue.send_to_review", {
          p_prospect: third!.prospect_id,
          p_request_key: "x",
          p_payload: onAssumption,
        }),
      ).rejects.toThrow(/not an observed, verified or customer-provided fact/);
      await expect(
        rpc.call(HLD_MGR, "revenue.content_sha256", { p_title: "a", p_body: "b" }),
      ).resolves.toBe(contentSha256("a", "b"));
    });

    // ---- 6-9: proposal, approval, consent, outreach -------------------------
    it("DEMO 6 — a proposal is drafted with configured prices; the database refuses an unpriced one", async () => {
      const unpriced = await rc.draftProposal(HLD_MGR, s["salon"]!);
      expect(unpriced.approvalInstanceId).toBeUndefined();
      await expect(
        rpc.call(HLD_MGR, "revenue.submit_proposal", { p_content: unpriced.contentId }),
      ).rejects.toThrow(/unpriced or blocked proposal/);
      const d = await rc.draftProposal(HLD_MGR, s["salon"]!, priceBook("hld"));
      expect(d.proposal.status).toBe("ready_for_approval");
      expect(
        db(`select status from visibility.content_assets where id='${d.contentId}'`),
      ).toBe("pending_approval");
      expect(
        db(
          `select prospect_id from revenue.proposal_links where content_id='${d.contentId}'`,
        ),
      ).toBe(s["salon"]);
      s["content"] = d.contentId;
      s["proposalApproval"] = d.approvalInstanceId!;
    });

    it("DEMO 7 — managers cannot approve; the owner approves the exact version; an edit voids it", async () => {
      const pending = await rc.pendingApproval(HLD_MGR, s["proposalApproval"]!);
      for (const who of [HLD_MGR, CO_OWNER, OUTSIDER, HSCS_MGR])
        await expect(rc.decide(who, pending, "approved")).rejects.toThrow();
      const [task] = await rpc.rows<{ id: string }>(HLD_MGR, "workflows.tasks", {
        instance_id: s["proposalApproval"]!,
      });
      await expect(
        rpc.call(HLD_MGR, "workflows.decide", {
          p_task: task!.id,
          p_decision: "approved",
        }),
      ).rejects.toThrow(/designated owner/);
      await expect(
        rc.decide(OWNER, { ...pending, sha256: "0".repeat(64) }, "approved"),
      ).rejects.toThrow(/changed since you viewed it/);
      await rc.decide(OWNER, pending, "approved");
      const d2 = await rc.draftProposal(HLD_MGR, s["salon"]!, priceBook("hld"));
      await rc.decide(
        OWNER,
        await rc.pendingApproval(OWNER, d2.approvalInstanceId!),
        "approved",
      );
      db(
        `update visibility.content_assets set body = body || ' ' where id='${d2.contentId}'`,
      );
      expect(
        db(
          `select status from workflows.instances where id='${d2.approvalInstanceId}'`,
        ),
      ).toBe("canceled");
      await expect(
        rc.requestOutreach(HLD_MGR, d2.contentId, "x@example.test", VARS),
      ).rejects.toThrow(/not been approved/);
    });

    it("DEMO 8–9 — consent checked; outreach queued and held; delivery mocked, approved messages only", async () => {
      const to = "owner@synthetic-salon.example.test";
      await expect(
        rc.requestOutreach(HLD_MGR, s["content"]!, to, VARS),
      ).rejects.toThrow(/requires prior consent/);
      await rpc.call(OWNER, "comms.set_consent", {
        p_tenant: TENANTS.hld,
        p_channel: "email",
        p_contact: to,
        p_status: "granted",
        p_source: "synthetic",
      });
      const o = await rc.requestOutreach(HLD_MGR, s["content"]!, to, VARS);
      expect(db(`select status from comms.messages where id='${o.messageId}'`)).toBe(
        "pending",
      );
      await expect(
        rc.decide(
          HLD_MGR,
          await rc.pendingApproval(HLD_MGR, o.approvalInstanceId),
          "approved",
        ),
      ).rejects.toThrow(/designated owner/);
      await expect(
        rpc.call(PLATFORM, "revenue.mock_deliver", { p_message: o.messageId }),
      ).rejects.toThrow(/cannot be recorded as delivered/);
      await rc.decide(
        OWNER,
        await rc.pendingApproval(OWNER, o.approvalInstanceId),
        "approved",
      );
      await rc.releaseOutreach(HLD_MGR, o.messageId);
      await rpc.call(PLATFORM, "revenue.mock_deliver", { p_message: o.messageId });
      expect(
        db(
          `select status||'|'||provider_key from comms.messages where id='${o.messageId}'`,
        ),
      ).toBe("delivered|mock_email");
      expect(
        db(
          `select count(*) from comms.messages where status in ('sent','delivered') and provider_key not like 'mock%'`,
        ),
      ).toBe("0");
      s["message"] = o.messageId;
    });

    it("customer response: unsubscribe suppresses the address and revokes consent; interest qualifies", async () => {
      await rc.recordResponse(
        HLD_MGR,
        s["salon"]!,
        "unsubscribed",
        "Replied STOP",
        s["message"],
      );
      expect(
        db(
          `select status from comms.consent where contact='owner@synthetic-salon.example.test'`,
        ),
      ).toBe("revoked");
      // A NEW approved proposal to the same address (any capitals) is refused.
      const d3 = await rc.draftProposal(HLD_MGR, s["salon"]!, priceBook("hld"));
      await rc.decide(
        OWNER,
        await rc.pendingApproval(OWNER, d3.approvalInstanceId!),
        "approved",
      );
      await expect(
        rc.requestOutreach(
          HLD_MGR,
          d3.contentId,
          "Owner@Synthetic-Salon.example.test",
          VARS,
        ),
      ).rejects.toThrow(/opted out/);
      expect(
        db(
          `select count(*) from comms.messages where to_contact='owner@synthetic-salon.example.test' and status='suppressed'`,
        ),
      ).toBe("1");
      expect(
        db(
          `select count(*) from comms.suppression where contact='owner@synthetic-salon.example.test'`,
        ),
      ).toBe("1");
      const [, second] = await profilesOf("salon");
      await rc.recordResponse(HLD_MGR, second!.prospect_id, "interested");
      expect(
        db(
          `select status from revenue.prospect_profiles where prospect_id='${second!.prospect_id}'`,
        ),
      ).toBe("qualified");
    });

    // ---- 10: dashboard ------------------------------------------------------
    it("DEMO 10 — dashboard and industry summary count the stored records; synthetic is labelled", async () => {
      const [sum] = (await rc.industrySummary(OWNER)).filter(
        (r) => r.industry_key === "salon",
      );
      expect(sum).toMatchObject({
        active: 2,
        qualified: 1,
        reviewed: 1,
        with_proposal: 1,
        outreach: 1,
        synthetic: 3,
        live_discovered: 0,
      });
      expect(Number(sum!.review_queue)).toBe(2);
      const events = await rc.loadEvents(OWNER);
      const input = {
        events,
        expenses: [],
        connectors: connectorReadiness([], NOW),
        now: NOW,
        capturedKinds: REVENUE_CENTER_CAPTURED_KINDS,
      };
      const dev = lineDashboard(OWNER_P, "hld", { ...input, includeSynthetic: true });
      const m = (k: string) => dev.metrics.find((x) => x.key === k)!;
      expect(m("discovered").value).toBe(
        Number(
          db(
            `select count(*) from revenue.prospect_profiles where tenant_id='${TENANTS.hld}' and discovery_source <> 'inbound_inquiry'`,
          ),
        ),
      );
      expect(m("outreach").value).toBe(1);
      expect(m("responses").value).toBe(2);
      expect(m("discovered").status).toBe("synthetic");
      expect(m("mrr").status).toBe("not_connected");
      expect(
        lineDashboard(OWNER_P, "hld", input).metrics.find(
          (x) => x.key === "discovered",
        )!.value,
      ).toBeNull();
    });

    // ---- 11: rejection, backfill, duplicates ------------------------------
    it("DEMO 11 — a rejected prospect is replaced by backfill; the same business under another spelling is not re-added", async () => {
      const first = await backfillCampaign(
        rc,
        HLD_MGR,
        "hld",
        "hld_landscaping_wny",
        mock,
      );
      expect(first.added).toHaveLength(3);
      await rc.setStatus(HLD_MGR, first.added[0]!, "rejected", "Synthetic: not a fit");
      const second = await backfillCampaign(
        rc,
        HLD_MGR,
        "hld",
        "hld_landscaping_wny",
        mock,
        { pageSize: 3 },
      );
      expect(second.plan.deficit).toBe(1);
      expect(second.added).toHaveLength(1);
      expect(second.duplicatesSkipped).toBe(3);
      expect(
        (await backfillCampaign(rc, HLD_MGR, "hld", "hld_landscaping_wny", mock)).added,
      ).toHaveLength(0);
      expect(
        db(
          `select count(*)||'/'||count(distinct dedupe_key) from revenue.prospect_profiles where industry_key='landscaping'`,
        ),
      ).toBe("4/4");
      const [orig] = await mock.discover(
        industry("landscaping")!,
        { label: "Buffalo, NY", zip: undefined, radiusMiles: 25 },
        "",
        1,
        1,
      );
      const respelled = {
        ...orig!,
        name: `${orig!.name.toUpperCase()}, LLC`,
        dedupeKey: "domain:different.example",
        email: undefined,
        corrections: {},
      };
      const again = await rc.persistDiscovered(HLD_MGR, respelled, {
        industryKey: "landscaping",
        campaignKey: "hld_landscaping_wny",
        source: "mock",
        isSynthetic: true,
      });
      expect(again.status).toBe("duplicate");
    });

    it("discovery spending: no paid discovery without the owner's allowance; the allowance is enforced", async () => {
      const run = (n: number) =>
        rc.beginDiscoveryRun(
          HLD_MGR,
          "hld",
          "hld_dental_rochester",
          "google_places",
          20,
          n,
        );
      await expect(run(1)).rejects.toThrow(/paid discovery limit: 0 of 0/);
      await expect(rc.setDiscoveryLimits(HLD_MGR, "hld", 100, 50)).rejects.toThrow(
        /designated owner/,
      );
      await rc.setDiscoveryLimits(OWNER, "hld", 2, 50);
      const id = await run(2);
      await expect(run(1)).rejects.toThrow(/2 of 2 requests used/);
      await rc.finishDiscoveryRun(HLD_MGR, id, {
        paidRequests: 1,
        estCostCents: 4,
        candidates: 0,
        added: 0,
        duplicates: 0,
        needsReview: 0,
      });
      await expect(run(1)).resolves.toBeTruthy(); // the unspent reservation is released
      await expect(
        rc.beginDiscoveryRun(HLD_MGR, "hld", "hld_dental_rochester", "mock", 51, 0),
      ).rejects.toThrow(/at most 50 candidates/);
    });

    it("existing prospects (like production's 50 barbershops) can be adopted, once", async () => {
      const id = await rpc.call<string>(HLD_MGR, "visibility.create_prospect", {
        p_tenant: TENANTS.hld,
        p_business: "Existing Barbershop (synthetic)",
        p_city: "Buffalo",
      });
      await rc.adoptProspect(
        HLD_MGR,
        id,
        "barbershop",
        ["name:existingbarber|buffalo"],
        { isSynthetic: true },
      );
      expect(
        db(
          `select discovery_source||'/'||is_synthetic from revenue.prospect_profiles where prospect_id='${id}'`,
        ),
      ).toBe("import/true");
      await expect(
        rc.adoptProspect(HLD_MGR, id, "barbershop", ["name:other|buffalo"], {
          isSynthetic: true,
        }),
      ).rejects.toThrow(/already in the Revenue Center/);
      await expect(
        rc.adoptProspect(HLD_MGR, id, "moving", ["x"], { isSynthetic: true }),
      ).rejects.toThrow();
    });

    // ---- website inquiries ----------------------------------------------------
    const inq = (over: Partial<InquiryInput>): InquiryInput => ({
      site: "hld",
      contactName: "Pat Example",
      email: "pat@example.test",
      company: "Example Dental",
      industryText: "Dental practice",
      message: "We need a new website.",
      contactConsent: true,
      fillTimeMs: 15_000,
      submittedAt: NOW.toISOString(),
      isSynthetic: true,
      ...over,
    });

    it("HLD inquiry → website service account → HLD prospect, owner notified, no marketing consent recorded", async () => {
      const r = await submitInquiry(
        rpc,
        HLD_WEB,
        TENANTS.hld,
        buildInquiry(inq({ submissionId: "hld-1" })),
      );
      expect(r.status).toBe("routed");
      expect(
        db(
          `select tenant_id||'|'||industry_key||'|'||discovery_source from revenue.prospect_profiles where prospect_id='${r.prospect_id}'`,
        ),
      ).toBe(`${TENANTS.hld}|dental|inbound_inquiry`);
      expect(
        db(`select count(*) from comms.consent where contact='pat@example.test'`),
      ).toBe("0");
      expect(
        db(
          `select m.status||'|'||m.template_key||'|'||m.to_contact from revenue.inquiries i join comms.messages m on m.id=i.notification_message_id where i.id='${r.inquiry_id}'`,
        ),
      ).toBe("queued|inquiry_received|owner@hlg.test");
      expect(
        await submitInquiry(
          rpc,
          HLD_WEB,
          TENANTS.hld,
          buildInquiry(inq({ submissionId: "hld-1" })),
        ),
      ).toMatchObject({ inquiry_id: r.inquiry_id, replayed: true });
      expect(
        await submitInquiry(
          rpc,
          HLD_WEB,
          TENANTS.hld,
          buildInquiry(inq({ submissionId: "hld-2", company: "Example Dental Group" })),
        ),
      ).toMatchObject({
        status: "duplicate",
        prospect_id: r.prospect_id,
      });
      // An inquiry has no website scan: Send to Review refuses plainly instead of inventing evidence.
      await expect(rc.sendToReview(HLD_MGR, r.prospect_id!)).rejects.toThrow(
        /No website scan is stored/,
      );
      expect(await rpc.rows(HLD_WEB, "visibility.prospects", {})).toEqual([]);
      expect(await rpc.rows(HLD_WEB, "revenue.inquiries", {})).toEqual([]);
      await expect(
        submitInquiry(
          rpc,
          HLD_WEB,
          TENANTS.hscs,
          buildInquiry(inq({ site: "hscs", submissionId: "x" })),
        ),
      ).rejects.toThrow(/insufficient privilege/);
    });

    it("HSCS inquiry with marketing opt-in → HSCS prospect, consent recorded with its evidence", async () => {
      const payload = buildInquiry(
        fromHscsAssessmentRequest(
          {
            name: "Sam Example",
            company: "Example Freight",
            email: "sam@example.test",
            business_type: "Freight carrier",
            routes_vehicles: "12 trucks",
            contact_consent: true,
            marketing_consent: true,
            consent_text_version: "v1-draft",
          },
          {
            submittedAt: NOW.toISOString(),
            isSynthetic: true,
            submissionId: "hscs-1",
            fillTimeMs: 20_000,
          },
        ),
      );
      const r = await submitInquiry(rpc, HSCS_WEB, TENANTS.hscs, payload);
      expect(r.status).toBe("routed");
      expect(
        db(
          `select tenant_id||'|'||industry_key from revenue.prospect_profiles where prospect_id='${r.prospect_id}'`,
        ),
      ).toBe(`${TENANTS.hscs}|transportation`);
      expect(
        db(
          `select status||'|'||source from comms.consent where contact='sam@example.test'`,
        ),
      ).toBe("granted|website form, consent text v1-draft");
      expect(
        db(`select message from revenue.inquiries where id='${r.inquiry_id}'`),
      ).toContain("[customer-provided] routes_and_vehicles: 12 trucks");
    });

    it("an ambiguous inquiry waits for a person, then goes where the person decides; spam goes nowhere", async () => {
      const before = db(`select count(*) from visibility.prospects`);
      const amb = await submitInquiry(
        rpc,
        HLD_WEB,
        TENANTS.hld,
        buildInquiry(
          inq({
            submissionId: "amb-1",
            email: "lee@example.test",
            company: "Example Trucking",
            industryText: "Trucking",
          }),
        ),
      );
      expect(amb).toMatchObject({ status: "needs_review", prospect_id: null });
      const spam = await submitInquiry(
        rpc,
        HLD_WEB,
        TENANTS.hld,
        buildInquiry(
          inq({ submissionId: "spam-1", email: "s@example.test", honeypot: "bot" }),
        ),
      );
      expect(spam.status).toBe("spam");
      expect(db(`select count(*) from visibility.prospects`)).toBe(before);
      await expect(
        rc.resolveInquiry(HLD_MGR, amb.inquiry_id, "hscs", "transportation"),
      ).rejects.toThrow(/access to both businesses/);
      const pid = await rc.resolveInquiry(
        OWNER,
        amb.inquiry_id,
        "hscs",
        "transportation",
      );
      expect(db(`select tenant_id from visibility.prospects where id='${pid}'`)).toBe(
        TENANTS.hscs,
      );
    });

    // ---- referrals ----------------------------------------------------------
    it("cross-business referral shares a name, not the record; only the receiving business accepts", async () => {
      const ref = await rc.referProspect(
        HLD_MGR,
        s["salon"]!,
        "hscs",
        "They also run deliveries",
      );
      expect(
        db(
          `select string_agg(k, ',' order by k) from revenue.referrals r, jsonb_object_keys(r.shared) k where r.id='${ref}'`,
        ),
      ).toBe("business_name,city,website_url");
      expect(await rpc.rows(HSCS_MGR, "revenue.referrals", { id: ref })).toHaveLength(
        1,
      );
      expect(
        await rpc.rows(HSCS_MGR, "visibility.prospects", { id: s["salon"]! }),
      ).toEqual([]);
      expect(
        await rpc.rows(HSCS_MGR, "revenue.assessment_evidence", {
          prospect_id: s["salon"]!,
        }),
      ).toEqual([]);
      await expect(
        rc.decideReferral(HLD_MGR, ref, true, "general_hscs"),
      ).rejects.toThrow(/receiving business/);
      const pid = await rc.decideReferral(HSCS_MGR, ref, true, "general_hscs");
      expect(
        db(
          `select tenant_id||'|'||discovery_source from revenue.prospect_profiles where prospect_id='${pid}'`,
        ),
      ).toBe(`${TENANTS.hscs}|referral`);
    });

    // ---- 12: isolation -------------------------------------------------------
    it("DEMO 12 — another business's records are invisible and unwritable", async () => {
      const carrier = s["carrier"]!;
      expect(await rpc.rows(HLD_MGR, "visibility.prospects", { id: carrier })).toEqual(
        [],
      );
      expect(
        await rpc.rows(HLD_MGR, "revenue.prospect_profiles", {
          tenant_id: TENANTS.hscs,
        }),
      ).toEqual([]);
      expect(
        await rpc.rows(HLD_MGR, "revenue.inquiries", { tenant_id: TENANTS.hscs }),
      ).toEqual([]);
      expect(
        await rpc.rows(HLD_MGR, "revenue.industry_summary", {
          tenant_id: TENANTS.hscs,
        }),
      ).toEqual([]);
      expect(
        await rpc.rows(HSCS_MGR, "revenue.outreach_messages", {
          tenant_id: TENANTS.hld,
        }),
      ).toEqual([]);
      await expect(rc.sendToReview(HLD_MGR, carrier)).rejects.toThrow(
        /not visible to you/,
      );
      await expect(
        rpc.call(HLD_MGR, "revenue.send_to_review", {
          p_prospect: carrier,
          p_request_key: "x",
          p_payload: {},
        }),
      ).rejects.toThrow(/insufficient privilege/);
      await expect(
        rpc.call(HLD_MGR, "revenue.approval_detail", {
          p_instance: s["proposalApproval"]!,
        }),
      ).resolves.toBeTruthy();
      await expect(
        rpc.call(HSCS_MGR, "revenue.approval_detail", {
          p_instance: s["proposalApproval"]!,
        }),
      ).rejects.toThrow(/not found/);
      for (const t of [
        "visibility.prospects",
        "revenue.prospect_profiles",
        "revenue.inquiries",
        "revenue.referrals",
        "revenue.industry_summary",
        "revenue.outreach_messages",
        "revenue.open_approvals",
      ])
        expect(await rpc.rows(OUTSIDER, t, {})).toEqual([]);
    });

    it("grant posture: nothing in revenue is reachable without signing in; no direct table writes; no definer views", () => {
      const q = (sql: string) => db(sql);
      expect(
        q(
          `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='revenue' and has_function_privilege('anon', p.oid, 'execute')`,
        ),
      ).toBe("0");
      expect(
        q(
          `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='revenue' and has_table_privilege('anon', c.oid, 'select')`,
        ),
      ).toBe("0");
      expect(q(`select has_schema_privilege('anon', 'revenue', 'usage')`)).toBe("f");
      expect(
        q(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='revenue' and c.relkind='r'
      and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))`),
      ).toBe("0");
      expect(
        q(
          `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='revenue' and c.relkind='v' and not coalesce('security_invoker=true' = any(c.reloptions), false)`,
        ),
      ).toBe("0");
      expect(
        q(
          `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='revenue' and p.prosecdef and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)`,
        ),
      ).toBe("0");
    });

    it("PILOT POSTURE — no synthetic records, no mock delivery, no paid discovery, no automatic notifications, no real delivery", async () => {
      expect(
        db(
          `select environment||'/'||allow_synthetic_records||'/'||allow_mock_delivery from revenue.release_settings`,
        ),
      ).toBe("development/true/true");
      await expect(
        rpc.call(OWNER, "revenue.set_release_settings", PILOT_SETTINGS),
      ).rejects.toThrow(/platform owner/);
      await expect(
        rpc.call(PLATFORM, "revenue.set_release_settings", {
          ...PILOT_SETTINGS,
          p_allow_mock_delivery: true,
        }),
      ).rejects.toThrow(/release_settings_dev_only/);
      await expect(
        rpc.call(PLATFORM, "revenue.set_release_settings", {
          ...PILOT_SETTINGS,
          p_environment: "production",
          p_allow_synthetic: true,
        }),
      ).rejects.toThrow(/release_settings_dev_only/);
      await rpc.call(PLATFORM, "revenue.set_release_settings", PILOT_SETTINGS);
      try {
        await expect(
          backfillCampaign(rc, HLD_MGR, "hld", "hld_dental_rochester", mock),
        ).rejects.toThrow(/not allowed in this environment/);
        await expect(
          submitInquiry(
            rpc,
            HLD_WEB,
            TENANTS.hld,
            buildInquiry(inq({ submissionId: "pilot-1", email: "p1@example.test" })),
          ),
        ).rejects.toThrow(/not allowed in this environment/);
        const real = await submitInquiry(
          rpc,
          HLD_WEB,
          TENANTS.hld,
          buildInquiry(
            inq({
              submissionId: "pilot-2",
              email: "real-visitor@example.test",
              isSynthetic: false,
            }),
          ),
        );
        expect(
          db(
            `select coalesce(notification_message_id::text,'none') from revenue.inquiries where id='${real.inquiry_id}'`,
          ),
        ).toBe("none");
        await expect(
          rc.beginDiscoveryRun(
            HLD_MGR,
            "hld",
            "hld_dental_rochester",
            "google_places",
            20,
            1,
          ),
        ).rejects.toThrow(/paid discovery is disabled/);
        const anyMsg = db(`select id from comms.messages limit 1`);
        await expect(
          rpc.call(PLATFORM, "revenue.mock_deliver", { p_message: anyMsg }),
        ).rejects.toThrow(/mock delivery is disabled/);
        const rcMsg = db(
          `select id from comms.messages where source_module='revenue_center' limit 1`,
        );
        db(
          `update comms.messages set provider_key='email', status='approved' where id='${rcMsg}'`,
        );
        await expect(
          rpc.call(PLATFORM, "comms.record_delivery", {
            p_message: rcMsg,
            p_status: "sent",
          }),
        ).rejects.toThrow(/outbound Revenue Center delivery is disabled/);
        // the dashboard's live figures exclude every synthetic record
        const live = lineDashboard(OWNER_P, "hld", {
          events: await rc.loadEvents(OWNER),
          expenses: [],
          connectors: connectorReadiness([], NOW),
          now: NOW,
          capturedKinds: REVENUE_CENTER_CAPTURED_KINDS,
        });
        expect(live.metrics.find((m) => m.key === "inbound")!.value).toBe(1); // the one real inquiry, nothing synthetic
        expect(live.demoRecordsExcluded).toBeGreaterThan(0);
      } finally {
        await rpc.call(PLATFORM, "revenue.set_release_settings", DEV_SETTINGS);
      }
    });

    it("every one of the eight industries fits its own business", () => {
      for (const ind of CORE_INDUSTRIES)
        expect(() =>
          db(
            `select revenue.assert_industry_fits('${TENANTS[ind.line]}'::uuid, '${ind.key}'::extensions.citext)`,
          ),
        ).not.toThrow();
    });
  },
);

describe("Revenue Center persistence suite", () => {
  it(
    ENV
      ? `is running against a local database (${BASE})`
      : "was SKIPPED: set HLBOS_LOCAL_PG to run it",
    () => {
      expect(true).toBe(true);
    },
  );
});
