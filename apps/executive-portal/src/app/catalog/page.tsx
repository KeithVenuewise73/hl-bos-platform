import { PortalShell } from "@/components/PortalShell";
import { Card } from "@/components/ui";
import { buildCatalog, groupByKind, KIND_LABEL } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function CatalogPage() {
  const catalog = buildCatalog();
  const groups = groupByKind(catalog);
  return (
    <PortalShell view="catalog">
      <Card
        title="Enterprise Catalog"
        sub={`${catalog.assets.length} assets — the authoritative source for every Herman Legacy software asset.`}
      >
        {groups.map((g) => (
          <div
            key={g.kind}
            style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13.5,
              }}
            >
              <strong>{KIND_LABEL[g.kind].many}</strong>
              <span style={{ color: "#58a6ff", fontWeight: 700 }}>
                {g.assets.length}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 3 }}>
              {g.assets
                .slice(0, 8)
                .map((a) => a.name)
                .join(" · ")}
              {g.assets.length > 8 ? " …" : ""}
            </div>
          </div>
        ))}
      </Card>
    </PortalShell>
  );
}
