import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Dot } from "@/components/ui";
import { deploymentStatus } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function DeploymentPage() {
  const d = deploymentStatus();
  return (
    <PortalShell view="deployment">
      <Grid min={160}>
        <Tile
          label="Edge functions deployed"
          value={d.edgeFunctionsDeployed}
          accent="#f85149"
        />
        <Tile
          label="Runtime switched on"
          value={d.runtimeSwitchedOn ? "Yes" : "No"}
          accent="#d29922"
        />
        <Tile label="Modules live" value={d.live} accent="#3fb950" />
        <Tile label="Built, not deployed" value={d.builtUndeployed} accent="#d29922" />
      </Grid>
      <Card title="Deployment Status" sub={d.note}>
        {d.modules.map((m) => (
          <div
            key={m.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "5px 0",
              borderBottom: "1px solid #1c2128",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "#8b949e" }}>{m.name}</span>
            <span>
              <Dot health={m.maturity === "live" ? "green" : "yellow"} />
              {m.label}
            </span>
          </div>
        ))}
      </Card>
    </PortalShell>
  );
}
