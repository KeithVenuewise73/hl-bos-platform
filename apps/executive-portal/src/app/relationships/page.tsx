import { PortalShell } from "@/components/PortalShell";
import { Card } from "@/components/ui";
import { buildCatalog, neighborhood } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

// A few anchor assets whose dependency webs are most useful to executives.
const ANCHORS = [
  "prod.hl-bti",
  "svc.identity",
  "svc.ai-gateway",
  "mod.discovery-engine",
];

export default function RelationshipsPage() {
  const catalog = buildCatalog();
  const byId = (id: string) => catalog.assets.find((a) => a.id === id);

  return (
    <PortalShell view="relationships">
      <Card
        title="Asset Relationships"
        sub="Dependencies and dependents across the estate."
      >
        {ANCHORS.map((id) => {
          const asset = byId(id);
          if (!asset) return null;
          const n = neighborhood(catalog, id);
          return (
            <div
              key={id}
              style={{ padding: "10px 0", borderBottom: "1px solid #1c2128" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{asset.name}</div>
              <div style={{ fontSize: 12, color: "#8b949e", marginTop: 3 }}>
                Uses/provides:{" "}
                {n.outgoing
                  .map((r) => `${r.kind} → ${byId(r.to)?.name ?? r.to}`)
                  .join(" · ") || "—"}
              </div>
              <div style={{ fontSize: 12, color: "#6e7681", marginTop: 2 }}>
                Depended on by:{" "}
                {n.incoming
                  .map((e) => byId(e.from)?.name ?? e.from)
                  .slice(0, 8)
                  .join(" · ") || "—"}
              </div>
            </div>
          );
        })}
      </Card>
    </PortalShell>
  );
}
