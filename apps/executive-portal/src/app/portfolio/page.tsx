import { PortalShell } from "@/components/PortalShell";
import { Card, Dot } from "@/components/ui";
import { productPortfolio, factoryPortfolio } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const portfolio = productPortfolio();
  const { dashboard, products } = factoryPortfolio();
  const stat = (label: string, value: number | string) => (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#8b949e" }}>{label}</div>
    </div>
  );
  return (
    <PortalShell view="portfolio">
      <Card
        title="Executive Portfolio Dashboard"
        sub="The permanent Product Portfolio Management System — every software opportunity, one lifecycle."
      >
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", paddingBottom: 6 }}>
          {stat("Products", dashboard.total)}
          {stat("Assemblable now", dashboard.assemblableNow.length)}
          {stat("Need engineering", dashboard.needsEngineering.length)}
          {stat("Awaiting approval", dashboard.awaitingApproval.length)}
          {stat("Generating revenue", dashboard.revenueGenerating.length)}
          {stat("P1 (readiness)", dashboard.byPriority.P1)}
        </div>
        {dashboard.revenueGenerating.length === 0 && (
          <div style={{ fontSize: 11.5, color: "#6e7681", marginTop: 6 }}>
            No product is commercially live yet — revenue is honestly zero.
          </div>
        )}
      </Card>

      <Card
        title="Software Opportunity Catalog"
        sub="Assembly % and net-new engineering computed live from the Factory registry."
      >
        {products.map((p) => (
          <div
            key={p.key}
            style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13.5,
              }}
            >
              <span>
                <Dot
                  health={
                    p.assemblableNow ? "green" : p.netNew > 0 ? "yellow" : "unknown"
                  }
                />
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: "#8b949e" }}>
                {p.priority} · assembly {p.assemblyPct}%
                {p.netNew > 0 ? ` · ${p.netNew} net-new` : ""}
              </span>
            </div>
            <div
              style={{ fontSize: 11.5, color: "#6e7681", marginLeft: 17, marginTop: 2 }}
            >
              {p.line} · {p.maturity} · {p.status}
            </div>
          </div>
        ))}
      </Card>

      <Card
        title="Product Compositions (foundation readiness)"
        sub="Every product, its edition, and its foundation readiness."
      >
        {portfolio.map((p) => (
          <div
            key={p.key}
            style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13.5,
              }}
            >
              <span>
                <Dot
                  health={
                    p.availability === "ready_to_launch"
                      ? "green"
                      : p.availability === "needs_assembly"
                        ? "yellow"
                        : "unknown"
                  }
                />
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: "#8b949e" }}>
                {p.availability.replace(/_/g, " ")} · foundation {p.foundationPct}%
              </span>
            </div>
            <div
              style={{ fontSize: 11.5, color: "#6e7681", marginLeft: 17, marginTop: 2 }}
            >
              edition {p.edition} · {p.subscriptionModel.replace(/_/g, " ")}
            </div>
          </div>
        ))}
      </Card>
    </PortalShell>
  );
}
