import { Card, Empty, Row } from "@hl-bos/ui";
import { LIFECYCLE, PLANES, type Plane } from "@hl-bos/lifecycle";
import { listTenants } from "@/lib/tenants";
import { hasRealProvider, registeredProviders } from "@/lib/deploy";

export const dynamic = "force-dynamic";

const PLANE_COLOR: Record<Plane, string> = {
  "remote-safe": "#3fb950",
  "local-privileged": "#f85149",
  promoted: "#d29922",
};

function PlaneTag({ plane }: { plane: Plane }) {
  const color = PLANE_COLOR[plane];
  return (
    <span
      title={PLANES[plane].runsIn}
      style={{
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        padding: "2px 8px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {PLANES[plane].label}
    </span>
  );
}

export default function Page() {
  const tenants = listTenants();
  const providers = registeredProviders();

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Herman Legacy Cloud</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          The hosted execution plane of Headquarters. Exposes only remotely-safe
          operations — it shells out to nothing.
        </p>
      </header>

      <Card
        title="Companies"
        sub="Every Herman Legacy company is a tenant. External customers use the identical path."
      >
        {tenants.tenants.length === 0 ? (
          <Empty>{tenants.reason}</Empty>
        ) : (
          tenants.tenants.map((t) => (
            <Row key={t.id} k={t.name} v={`${t.tenantClass} · ${t.status}`} />
          ))
        )}
      </Card>

      <Card
        title="Company lifecycle"
        sub="Provision → Operate → Monitor → Update → Back up → Retire. Each action is tagged with the plane it runs on."
      >
        <div style={{ display: "grid", gap: 18 }}>
          {LIFECYCLE.map((stage) => (
            <div key={stage.key}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{stage.title}</div>
              <div style={{ fontSize: 12.5, color: "#8b949e", margin: "2px 0 8px" }}>
                {stage.summary}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {stage.actions.map((action) => (
                  <div
                    key={action.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "start",
                      padding: "6px 0",
                      borderBottom: "1px solid #1c2128",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13 }}>{action.title}</div>
                      <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.5 }}>
                        {action.summary}
                      </div>
                    </div>
                    <PlaneTag plane={action.plane} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Deployments"
        sub="Provider-agnostic. Connecting a host is a config change here, not a redesign."
      >
        {hasRealProvider() ? (
          <Empty>A hosting provider is connected.</Empty>
        ) : (
          <Empty>
            No hosting provider connected yet — deploys are not available. Registered
            adapters: {providers.join(", ")}.
          </Empty>
        )}
      </Card>
    </main>
  );
}
