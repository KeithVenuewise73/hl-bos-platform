import "server-only";

import {
  CORE_INDUSTRIES,
  REVENUE_CENTER_CAPTURED_KINDS,
  RevenueCenter,
  connectorReadiness,
  growthDashboard,
  hasScan,
  industry,
  lineName,
  type BusinessLine,
  type HlbosRpc,
  type IndustrySummaryRow,
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
 *    scripts/local-test/revenue-center-db.sh (or the production-equivalent
 *    build) plus the proposed Revenue Center migration. Synthetic records only.
 *    Set HLBOS_REVENUE_DEV_PG=<socket dir or localhost>:<port> in .env.local.
 *    The adapter refuses any non-local host.
 *  - "not_connected": the default. The proposed migration has not been applied
 *    to HL-BOS production (that needs the owner's approval), so the page says so.
 *
 * Production will use supabaseRpc() with the signed-in owner's session; that
 * needs the migration applied and the revenue schema exposed, both approvals.
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
    rc: new RevenueCenter(rpc, DEV_TENANTS),
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
  /** A Presence Scanner scan is stored, so the prospect can be reviewed. */
  hasScan: boolean;
}

export interface IndustryRow {
  key: string;
  label: string;
  line: BusinessLine;
  target: number;
  summary: IndustrySummaryRow | undefined;
  open: number;
  backfill: number;
}

export interface InquiryRow {
  id: string;
  line: BusinessLine;
  company: string | null;
  status: string;
  reasons: string[];
  synthetic: boolean;
  receivedAt: string;
}

export interface ReleaseSettings {
  environment: "development" | "pilot" | "production";
  allow_synthetic_records: boolean;
  allow_mock_delivery: boolean;
  allow_paid_discovery: boolean;
  allow_auto_notifications: boolean;
  allow_outbound_delivery: boolean;
}

export interface RevenueView {
  /** What this environment may do, read from revenue.release_settings (the database enforces it). */
  release: ReleaseSettings | undefined;
  prospects: ProspectRow[];
  industries: IndustryRow[];
  approvals: (PendingApproval & { line: BusinessLine })[];
  inquiries: InquiryRow[];
  dashboards: LineDashboard[];
  totals: {
    prospects: number;
    synthetic: number;
    byLine: Record<BusinessLine, number>;
  };
}

const n = (x: unknown) => Number(x ?? 0);

export async function revenueView(
  src: Extract<RevenueSource, { mode: "development" }>,
  now = new Date(),
): Promise<RevenueView> {
  const { rc, rpc, actor } = src;
  const [profiles, prospects, assessments, recs, open, summary, campaigns, inquiries] =
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
      rpc.rows<{ id: string; tenant_id: string }>(actor, "revenue.open_approvals", {}),
      rc.industrySummary(actor),
      rc.loadCampaigns(actor),
      rpc.rows<{
        id: string;
        tenant_id: string;
        company: string | null;
        status: string;
        routing_reasons: string[];
        is_synthetic: boolean;
        received_at: string;
      }>(actor, "revenue.inquiries", {}),
    ]);
  const names = new Map(prospects.map((p) => [p.id, p.business_name]));
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
      hasScan: hasScan(p.scan_snapshot),
    };
  });
  const approvals: RevenueView["approvals"] = [];
  for (const i of open) {
    try {
      approvals.push({
        ...(await rc.pendingApproval(actor, i.id)),
        line: rc.lineOfTenant(i.tenant_id),
      });
    } catch {
      /* not a Revenue Center approval */
    }
  }
  const industries: IndustryRow[] = CORE_INDUSTRIES.map((ind) => {
    const sum = summary.find((r) => r.industry_key === ind.key);
    // The target is the sum of this industry's approved campaigns, or the default when none exist.
    const approved = campaigns.filter(
      (c) => c.industry_key === ind.key && c.status === "approved",
    );
    const target = approved.length
      ? approved.reduce((s, c) => s + c.target_active, 0)
      : ind.targetActive;
    const openCount = n(sum?.active) + n(sum?.qualified);
    return {
      key: ind.key,
      label: ind.label,
      line: ind.line,
      target,
      summary: sum,
      open: openCount,
      backfill: Math.max(0, target - openCount),
    };
  });
  const events = await rc.loadEvents(actor);
  const byLine = {
    hld: rows.filter((r) => r.line === "hld").length,
    hscs: rows.filter((r) => r.line === "hscs").length,
  };
  const [release] = await rpc.rows<ReleaseSettings>(
    actor,
    "revenue.release_settings",
    {},
  );
  return {
    release,
    prospects: rows.sort(
      (a, b) => a.industry.localeCompare(b.industry) || a.name.localeCompare(b.name),
    ),
    industries,
    approvals,
    inquiries: inquiries
      .filter((q) => q.status === "needs_review")
      .map((q) => ({
        id: q.id,
        line: rc.lineOfTenant(q.tenant_id),
        company: q.company,
        status: q.status,
        reasons: q.routing_reasons,
        synthetic: q.is_synthetic,
        receivedAt: q.received_at,
      })),
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
    totals: {
      prospects: rows.length,
      synthetic: rows.filter((r) => r.synthetic).length,
      byLine,
    },
  };
}

export { lineName };
