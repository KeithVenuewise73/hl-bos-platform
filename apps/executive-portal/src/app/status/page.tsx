import { PortalShell } from "@/components/PortalShell";
import { Card, Dot, Row } from "@/components/ui";
import { PLATFORM_SYSTEMS, type PlatformSystem } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

const STATUS_HEALTH: Record<
  PlatformSystem["status"],
  "green" | "yellow" | "red" | "unknown"
> = {
  live: "green",
  built_undeployed: "yellow",
  prototype: "yellow",
  planned: "unknown",
  legacy: "red",
  external: "green",
};

const STATUS_LABEL: Record<PlatformSystem["status"], string> = {
  live: "Live",
  built_undeployed: "Built, not deployed",
  prototype: "Prototype",
  planned: "Planned (not built)",
  legacy: "Legacy",
  external: "External",
};

export default function StatusPage() {
  return (
    <PortalShell view="status">
      <p style={{ fontSize: 12.5, color: "#8b949e", marginTop: 0 }}>
        Every named Herman Legacy system with its honest deployment, health, version and
        dependencies. Systems marked <em>Planned</em> do not exist yet — the page says
        so rather than implying coverage.
      </p>

      {PLATFORM_SYSTEMS.map((s) => (
        <Card key={s.name} title={s.name} sub={s.note}>
          <Row
            k="Status"
            v={
              <span>
                <Dot health={STATUS_HEALTH[s.status]} />
                {STATUS_LABEL[s.status]}
              </span>
            }
          />
          <Row k="Deployment" v={s.deployment} />
          <Row k="Version" v={s.version} />
          <Row
            k="Dependencies"
            v={s.dependencies.length ? s.dependencies.join(", ") : "—"}
          />
        </Card>
      ))}
    </PortalShell>
  );
}
