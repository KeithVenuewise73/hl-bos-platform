import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Dot } from "@/components/ui";
import { referenceImplementations } from "@/lib/intelligence-data";

export const dynamic = "force-dynamic";

const STATUS_HEALTH: Record<string, "green" | "yellow" | "red"> = {
  measured: "green",
  estimated: "yellow",
  unknown: "red",
};

export default function ReferencesPage() {
  const lib = referenceImplementations();

  return (
    <PortalShell view="references">
      <Card
        title="Reference Implementation Library"
        sub="Herman Legacy's three businesses transformed as the Factory's first reference implementations."
      >
        <Grid min={150}>
          <Tile label="Reference orgs" value={lib.orgCount} />
          <Tile
            label="Measured baselines"
            value={lib.totals.measured}
            accent="#3fb950"
          />
          <Tile label="Estimated" value={lib.totals.estimated} accent="#d29922" />
          <Tile
            label="Unknown (need scan)"
            value={lib.totals.unknown}
            accent="#f85149"
          />
          <Tile
            label="Fabricated metrics"
            value={lib.noFabricatedMetrics ? 0 : "!"}
            accent="#3fb950"
          />
        </Grid>
        <div style={{ fontSize: 11.5, color: "#6e7681", marginTop: 6 }}>
          External metrics (visibility, SEO, traffic, reviews) are UNKNOWN until a live
          scan runs — never fabricated. Factory-internal readiness is measured.
        </div>
      </Card>

      {lib.implementations.map((r) => (
        <Card
          key={r.org}
          title={r.org}
          sub={`Transformation readiness ${r.capabilityReuseReport.transformationReadinessPct}% · capability reuse ${r.capabilityReuseReport.factoryCapabilityReusePct}%`}
        >
          <div style={{ fontSize: 12.5, color: "#c9d1d9", marginBottom: 8 }}>
            {r.caseStudy.currentState}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, margin: "6px 0 3px" }}>
            Products to assemble
          </div>
          {r.products.map((p) => (
            <div key={p.key} style={{ fontSize: 12.5 }}>
              <Dot health="green" />
              {p.name} · {p.assemblyPct}% · {p.maturity}
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 3px" }}>
            Baselines (measured / estimated / unknown)
          </div>
          <Grid min={150}>
            {r.baselines.map((b) => (
              <div key={b.metric} style={{ fontSize: 11.5 }}>
                <Dot health={STATUS_HEALTH[b.status] ?? "unknown"} />
                {b.metric}
                <span style={{ color: "#6e7681" }}>
                  {" "}
                  · {b.value === null ? b.status : `${b.value}`}
                </span>
              </div>
            ))}
          </Grid>
        </Card>
      ))}
    </PortalShell>
  );
}
