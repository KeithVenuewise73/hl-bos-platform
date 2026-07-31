import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row, Dot } from "@/components/ui";
import { customerOperations } from "@/lib/intelligence-data";

export const dynamic = "force-dynamic";

const READINESS_HEALTH: Record<string, "green" | "yellow" | "red"> = {
  operational: "green",
  assemblable: "green",
  partial: "yellow",
  gap: "red",
};

export default function OperationsPage() {
  const { lifecycle, visibilityAi, crm, ceoDashboard, validation } =
    customerOperations();
  const m = ceoDashboard.measurable;
  const op = ceoDashboard.operational;

  return (
    <PortalShell view="operations">
      <Card
        title="CEO Operations — Measurable"
        sub="Real, computed Factory & portfolio metrics."
      >
        <Grid min={150}>
          <Tile label="Portfolio products" value={m.portfolioProducts} />
          <Tile label="Assemblable now" value={m.assemblableNow} accent="#3fb950" />
          <Tile label="Need engineering" value={m.needsEngineering} />
          <Tile label="Built engines" value={m.builtEngines} />
          <Tile
            label="Manufactured & launched"
            value={m.productsManufacturedAndLaunched}
            hint="none launched yet"
          />
          <Tile
            label="Capability reuse"
            value={`${m.capabilityReusePct}%`}
            accent="#58a6ff"
          />
          <Tile label="Avg assembly" value={`${m.portfolioAvgAssemblyPct}%`} />
          <Tile label="Net-new items" value={m.netNewEngineeringItems} />
        </Grid>
      </Card>

      <Card
        title="CEO Operations — Operational"
        sub="Zero until Herman Legacy has operating customers. Measured, never fabricated."
      >
        <div style={{ fontSize: 12, color: "#d29922", marginBottom: 8 }}>{op.note}</div>
        <Grid min={140}>
          <Tile label="Current leads" value={op.currentLeads} />
          <Tile label="Qualified opps" value={op.qualifiedOpportunities} />
          <Tile label="Assessments" value={op.assessmentsCompleted} />
          <Tile label="Proposals out" value={op.proposalsOutstanding} />
          <Tile label="Projects active" value={op.projectsActive} />
          <Tile label="MRR" value={`$${op.mrr}`} />
          <Tile label="ARR" value={`$${op.arr}`} />
          <Tile label="Customer health" value="—" hint="no customers" />
        </Grid>
      </Card>

      <Card
        title="Customer Manufacturing Lifecycle"
        sub={`21 stages riding on the reused engagement machine · ${lifecycle.assemblablePct}% assemblable · path ${lifecycle.engagementPathValid ? "valid" : "INVALID"}`}
      >
        {lifecycle.stages.map((s) => (
          <div
            key={s.seq}
            style={{
              padding: "7px 0",
              borderBottom: "1px solid #1c2128",
              fontSize: 13,
            }}
          >
            <span>
              <Dot health={READINESS_HEALTH[s.readiness] ?? "unknown"} />
              {s.seq}. {s.name}
            </span>
            <span style={{ float: "right", fontSize: 12, color: "#8b949e" }}>
              {s.engagementStageLabel} · {s.assemblyPct}%
              {s.netNew.length ? ` · net-new: ${s.netNew.join(", ")}` : ""}
            </span>
          </div>
        ))}
      </Card>

      <Card
        title="Integrated Systems"
        sub="VisibilityAI · HL-BTI · Intelligence CRM — assembled, not rebuilt."
      >
        <Row
          k="VisibilityAI"
          v={`${visibilityAi.supportedCount}/9 functions supported · ${visibilityAi.noRedesignRequired ? "no redesign" : "redesign needed"}`}
        />
        <Row
          k="Intelligence CRM"
          v={`${crm.total} entities · ${crm.reuseCount} reuse · ${crm.netNewCount} net-new (${crm.netNewEntities.join(", ")})`}
        />
        <Row
          k="No duplicate systems"
          v={
            validation.noDuplicateSystems
              ? "✓ every stage backed by an existing asset"
              : "⚠ duplicate-system risk"
          }
        />
        <Row
          k="End-to-end validation"
          v={
            validation.ok
              ? "✓ Discovery → VisibilityAI → HL-BTI → Proposal → Project → Deployment → Subscription → Renewal"
              : `⚠ ${validation.failures.join("; ")}`
          }
        />
      </Card>
    </PortalShell>
  );
}
