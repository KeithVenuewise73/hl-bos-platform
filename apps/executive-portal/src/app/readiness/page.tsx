import { PortalShell } from "@/components/PortalShell";
import { Card, Bar } from "@/components/ui";
import { productPortfolio } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function ReadinessPage() {
  const portfolio = productPortfolio();
  return (
    <PortalShell view="readiness">
      <Card
        title="Product Readiness"
        sub="Foundation readiness (share of required modules built) per product."
      >
        {portfolio
          .slice()
          .sort((a, b) => b.foundationPct - a.foundationPct)
          .map((p) => (
            <Bar
              key={p.key}
              label={`${p.name} · ${p.availability.replace(/_/g, " ")}`}
              pct={p.foundationPct}
              sub={`${p.builtCount}/${p.requiredCount}`}
            />
          ))}
        <p style={{ fontSize: 11.5, color: "#6e7681", marginTop: 8 }}>
          Foundation readiness measures the shared/module foundation only —
          product-specific UI and configuration are additional, product-scoped work.
        </p>
      </Card>
    </PortalShell>
  );
}
