import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Grid, Empty, Badge, colors } from "@/hlvs/components/ui";
import { ProvisioningBanner } from "@/hlvs/components/sections";
import { statusCounts } from "@/hlvs/lib/data";
import { OPPORTUNITY_STATUSES } from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

export default async function Overview() {
  // Counted by the database, not by tallying a capped page — the corpus is far
  // larger than any single page.
  const summary = await statusCounts(OPPORTUNITY_STATUSES);
  const list = { provisioning: summary.provisioning, items: [] as never[] };
  const counts = new Map<string, number>(Object.entries(summary.counts));

  return (
    <StudioShell view="overview">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Executive Overview</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        A CEO thinking environment: capture opportunities, weigh evidence, measure
        reuse, decide. No external intelligence is fabricated — discovery connectors
        arrive in V2-2.
      </p>
      <ProvisioningBanner detail={list} />

      <Card title="Pipeline" sub="Opportunities by status">
        {summary.total === 0 ? (
          <Empty>
            {summary.provisioning === "ready"
              ? "No opportunities captured yet. Use “New Opportunity” to add the first one."
              : "No live data in this environment — see the notice above."}
          </Empty>
        ) : (
          <Grid min={140}>
            {OPPORTUNITY_STATUSES.map((s) => (
              <div
                key={s}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {counts.get(s) ?? 0}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.dim,
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </div>
              </div>
            ))}
          </Grid>
        )}
      </Card>

      <Grid min={260}>
        <Card title="Highest reuse" sub="The trustworthy headline metric (measured)">
          <Empty>
            Reuse rankings appear once opportunities are captured and analyzed.
          </Empty>
        </Card>
        <Card
          title="Estimated ARR / build time"
          sub="Projections only — never booked revenue"
        >
          <Empty>
            <Badge tone="neutral">no data</Badge> — projections require evaluations;
            V2-1 never shows a fabricated ARR.
          </Empty>
        </Card>
        <Card
          title="Factory utilization"
          sub="From the hlvs Software Factory (read-only)"
        >
          <Empty>
            Wired to the Factory read model; shows real state once opportunities reach a
            Build decision.
          </Empty>
        </Card>
      </Grid>
    </StudioShell>
  );
}
