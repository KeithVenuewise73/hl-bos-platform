import { PortalShell } from "@/components/PortalShell";
import { Card, Dot } from "@/components/ui";
import { ceoDecisions } from "@/lib/portal-data";
import type { Health } from "@/components/ui";

export const dynamic = "force-dynamic";

function health(status: string): Health {
  if (status === "DONE") return "green";
  if (status === "IN PROGRESS") return "yellow";
  return "red";
}

export default function DecisionsPage() {
  const decisions = ceoDecisions();
  return (
    <PortalShell view="decisions">
      <Card
        title="CEO Decision Status"
        sub="Sensitive — visible to Platform Owner and Executive only."
      >
        {decisions.map((d) => (
          <div
            key={d.title}
            style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}
          >
            <div style={{ fontSize: 13.5 }}>
              <Dot health={health(d.status)} />
              {d.title}
            </div>
            <div
              style={{ fontSize: 11.5, color: "#8b949e", marginLeft: 17, marginTop: 2 }}
            >
              <strong>{d.status}</strong> — {d.note}
            </div>
          </div>
        ))}
      </Card>
    </PortalShell>
  );
}
