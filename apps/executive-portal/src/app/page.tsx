import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Dot, Bar } from "@/components/ui";
import {
  buildCatalog,
  executiveReadiness,
  productPortfolio,
  KIND_LABEL,
} from "@/lib/portal-data";
import type { AssetKind } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const catalog = buildCatalog();
  const r = executiveReadiness();
  const portfolio = productPortfolio();
  const count = (k: AssetKind) => catalog.assets.filter((a) => a.kind === k).length;

  return (
    <PortalShell view="dashboard">
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
          hint="gated on pricing"
        />
        <Tile label="Total assets" value={catalog.assets.length} />
        <Tile label="Registered modules" value={r.moduleCounts.total} />
        <Tile
          label="Products assemblable"
          value={`${r.productsAssemblable}/${portfolio.length}`}
          accent="#3fb950"
        />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Estate at a glance" sub="What Herman Legacy owns.">
          {(
            [
              "product",
              "shared_service",
              "module",
              "ai_capability",
              "edge_function",
              "database",
            ] as AssetKind[]
          ).map((k) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid #1c2128",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#8b949e" }}>{KIND_LABEL[k].many}</span>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>{count(k)}</span>
            </div>
          ))}
        </Card>

        <Card
          title="Readiness"
          sub="Computed from the module registry & factory checklist."
        >
          <Bar label="Platform (spine built/deployed)" pct={r.platformCompletionPct} />
          <Bar label="Software Factory" pct={r.factoryCompletionPct} />
          <Bar
            label="Commercial (terms set)"
            pct={r.commercialReadinessPct}
            sub="pending CEO"
          />
          <div style={{ marginTop: 8, fontSize: 12, color: "#8b949e" }}>
            <Dot health="green" /> {r.moduleCounts.live} live · <Dot health="yellow" />{" "}
            {r.moduleCounts.builtUndeployed} built, not deployed
          </div>
        </Card>
      </div>

      <Card
        title="Products ready for launch"
        sub="From the Software Factory assembler."
      >
        {portfolio
          .filter((p) => p.availability === "ready_to_launch")
          .map((p) => (
            <div
              key={p.key}
              style={{
                padding: "7px 0",
                borderBottom: "1px solid #1c2128",
                fontSize: 13,
              }}
            >
              <Dot health="green" />
              {p.name} — foundation {p.foundationPct}% · edition {p.edition}
            </div>
          ))}
        {portfolio.filter((p) => p.availability === "ready_to_launch").length === 0 && (
          <span style={{ fontSize: 13, color: "#8b949e" }}>None yet.</span>
        )}
      </Card>

      <p style={{ fontSize: 11.5, color: "#6e7681", lineHeight: 1.6 }}>
        This portal is <strong>read-only</strong>. Every figure is computed from the
        version-controlled catalog — nothing is entered by hand, and the portal cannot
        run commands, deploy, or change data.
      </p>
    </PortalShell>
  );
}
