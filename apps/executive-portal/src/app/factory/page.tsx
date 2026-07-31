import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Dot, Bar } from "@/components/ui";
import {
  executiveReadiness,
  assembleProduct,
  compositionByKey,
  FACTORY_CHECKLIST,
} from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function FactoryPage() {
  const r = executiveReadiness();
  const salon = compositionByKey("salon_ai");
  const asm = salon ? assembleProduct(salon) : null;

  return (
    <PortalShell view="factory">
      <Grid min={160}>
        <Tile
          label="Platform completion"
          value={`${r.platformCompletionPct}%`}
          accent="#3fb950"
        />
        <Tile
          label="Factory completion"
          value={`${r.factoryCompletionPct}%`}
          accent="#d29922"
        />
        <Tile label="Registered modules" value={r.moduleCounts.total} />
        <Tile
          label="Products assemblable"
          value={r.productsAssemblable}
          accent="#3fb950"
        />
      </Grid>

      {asm && (
        <Card
          title="Reference assembly — SalonAI"
          sub="A product assembled entirely from registered modules; no new foundational module required."
        >
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <Dot health={asm.assemblable ? "green" : "red"} />
            {asm.assemblable ? "Assemblable from registered modules" : "Blocked"} ·
            foundation {asm.foundationReadinessPct}% · {asm.builtCount}/
            {asm.requiredCount} modules · {asm.sharedSpineCount} from the shared spine
          </div>
          <Bar
            label="Foundation readiness"
            pct={asm.foundationReadinessPct}
            sub={`${asm.builtCount}/${asm.requiredCount}`}
          />
        </Card>
      )}

      <Card
        title="Factory capability checklist"
        sub="What the Software Factory needs to operate."
      >
        {FACTORY_CHECKLIST.map((i) => (
          <div
            key={i.capability}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 0",
              borderBottom: "1px solid #1c2128",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "#8b949e" }}>{i.capability}</span>
            <span>
              <Dot
                health={i.score === 1 ? "green" : i.score === 0.5 ? "yellow" : "red"}
              />
              {i.score === 1
                ? "In place"
                : i.score === 0.5
                  ? "Code done / gated"
                  : "Not yet"}
            </span>
          </div>
        ))}
      </Card>
    </PortalShell>
  );
}
