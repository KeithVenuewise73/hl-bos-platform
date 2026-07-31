import { PortalShell } from "@/components/PortalShell";
import { Card, Row } from "@/components/ui";
import { MODULE_REGISTRY, MATURITY_LABEL } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function ModulesPage() {
  return (
    <PortalShell view="modules">
      <Card
        title="Engineering Module Registry"
        sub={`${MODULE_REGISTRY.length} reusable modules the Software Factory assembles from.`}
      >
        {MODULE_REGISTRY.map((m) => (
          <Row
            key={m.key}
            k={m.name}
            v={
              <span style={{ fontSize: 12 }}>
                {m.schema} · {MATURITY_LABEL[m.maturity]}
                {m.provides.length ? ` · provides ${m.provides.join(", ")}` : ""}
              </span>
            }
          />
        ))}
      </Card>
    </PortalShell>
  );
}
