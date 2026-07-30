import { PortalShell } from "@/components/PortalShell";
import { Card, Dot } from "@/components/ui";
import { productPortfolio } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const portfolio = productPortfolio();
  return (
    <PortalShell view="portfolio">
      <Card
        title="Product Portfolio"
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
