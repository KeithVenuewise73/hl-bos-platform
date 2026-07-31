import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row } from "@/components/ui";
import { platformHealth } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function PlatformHealthPage() {
  const h = platformHealth();
  return (
    <PortalShell view="platform_health">
      <Grid min={150}>
        <Tile label="Schemas" value={h.schemas} />
        <Tile label="Tables" value={h.tables} />
        <Tile label="RLS coverage" value={h.rlsCoverage} accent="#3fb950" />
        <Tile label="Error advisories" value={h.errorAdvisories} accent="#3fb950" />
      </Grid>
      <Card title="Platform Health" sub={h.source}>
        {h.databases.map((d) => (
          <Row
            key={d.name}
            k={d.name}
            v={`${d.tables} table${d.tables === 1 ? "" : "s"}`}
          />
        ))}
      </Card>
    </PortalShell>
  );
}
