import "server-only";

import {
  REVENUE_CENTER_CAPTURED_KINDS,
  RevenueCenter,
  connectorReadiness,
  growthDashboard,
  industry,
  lineName,
  planBackfill,
  type BackfillPlan,
  type BusinessLine,
  type Campaign,
  type HlbosRpc,
  type LineDashboard,
  type LineTenants,
  type PendingApproval,
  type ProspectProfileRow,
} from "@hl-bos/growth-intelligence";
import { psqlRpc } from "@hl-bos/growth-intelligence/local-pg";

import { readEnvFile } from "./secrets";

/**
 * Where the Revenue Center reads and writes.
 *
 *  - "development": a THROWAWAY PostgreSQL on this computer, built by
 *    scripts/local-test/revenue-center-db.sh from the repository's migrations
 *    plus the proposed Revenue Center migration. Synthetic records only. Set
 *    HLBOS_REVENUE_DEV_PG=<socket dir or localhost>:<port>. The adapter refuses
 *    any non-local host.
 *  - "not_connected": the default. HL-BOS production has not had the proposed
 *    migration applied (that needs the owner's approval), so the page says so
 *    instead of showing anything.
 */
export type RevenueSource =
  | {
      mode: "development";
      rc: RevenueCenter;
      rpc: HlbosRpc;
      actor: string;
      tenants: LineTenants;
    }
  | { mode: "not_connected"; reason: string };

/** The synthetic fixture's ids (scripts/local-test/revenue-center-fixture.sql). */
const DEV_TENANTS: LineTenants = {
  hld: "00000000-0000-4000-8000-0000000000d1",
  hscs: "00000000-0000-4000-8000-0000000000d2",
};
const DEV_OWNER = "00000000-0000-4000-8000-00000000a001";
export const DEV_CAMPAIGNS: Campaign[] = [
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

/** Reads the console's own settings file (.env.local), like every other console connection. */
export async function consoleRevenueSource(): Promise<RevenueSource> {
  return revenueSource(await readEnvFile());
}

export function revenueSource(
  env: Readonly<Record<string, string | undefined>>,
): RevenueSource {
  const v = env["HLBOS_REVENUE_DEV_PG"];
  if (!v)
    return {
      mode: "not_connected",
      reason:
        "The Revenue Center database is not connected. Its tables come from a proposed migration that has not been applied anywhere — applying it needs your approval, after PR #113 is merged.",
    };
  const i = v.lastIndexOf(":");
  const rpc = psqlRpc({
    host: v.slice(0, i),
    port: v.slice(i + 1),
    user: "postgres",
    database: env["HLBOS_REVENUE_DEV_DB"] ?? "hlbos_revenue_center_test",
  });
  return {
    mode: "development",
    rc: new RevenueCenter(rpc, DEV_TENANTS, DEV_CAMPAIGNS),
    rpc,
    actor: DEV_OWNER,
    tenants: DEV_TENANTS,
  };
}

export interface ProspectRow {
  id: string;
  name: string;
  line: BusinessLine;
  industry: string;
  status: ProspectProfileRow["status"];
  statusReason: string | null;
  synthetic: boolean;
  source: string;
  reviews: number;
  latestScore: number | null;
  recommendations: number;
  proposal: string | null;
}

export interface RevenueView {
  prospects: ProspectRow[];
  backfill: BackfillPlan[];
  approvals: (PendingApproval & { line: BusinessLine })[];
  dashboards: LineDashboard[];
  syntheticRecords: number;
}

export async function revenueView(
  src: Extract<RevenueSource, { mode: "development" }>,
  now = new Date(),
): Promise<RevenueView> {
  const { rc, rpc, actor } = src;
  const [profiles, prospects, assessments, recs, contents, instances] =
    await Promise.all([
      rpc.rows<ProspectProfileRow>(actor, "revenue.prospect_profiles", {}),
      rpc.rows<{ id: string; business_name: string }>(
        actor,
        "visibility.prospects",
        {},
      ),
      rpc.rows<{
        id: string;
        prospect_id: string;
        growth_score: number | null;
        status: string;
        assessed_at: string | null;
      }>(actor, "visibility.assessments", {}),
      rpc.rows<{ assessment_id: string }>(actor, "visibility.recommendations", {}),
      rpc.rows<{
        id: string;
        body: string;
        status: string;
        approval_instance_id: string | null;
      }>(actor, "visibility.content_assets", { kind: "proposal" }),
      rpc.rows<{ id: string; tenant_id: string; status: string; kind: string }>(
        actor,
        "workflows.instances",
        { status: "open" },
      ),
    ]);
  const names = new Map(prospects.map((p) => [p.id, p.business_name]));
  const proposalOf = new Map<string, string>();
  for (const c of contents) {
    try {
      proposalOf.set(
        (JSON.parse(c.body) as { prospectId: string }).prospectId,
        c.status,
      );
    } catch {
      /* edited outside the app: not attributed */
    }
  }
  const rows: ProspectRow[] = profiles.map((p) => {
    const mine = assessments.filter(
      (a) => a.prospect_id === p.prospect_id && a.status === "completed",
    );
    const latest = mine.sort((a, b) =>
      (b.assessed_at ?? "").localeCompare(a.assessed_at ?? ""),
    )[0];
    return {
      id: p.prospect_id,
      name: names.get(p.prospect_id) ?? "(not visible)",
      line: rc.lineOfTenant(p.tenant_id),
      industry: industry(p.industry_key)?.label ?? p.industry_key,
      status: p.status,
      statusReason: p.status_reason,
      synthetic: p.is_synthetic,
      source: p.discovery_source,
      reviews: mine.length,
      latestScore: latest?.growth_score ?? null,
      recommendations: latest
        ? recs.filter((r) => r.assessment_id === latest.id).length
        : 0,
      proposal: proposalOf.get(p.prospect_id) ?? null,
    };
  });
  const approvals: RevenueView["approvals"] = [];
  for (const i of instances.filter(
    (x) => x.kind === "visibility.content.publish" || x.kind === "comms.message.create",
  )) {
    try {
      approvals.push({
        ...(await rc.pendingApproval(actor, i.id)),
        line: rc.lineOfTenant(i.tenant_id),
      });
    } catch {
      /* not a Revenue Center approval */
    }
  }
  const events = await rc.loadEvents(actor);
  return {
    prospects: rows.sort(
      (a, b) => a.industry.localeCompare(b.industry) || a.name.localeCompare(b.name),
    ),
    backfill: planBackfill(await rc.industryCounts(actor, { includeSynthetic: true })),
    approvals,
    dashboards: growthDashboard(
      { id: actor, role: "owner", lines: [] },
      {
        events,
        expenses: [],
        connectors: connectorReadiness([], now),
        now,
        capturedKinds: REVENUE_CENTER_CAPTURED_KINDS,
        includeSynthetic: true,
      },
    ),
    syntheticRecords: profiles.filter((p) => p.is_synthetic).length,
  };
}

export { lineName };
