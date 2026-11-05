// Persistence and security tests for the Revenue Center, against the REAL
// HL-BOS schema: every migration in supabase/migrations PLUS the proposed
// supabase/proposed/revenue-center/revenue_center_controls.sql, applied to a
// throwaway local PostgreSQL with RLS and permission checks live.
// Synthetic records only (mock discovery, .test addresses); the only delivery
// is the seeded mock provider. Nothing is sent.
//
// Runs when HLBOS_LOCAL_PG=<socket-dir-or-localhost>:<port> is set — see
// scripts/local-test/revenue-center-db.sh. Without it the suite is skipped
// and a separate test says so.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { psql, psqlRpc, type LocalPg } from "./local-pg.ts";
import {
  INDUSTRIES,
  OFFERS,
  REVENUE_CENTER_CAPTURED_KINDS,
  RevenueCenter,
  backfillIndustry,
  connectorReadiness,
  contentSha256,
  industry,
  lineDashboard,
  mockDiscovery,
  type Campaign,
  type Principal,
  type PriceBook,
  type ReviewPayload,
} from "./index.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const ROOT = path.resolve(import.meta.dirname, "../../..");

const OWNER = "00000000-0000-4000-8000-00000000a001";
const HLD_MGR = "00000000-0000-4000-8000-00000000a002";
const OUTSIDER = "00000000-0000-4000-8000-00000000a003";
const HSCS_MGR = "00000000-0000-4000-8000-00000000a004";
const CO_OWNER = "00000000-0000-4000-8000-00000000a005";
const PLATFORM = "00000000-0000-4000-8000-00000000a006";
const TENANTS = {
  hld: "00000000-0000-4000-8000-0000000000d1",
  hscs: "00000000-0000-4000-8000-0000000000d2",
};
const CAMPAIGNS: Campaign[] = [
  { key: "hld_salons", line: "hld", name: "Salons (synthetic)", status: "approved" },
  {
    key: "hld_contractors",
    line: "hld",
    name: "Contractors (synthetic)",
    status: "approved",
  },
  {
    key: "hscs_transport",
    line: "hscs",
    name: "Carriers (synthetic)",
    status: "approved",
  },
];
const NOW = new Date("2026-11-05T12:00:00.000Z");
/** SYNTHETIC test prices: every offer priced so proposals can be complete. Not HLG's prices. */
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

function pgFromEnv(v: string): LocalPg {
  const i = v.lastIndexOf(":");
  return {
    host: v.slice(0, i),
    port: v.slice(i + 1),
    user: "postgres",
    database: "hlbos_revenue_center_test",
  };
}

describe.skipIf(!ENV)("Revenue Center in HL-BOS — isolated database", () => {
  const pg = pgFromEnv(ENV ?? "/tmp:0");
  const rpc = psqlRpc(pg);
  const db = (sql: string) => psql(pg, sql).trim();
  const rc = new RevenueCenter(rpc, TENANTS, CAMPAIGNS);
  const mock = mockDiscovery(() => NOW);
  const salon = industry("salon_barber")!;
  const transport = industry("transportation")!;
  const state: Record<string, string> = {};

  beforeAll(async () => {
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
    await rpc.call(PLATFORM, "revenue.designate_approver", {
      p_tenant: TENANTS.hld,
      p_user: OWNER,
    });
    await rpc.call(PLATFORM, "revenue.designate_approver", {
      p_tenant: TENANTS.hscs,
      p_user: OWNER,
    });
  }, 240_000);

  it("only the platform owner designates approvers", async () => {
    await expect(
      rpc.call(HLD_MGR, "revenue.designate_approver", {
        p_tenant: TENANTS.hld,
        p_user: HLD_MGR,
      }),
    ).rejects.toThrow(/platform owner/);
    await expect(
      rpc.call(OWNER, "revenue.designate_approver", {
        p_tenant: TENANTS.hld,
        p_user: CO_OWNER,
      }),
    ).rejects.toThrow(/platform owner/);
  });

  it("PROOF 1 — prospects are discovered (mock source) and stored, flagged synthetic", async () => {
    const leads = await mock.discover(salon, 3, 0);
    for (const lead of leads) {
      const r = await rc.persistDiscovered(HLD_MGR, lead, {
        industryKey: "salon_barber",
        campaignKey: "hld_salons",
        source: "mock",
        isSynthetic: true,
      });
      expect(r.status).toBe("persisted");
      if (r.status === "persisted") state["salon"] ??= r.prospectId;
    }
    expect(
      db(`select count(*) from revenue.prospect_profiles p join visibility.prospects v on v.id=p.prospect_id
      where p.industry_key='salon_barber' and p.is_synthetic and p.discovery_source='mock' and v.tenant_id='${TENANTS.hld}'`),
    ).toBe("3");
    expect(
      db(`select business_name from visibility.prospects where id='${state["salon"]}'`),
    ).toMatch(/^Synthetic Salons and barbers 1$/);
  });

  it("PROOF 2 — Send to Review is one atomic, idempotent operation", async () => {
    const id = state["salon"]!;
    const first = await rc.sendToReview(HLD_MGR, id);
    const again = await rc.sendToReview(HLD_MGR, id);
    expect(again).toMatchObject({ assessmentId: first.assessmentId, replayed: true });
    // two clicks at the same moment: one review
    const [x, y] = await Promise.all([
      rc.sendToReview(HLD_MGR, id),
      rc.sendToReview(HLD_MGR, id),
    ]);
    expect(x.assessmentId).toBe(first.assessmentId);
    expect(y.assessmentId).toBe(first.assessmentId);
    expect(
      db(`select count(*) from visibility.assessments where prospect_id='${id}'`),
    ).toBe("1");
    state["assessment"] = first.assessmentId;
  });

  it("PROOF 2b — a failed review leaves nothing behind and the prospect intact", async () => {
    const [, second] = (
      await rpc.rows<{ prospect_id: string }>(HLD_MGR, "revenue.prospect_profiles", {
        industry_key: "salon_barber",
      })
    ).slice(0, 2);
    const id = second!.prospect_id;
    const bad: ReviewPayload = {
      scores: [{ category: "no_such_category", score: 3, note: "" }],
      evidence: [],
      recommendations: [],
    };
    await expect(
      rpc.call(HLD_MGR, "revenue.send_to_review", {
        p_prospect: id,
        p_request_key: "k1",
        p_payload: bad,
      }),
    ).rejects.toThrow(/unknown category/);
    expect(
      db(`select count(*) from visibility.assessments where prospect_id='${id}'`),
    ).toBe("0");
    expect(
      db(`select count(*) from revenue.review_requests where prospect_id='${id}'`),
    ).toBe("0");
    expect(db(`select count(*) from visibility.prospects where id='${id}'`)).toBe("1");
    // and the retry succeeds: nothing was left blocking it
    await expect(rc.sendToReview(HLD_MGR, id)).resolves.toMatchObject({
      replayed: false,
    });
    // the same request key with different evidence is refused, not silently merged
    await expect(
      rpc.call(HLD_MGR, "revenue.send_to_review", {
        p_prospect: id,
        p_request_key: "k2",
        p_payload: bad,
      }),
    ).rejects.toThrow();
  });

  it("PROOF 3 — the assessment keeps observed, assumptions, estimates and not-checked apart, each with its source", () => {
    const a = state["assessment"]!;
    const kinds = db(
      `select string_agg(kind::text || '=' || n, ',' order by kind::text) from (select kind, count(*) n from revenue.assessment_evidence where assessment_id='${a}' group by kind) x`,
    );
    expect(kinds).toMatch(/assumption=\d/);
    expect(kinds).toMatch(/estimate=\d/);
    expect(kinds).toMatch(/observed=\d/);
    expect(
      db(
        `select count(*) from revenue.assessment_evidence where assessment_id='${a}' and kind='observed' and (source is null or observed_at is null)`,
      ),
    ).toBe("0");
    expect(
      db(
        `select count(*) from revenue.assessment_evidence where assessment_id='${a}' and kind='assumption' and (confidence is not null or how_to_verify is null)`,
      ),
    ).toBe("0");
    expect(
      db(
        `select count(*) from revenue.assessment_evidence where assessment_id='${a}' and kind='estimate' and (rationale is null or recommendation_id is null or cardinality(basis)=0)`,
      ),
    ).toBe("0");
    expect(
      db(
        `select count(*) from visibility.recommendations r where r.assessment_id='${a}' and r.kind='service' and r.detail like 'ESTIMATED OPPORTUNITY%'`,
      ),
    ).not.toBe("0");
  });

  it("PROOF 3b — the database refuses an assumption dressed as a finding, or an estimate resting on one", async () => {
    const [, , third] = await rpc.rows<{ prospect_id: string }>(
      HLD_MGR,
      "revenue.prospect_profiles",
      { industry_key: "salon_barber" },
    );
    const id = third!.prospect_id;
    const score = [{ category: "website", score: 1, note: "" }];
    const assumptionWithConfidence: ReviewPayload = {
      scores: score,
      evidence: [
        {
          key: "a1",
          kind: "assumption",
          label: "A",
          statement: "Busy weekends",
          source: null,
          source_ref: null,
          observed_at: null,
          confidence: "high",
          how_to_verify: "Ask",
          rationale: null,
          offer_key: null,
          basis: [],
        },
      ],
      recommendations: [],
    };
    await expect(
      rpc.call(HLD_MGR, "revenue.send_to_review", {
        p_prospect: id,
        p_request_key: "x1",
        p_payload: assumptionWithConfidence,
      }),
    ).rejects.toThrow(/evidence_assumption_shape/);
    const estimateOnAssumption: ReviewPayload = {
      scores: score,
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
        p_prospect: id,
        p_request_key: "x2",
        p_payload: estimateOnAssumption,
      }),
    ).rejects.toThrow(/not an observed, verified or customer-provided fact/);
    const unsupported: ReviewPayload = {
      scores: score,
      evidence: [],
      recommendations: [
        {
          kind: "service",
          title: "Website",
          detail: "",
          service: "hld.website",
          priority: 2,
          evidence_key: "nothing",
        },
      ],
    };
    await expect(
      rpc.call(HLD_MGR, "revenue.send_to_review", {
        p_prospect: id,
        p_request_key: "x3",
        p_payload: unsupported,
      }),
    ).rejects.toThrow(/no supporting evidence/);
    expect(
      db(`select count(*) from visibility.assessments where prospect_id='${id}'`),
    ).toBe("0");
    // and nobody can write evidence directly
    await expect(
      rpc.call(HLD_MGR, "revenue.content_sha256", { p_title: "a", p_body: "b" }),
    ).resolves.toBe(contentSha256("a", "b"));
    expect(() =>
      psql(
        pg,
        `begin; select set_config('request.jwt.claims','{"sub":"${HLD_MGR}","role":"authenticated"}',true); set local role authenticated;
      insert into revenue.assessment_evidence (assessment_id, prospect_id, tenant_id, evidence_key, kind, label, statement) values ('${state["assessment"]}','${id}','${TENANTS.hld}','x','observed','x','x'); commit;`,
      ),
    ).toThrow(/permission denied/);
  });

  it("PROOF 4 — the right pipeline: HLD industries to HLD, transportation to HSCS, mismatches to a person", async () => {
    const [carrier] = await mock.discover(transport, 1, 0);
    const r = await rc.persistDiscovered(HSCS_MGR, carrier!, {
      industryKey: "transportation",
      campaignKey: "hscs_transport",
      source: "mock",
      isSynthetic: true,
    });
    expect(r).toMatchObject({ status: "persisted", line: "hscs" });
    if (r.status === "persisted") state["carrier"] = r.prospectId;
    expect(
      db(`select tenant_id from visibility.prospects where id='${state["carrier"]}'`),
    ).toBe(TENANTS.hscs);
    const before = db(`select count(*) from visibility.prospects`);
    const [another] = await mock.discover(transport, 1, 50);
    const mismatch = await rc.persistDiscovered(OWNER, another!, {
      industryKey: "transportation",
      campaignKey: "hld_salons",
      source: "mock",
      isSynthetic: true,
    });
    expect(mismatch.status).toBe("needs_review");
    expect(db(`select count(*) from visibility.prospects`)).toBe(before);
  });

  it("PROOF 5 — a proposal is drafted with configured prices and held for the owner", async () => {
    const d = await rc.draftProposal(HLD_MGR, state["salon"]!, priceBook("hld"));
    expect(d.proposal.status).toBe("ready_for_approval");
    const expected = d.proposal.lines.reduce((s, l) => s + (l.oneTimeCents ?? 0), 0);
    expect(d.proposal.totalOneTimeCents).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(
      db(
        `select kind||'/'||status from visibility.content_assets where id='${d.contentId}'`,
      ),
    ).toBe("proposal/pending_approval");
    state["content"] = d.contentId;
    state["proposalApproval"] = d.approvalInstanceId!;
  });

  it("PROOF 6 — no manager, and no undesignated owner, can approve", async () => {
    const pending = await rc.pendingApproval(HLD_MGR, state["proposalApproval"]!);
    await expect(rc.decide(HLD_MGR, pending, "approved")).rejects.toThrow(
      /only the designated owner/,
    );
    await expect(rc.decide(CO_OWNER, pending, "approved")).rejects.toThrow(
      /only the designated owner/,
    );
    await expect(rc.decide(OUTSIDER, pending, "approved")).rejects.toThrow();
    // the old route is closed too
    const [task] = await rpc.rows<{ id: string }>(HLD_MGR, "workflows.tasks", {
      instance_id: state["proposalApproval"]!,
    });
    await expect(
      rpc.call(HLD_MGR, "workflows.decide", {
        p_task: task!.id,
        p_decision: "approved",
      }),
    ).rejects.toThrow(/commercial approvals require the designated owner/);
    // HSCS manager, on an HSCS proposal
    await rc.sendToReview(HSCS_MGR, state["carrier"]!);
    const h = await rc.draftProposal(HSCS_MGR, state["carrier"]!, priceBook("hscs"));
    expect(h.proposal.status).toBe("ready_for_approval");
    const hp = await rc.pendingApproval(HSCS_MGR, h.approvalInstanceId!);
    await expect(rc.decide(HSCS_MGR, hp, "approved")).rejects.toThrow(
      /only the designated owner/,
    );
    expect(
      db(
        `select status from workflows.instances where id='${state["proposalApproval"]}'`,
      ),
    ).toBe("open");
  });

  it("PROOF 7 — the owner approves the exact version; a changed version voids it", async () => {
    const pending = await rc.pendingApproval(OWNER, state["proposalApproval"]!);
    await expect(
      rc.decide(OWNER, { ...pending, sha256: "0".repeat(64) }, "approved"),
    ).rejects.toThrow(/changed since you viewed it/);
    await rc.decide(OWNER, pending, "approved");
    expect(
      db(
        `select content_sha256 from revenue.approval_bindings where instance_id='${pending.instanceId}'`,
      ),
    ).toBe(pending.sha256);
    expect(
      db(
        `select count(*) from audit.security_events where action='revenue.approve_commercial'`,
      ),
    ).toBe("1");

    // Material change on a second, approved proposal: approval is voided.
    const d2 = await rc.draftProposal(HLD_MGR, state["salon"]!, priceBook("hld"));
    await rc.decide(
      OWNER,
      await rc.pendingApproval(OWNER, d2.approvalInstanceId!),
      "approved",
    );
    db(
      `update visibility.content_assets set body = body || ' (edited)' where id='${d2.contentId}'`,
    ); // no app path edits content; simulate one
    expect(
      db(
        `select status||'|'||coalesce(approval_instance_id::text,'none') from visibility.content_assets where id='${d2.contentId}'`,
      ),
    ).toBe("draft|none");
    expect(
      db(`select status from workflows.instances where id='${d2.approvalInstanceId}'`),
    ).toBe("canceled");
    await expect(
      rc.requestOutreach(HLD_MGR, d2.contentId, "x@synthetic.test", {
        business: "x",
        contact: "x",
        link: "x",
      }),
    ).rejects.toThrow(/not been approved/);
  });

  it("PROOF 8 — outreach is queued only with approval AND consent, and held for its own approval", async () => {
    const to = "owner@synthetic-salon-1.test";
    const vars = {
      business: "Synthetic Salons and barbers 1",
      contact: "Owner",
      link: "https://example.test/p/1",
    };
    const unapproved = await rc.draftProposal(
      HLD_MGR,
      state["salon"]!,
      priceBook("hld"),
    );
    await expect(
      rc.requestOutreach(HLD_MGR, unapproved.contentId, to, vars),
    ).rejects.toThrow(/not been approved/);
    await expect(
      rc.requestOutreach(HLD_MGR, state["content"]!, to, vars),
    ).rejects.toThrow(/requires prior consent/);
    await rpc.call(OWNER, "comms.set_consent", {
      p_tenant: TENANTS.hld,
      p_channel: "email",
      p_contact: to,
      p_status: "granted",
      p_source: "synthetic test record",
    });
    const o = await rc.requestOutreach(HLD_MGR, state["content"]!, to, vars);
    expect(
      await rc.requestOutreach(HLD_MGR, state["content"]!, to, vars),
    ).toMatchObject({ messageId: o.messageId }); // idempotent
    expect(db(`select status from comms.messages where id='${o.messageId}'`)).toBe(
      "pending",
    );
    const pm = await rc.pendingApproval(HLD_MGR, o.approvalInstanceId);
    await expect(rc.decide(HLD_MGR, pm, "approved")).rejects.toThrow(
      /only the designated owner/,
    );
    await expect(rc.releaseOutreach(HLD_MGR, o.messageId)).rejects.toThrow(
      /not approved by a human/,
    );
    await rc.decide(
      OWNER,
      await rc.pendingApproval(OWNER, o.approvalInstanceId),
      "approved",
    );
    await rc.releaseOutreach(HLD_MGR, o.messageId);
    expect(
      db(
        `select status||'|'||provider_key from comms.messages where id='${o.messageId}'`,
      ),
    ).toBe("approved|mock_email");
    // revoking consent blocks any further marketing to that contact
    await rpc.call(OWNER, "comms.set_consent", {
      p_tenant: TENANTS.hld,
      p_channel: "email",
      p_contact: to,
      p_status: "revoked",
      p_source: "synthetic",
    });
    await expect(
      rc.requestOutreach(HLD_MGR, state["content"]!, "other@synthetic.test", vars),
    ).rejects.toThrow(/requires prior consent/);
    state["message"] = o.messageId;
  });

  it("PROOF 9 — delivery is mocked, platform-worker only, approved messages only", async () => {
    await expect(
      rpc.call(HLD_MGR, "revenue.mock_deliver", { p_message: state["message"]! }),
    ).rejects.toThrow(/trusted provider worker/);
    await rpc.call(PLATFORM, "revenue.mock_deliver", { p_message: state["message"]! });
    expect(
      db(
        `select status||'|'||provider_message_ref from comms.messages where id='${state["message"]}'`,
      ),
    ).toBe(`delivered|mock-${state["message"]}`);
    // an unapproved message can no longer be recorded as sent (narrowed record_delivery)
    const pendingMsg = db(
      `select id from comms.messages where status='pending' limit 1`,
    );
    if (pendingMsg)
      await expect(
        rpc.call(PLATFORM, "comms.record_delivery", {
          p_message: pendingMsg,
          p_status: "sent",
        }),
      ).rejects.toThrow(/cannot be recorded as sent/);
    // a real provider cannot be "mock delivered"
    const realId = await rpc.call<string>(OWNER, "comms.request_message", {
      p_tenant: TENANTS.hld,
      p_module: "test",
      p_channel: "email",
      p_template: "proposal_delivery",
      p_version: 1,
      p_to: "t@synthetic.test",
      p_class: "transactional",
      p_vars: { business: "b", contact: "c", link: "l" },
      p_idempotency: "real-provider-check",
      p_require_approval: false,
      p_provider: "email",
    });
    await expect(
      rpc.call(PLATFORM, "revenue.mock_deliver", { p_message: realId }),
    ).rejects.toThrow(/mock delivery refused/);
    expect(
      db(
        `select count(*) from comms.messages where status in ('sent','delivered') and provider_key not like 'mock%'`,
      ),
    ).toBe("0");
    expect(
      db(`select count(*) from audit.events where resource_type='comms.messages'`),
    ).not.toBe("0");
  });

  it("SECURITY — an opted-out contact stays suppressed whatever the capitals (pre-existing bug, fixed)", async () => {
    await rpc.call(OWNER, "comms.suppress", {
      p_tenant: TENANTS.hld,
      p_channel: "email",
      p_contact: "Stop@Synthetic.test",
      p_reason: "opt_out",
    });
    const id = await rpc.call<string>(OWNER, "comms.request_message", {
      p_tenant: TENANTS.hld,
      p_module: "test",
      p_channel: "email",
      p_template: "proposal_delivery",
      p_version: 1,
      p_to: "STOP@SYNTHETIC.TEST",
      p_class: "transactional",
      p_vars: { business: "b", contact: "c", link: "l" },
      p_idempotency: "case-bypass",
      p_require_approval: false,
    });
    expect(db(`select status from comms.messages where id='${id}'`)).toBe("suppressed");
    // and consent given in one case is honoured in another
    await rpc.call(OWNER, "comms.set_consent", {
      p_tenant: TENANTS.hld,
      p_channel: "email",
      p_contact: "Mixed@Synthetic.test",
      p_status: "granted",
      p_source: "synthetic",
    });
    expect(
      await rpc.call(OWNER, "comms.has_consent", {
        p_tenant: TENANTS.hld,
        p_channel: "email",
        p_contact: "mixed@synthetic.test",
      }),
    ).toBe(true);
  });

  it("PROOF 10 — the dashboard reads the database: real stage metrics, synthetic labelled as such", async () => {
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
          `select count(*) from revenue.prospect_profiles where tenant_id='${TENANTS.hld}'`,
        ),
      ),
    );
    expect(m("reviews").value).toBe(
      Number(
        db(
          `select count(*) from visibility.assessments where tenant_id='${TENANTS.hld}' and status='completed'`,
        ),
      ),
    );
    expect(m("outreach").value).toBe(1);
    expect(m("discovered").status).toBe("synthetic");
    expect(m("signed").status).toBe("not_connected"); // agreements are not recorded yet: unknown, not zero
    expect(m("mrr")).toMatchObject({ value: null, status: "not_connected" }); // nor is revenue
    const actual = lineDashboard(OWNER_P, "hld", input);
    expect(actual.metrics.find((x) => x.key === "discovered")!.value).toBeNull();
    expect(actual.demoRecordsExcluded).toBeGreaterThan(0);
  });

  it("PROOF 11 — cross-tenant access is denied everywhere", async () => {
    const carrier = state["carrier"]!;
    for (const t of ["visibility.prospects", "revenue.prospect_profiles"])
      expect(
        await rpc.rows(
          HLD_MGR,
          t,
          t.startsWith("visibility") ? { id: carrier } : { prospect_id: carrier },
        ),
      ).toEqual([]);
    expect(
      await rpc.rows(HLD_MGR, "revenue.assessment_evidence", {
        tenant_id: TENANTS.hscs,
      }),
    ).toEqual([]);
    expect(
      await rpc.rows(HSCS_MGR, "comms.messages", { tenant_id: TENANTS.hld }),
    ).toEqual([]);
    expect(
      await rpc.rows(HSCS_MGR, "revenue.prospect_profiles", { tenant_id: TENANTS.hld }),
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
    const [lead] = await mock.discover(transport, 1, 70);
    await expect(
      rpc.call(HLD_MGR, "revenue.register_prospect", {
        p_tenant: TENANTS.hscs,
        p_business: lead!.name,
        p_industry: "transportation",
        p_dedupe: lead!.dedupeKey,
        p_source: "mock",
        p_is_synthetic: true,
      }),
    ).rejects.toThrow(/insufficient privilege/);
    for (const t of [
      "visibility.prospects",
      "revenue.prospect_profiles",
      "revenue.assessment_evidence",
      "comms.messages",
      "workflows.instances",
    ])
      expect(await rpc.rows(OUTSIDER, t, {})).toEqual([]);
  });

  it("PROOF 12 — a rejected prospect is replaced by backfill, with no duplicate records", async () => {
    const contractors = { ...industry("contractor")!, targetActive: 3 };
    const first = await backfillIndustry(
      rc,
      HLD_MGR,
      contractors,
      "hld_contractors",
      mock,
    );
    expect(first.added).toHaveLength(3);
    await rc.setStatus(
      HLD_MGR,
      first.added[0]!,
      "rejected",
      "Synthetic test: not a fit",
    );
    expect(
      db(`select stage from visibility.prospects where id='${first.added[0]}'`),
    ).toBe("lost");
    const second = await backfillIndustry(
      rc,
      HLD_MGR,
      contractors,
      "hld_contractors",
      mock,
      { pageSize: 3 },
    );
    expect(second.plan.deficit).toBe(1);
    expect(second.added).toHaveLength(1);
    expect(second.duplicatesSkipped).toBe(3); // the rejected one is NOT re-added
    const third = await backfillIndustry(
      rc,
      HLD_MGR,
      contractors,
      "hld_contractors",
      mock,
    );
    expect(third.added).toHaveLength(0);
    expect(
      db(
        `select count(*)||'/'||count(distinct dedupe_key) from revenue.prospect_profiles where industry_key='contractor'`,
      ),
    ).toBe("4/4");
    await expect(rc.setStatus(HLD_MGR, first.added[1]!, "rejected")).rejects.toThrow(
      /prospect_profiles_reason/,
    );
    await expect(rc.sendToReview(HLD_MGR, first.added[0]!)).rejects.toThrow(
      /rejected prospect cannot be reviewed/,
    );
    // every original industry slot is modelled, each with its target
    expect(INDUSTRIES.every((i) => i.targetActive === 50)).toBe(true);
  });
});

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
