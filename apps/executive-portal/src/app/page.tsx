import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row, Dot, Bar, Empty } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { canView } from "@/lib/authz";
import { buildCatalog, executiveReadiness, productPortfolio } from "@/lib/portal-data";
import {
  applicationHealth,
  pendingApprovals,
  enterpriseAlerts,
} from "@/lib/operations-data";
import { sampleIntelligence, sampleGovAssessments } from "@/lib/intelligence-data";
import { APPLICATIONS } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

const SEV_HEALTH = {
  high: "red",
  medium: "yellow",
  low: "yellow",
  info: "green",
} as const;

export default async function HomePage() {
  const viewer = await getViewer();
  const role = viewer.role;
  const canIntel = canView(role, "intelligence");
  const canGov = canView(role, "government");
  const canDecisions = canView(role, "decisions");

  const catalog = buildCatalog();
  const r = executiveReadiness();
  const portfolio = productPortfolio();
  const appHealth = applicationHealth();
  const approvals = pendingApprovals();
  const alerts = enterpriseAlerts();
  const activeDev = APPLICATIONS.filter(
    (a) => a.developmentStatus === "built_undeployed",
  );

  return (
    <PortalShell view="home">
      {/* Platform health */}
      <Grid min={150}>
        <Tile
          label="Platform completion"
          value={`${r.platformCompletionPct}%`}
          accent="#3fb950"
        />
        <Tile
          label="Factory completion"
          value={`${r.factoryCompletionPct}%`}
          accent="#d29922"
        />
        <Tile
          label="Commercial readiness"
          value={`${r.commercialReadinessPct}%`}
          accent="#f85149"
          hint="pending pricing"
        />
        <Tile
          label="Applications"
          value={appHealth.total}
          hint="governed in registry"
        />
        <Tile label="Pending CEO approvals" value={approvals.length} accent="#e3b341" />
        <Tile label="Enterprise assets" value={catalog.assets.length} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Pending approvals */}
        <Card title="Pending CEO Approvals" sub="Decisions only you can make.">
          {canDecisions ? (
            approvals.length ? (
              approvals.map((a) => (
                <Row
                  key={a.title}
                  k={a.title}
                  v={<span style={{ color: "#e3b341" }}>{a.note}</span>}
                />
              ))
            ) : (
              <Empty>Nothing awaiting approval.</Empty>
            )
          ) : (
            <Empty>
              {approvals.length} decision(s) pending. The list is restricted to
              executive roles.
            </Empty>
          )}
        </Card>

        {/* Active development */}
        <Card title="Active Development" sub="Built, awaiting deployment approval.">
          {activeDev.map((a) => (
            <Row
              key={a.key}
              k={a.name}
              v={
                <span style={{ color: "#8b949e" }}>
                  <Dot health="yellow" />
                  {a.currentBranch}
                </span>
              }
            />
          ))}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Software factory */}
        <Card title="Software Factory Status" sub="Assembly readiness.">
          <Bar label="Factory completion" pct={r.factoryCompletionPct} />
          <Bar label="Platform spine" pct={r.platformCompletionPct} />
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#8b949e" }}>
            {r.productsAssemblable}/{portfolio.length} products assemblable ·{" "}
            {r.moduleCounts.total} modules registered
          </div>
        </Card>

        {/* Application health */}
        <Card
          title="Application Health"
          sub="From the Enterprise Application Registry."
        >
          <Row k="Deployed (external)" v={appHealth.externalHosted} />
          <Row k="Built, not deployed" v={appHealth.notDeployed} />
          <Row k="Unknown / unverified" v={appHealth.unknown} />
          <Row k="Legacy (out of scope)" v={appHealth.byCategory.legacy} />
        </Card>
      </div>

      {/* Intelligence + Government summaries (role-gated) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card
          title="Transformation Intelligence"
          sub="Illustrative sample — engine is real, input is labelled sample."
        >
          {canIntel ? (
            (() => {
              const intel = sampleIntelligence();
              const top = intel.recommendations[0];
              return (
                <>
                  <Row k="Findings" v={intel.insights.length} />
                  <Row k="Recommendations" v={intel.recommendations.length} />
                  <Row
                    k="Est. monthly impact"
                    v={money(intel.businessImpact.totalMonthlyValue)}
                  />
                  {top ? (
                    <Row
                      k="Top priority"
                      v={
                        <span>
                          <Dot health="red" />
                          {top.label} ({top.priority})
                        </span>
                      }
                    />
                  ) : null}
                </>
              );
            })()
          ) : (
            <Empty>Restricted to executive/administrator roles.</Empty>
          )}
        </Card>

        <Card
          title="Government Opportunities"
          sub="Illustrative sample solicitations — not real RFPs."
        >
          {canGov ? (
            (() => {
              const gov = sampleGovAssessments();
              return gov.length ? (
                gov.map((g) => (
                  <Row
                    key={g.opportunity.id}
                    k={g.opportunity.title}
                    v={
                      <span style={{ color: "#8b949e" }}>
                        {g.winProbability.score === null
                          ? "—"
                          : `${g.winProbability.score}% fit`}{" "}
                        · {g.ceoRecommendation.verdict.replace(/_/g, " ")}
                      </span>
                    }
                  />
                ))
              ) : (
                <Empty>No sample opportunities.</Empty>
              );
            })()
          ) : (
            <Empty>Restricted to executive roles.</Empty>
          )}
        </Card>
      </div>

      {/* AI recommendation + Revenue placeholder */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card
          title="AI Recommendation Summary"
          sub="Advisory only — AI approves nothing."
        >
          {canIntel ? (
            (() => {
              const intel = sampleIntelligence();
              const top = intel.recommendations[0];
              return top ? (
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  <div>
                    <strong>{top.problem}</strong>
                  </div>
                  <div style={{ color: "#8b949e", marginTop: 4 }}>{top.solution}</div>
                  <div style={{ color: "#6e7681", marginTop: 6, fontSize: 12 }}>
                    Requires:{" "}
                    {top.approvals.map((a) => a.type.replace(/_/g, " ")).join(", ")}
                  </div>
                </div>
              ) : (
                <Empty>No recommendations in the sample.</Empty>
              );
            })()
          ) : (
            <Empty>Restricted.</Empty>
          )}
        </Card>

        <Card title="Revenue Dashboard" sub="Placeholder — no billing data connected.">
          <Empty>
            No revenue data is connected. Live revenue requires the billing integration
            (Stripe) and the edge runtime — both pending CEO authorization. This panel
            will not display invented figures.
          </Empty>
        </Card>
      </div>

      {/* Enterprise alerts */}
      <Card title="Enterprise Alerts" sub="Computed from real platform state.">
        {alerts.map((a) => (
          <div
            key={a.id}
            style={{
              padding: "8px 0",
              borderBottom: "1px solid #1c2128",
              fontSize: 12.5,
            }}
          >
            <Dot health={SEV_HEALTH[a.severity]} />
            <strong>{a.title}</strong>
            <div style={{ color: "#8b949e", marginLeft: 17, marginTop: 2 }}>
              {a.detail}
            </div>
          </div>
        ))}
      </Card>

      {/* Recent activity — honest placeholder */}
      <Card title="Recent Activity" sub="Live activity feed.">
        <Empty>
          No live activity feed is connected. Streaming repository/CI/deployment
          activity requires a connected GitHub + hosting session; the deployed portal
          does not fabricate an activity log.
        </Empty>
      </Card>

      <p style={{ fontSize: 11.5, color: "#6e7681", lineHeight: 1.6 }}>
        Read-only. Every figure is computed from the version-controlled catalog,
        application registry, and the deterministic intelligence engine over a labelled
        sample. The portal cannot run commands, deploy, or change data.
      </p>
    </PortalShell>
  );
}
