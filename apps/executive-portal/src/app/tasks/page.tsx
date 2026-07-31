import { PortalShell } from "@/components/PortalShell";
import { Card, Dot, Empty } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { canView } from "@/lib/authz";
import { taskSections, type Severity } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

const SEV: Record<Severity, "red" | "yellow" | "green"> = {
  high: "red",
  medium: "yellow",
  low: "yellow",
  info: "green",
};

const PROV_LABEL = {
  live: "live",
  sample: "sample",
  not_connected: "not connected",
} as const;

export default async function TasksPage() {
  const viewer = await getViewer();
  const includeSensitive = canView(viewer.role, "intelligence");
  const sections = taskSections({ includeSensitive });
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <PortalShell view="tasks">
      <p style={{ fontSize: 12.5, color: "#8b949e", marginTop: 0 }}>
        A single queue of everything awaiting an executive decision — aggregated from
        approvals, the Software Factory, government bids, transformation reviews and
        platform alerts. <strong>Read-only</strong>: nothing acts until you approve it.
        {total} item(s) across {sections.length} sources.
      </p>

      {sections.map((s) => (
        <Card
          key={s.key}
          title={`${s.title} · ${s.items.length}`}
          sub={`Source: ${PROV_LABEL[s.provenance]}${s.note ? ` — ${s.note}` : ""}`}
        >
          {s.items.length === 0 ? (
            <Empty>{s.note ?? "Nothing here."}</Empty>
          ) : (
            s.items.map((it) => (
              <div
                key={it.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #1c2128",
                  fontSize: 12.5,
                }}
              >
                <Dot health={SEV[it.severity]} />
                <strong>{it.title}</strong>
                <span style={{ color: "#6e7681" }}> · {it.status}</span>
                <div style={{ color: "#8b949e", marginLeft: 17, marginTop: 2 }}>
                  {it.detail}
                </div>
              </div>
            ))
          )}
        </Card>
      ))}
    </PortalShell>
  );
}
