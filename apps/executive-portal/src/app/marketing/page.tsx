import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row, Dot } from "@/components/ui";
import { marketingUnit } from "@/lib/intelligence-data";

export const dynamic = "force-dynamic";

const VERDICT_HEALTH: Record<string, "green" | "yellow" | "red"> = {
  reuse: "green",
  reuse_cross_platform: "green",
  net_new: "yellow",
};

export default function MarketingPage() {
  const { operatingModel, studio, content, campaigns, growth } = marketingUnit();
  const reuse = operatingModel.reuse;
  const m = growth.measurable;

  return (
    <PortalShell view="marketing">
      <Card
        title="Herman Legacy Marketing — Growth (Measurable)"
        sub="Real, computed. Growth metrics stay zero until campaigns publish."
      >
        <Grid min={150}>
          <Tile
            label="Marketing reuse"
            value={`${m.marketingReusePct}%`}
            accent="#3fb950"
          />
          <Tile
            label="Factory reuse"
            value={`${m.factoryCapabilityReusePct}%`}
            accent="#58a6ff"
          />
          <Tile label="Content types" value={m.contentTypesAvailable} />
          <Tile label="Campaigns defined" value={m.campaignsDefined} />
          <Tile label="Campaigns live" value={m.campaignsLive} hint="none live yet" />
          <Tile label="Channels" value={m.publishingChannelsCovered} />
        </Grid>
        <div style={{ fontSize: 12, color: "#d29922", marginTop: 8 }}>
          {growth.growth.note}
        </div>
      </Card>

      <Card title="Capability Reuse Assessment" sub={reuse.summary}>
        <Grid min={170}>
          {reuse.systems.map((s) => (
            <div key={s.name} style={{ fontSize: 12.5 }}>
              <Dot health={VERDICT_HEALTH[s.verdict] ?? "unknown"} />
              {s.name}
              <span style={{ color: "#6e7681" }}>
                {" "}
                · {s.verdict.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </Grid>
      </Card>

      <Card title="AI Marketing Studio" sub={studio.summary}>
        {studio.orchestrationFlow.map((step, i) => (
          <div key={i} style={{ fontSize: 12.5, padding: "3px 0", color: "#c9d1d9" }}>
            {step}
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: "#d29922", marginTop: 6 }}>
          External AI providers: not wired — deferred until CEO approval.
        </div>
      </Card>

      <Card
        title="Content Manufacturing"
        sub={`${content.typeCount} content types · one repeatable ${content.workflow.length}-stage workflow`}
      >
        <Grid min={130}>
          {content.types.map((t) => (
            <div key={t.name} style={{ fontSize: 12 }}>
              {t.name}
              <span style={{ color: "#6e7681" }}> · {t.channel}</span>
            </div>
          ))}
        </Grid>
      </Card>

      <Card
        title="Initial Campaigns"
        sub="Herman Legacy · Venuewise · HSCS — all draft (nothing live)."
      >
        {campaigns.campaigns.map((c) => (
          <div
            key={c.key}
            style={{
              padding: "9px 0",
              borderBottom: "1px solid #1c2128",
              fontSize: 13,
            }}
          >
            <div>
              <Dot health="yellow" />
              <strong>{c.client}</strong>
              <span style={{ color: "#6e7681" }}> · {c.status}</span>
            </div>
            <div
              style={{ fontSize: 11.5, color: "#8b949e", marginLeft: 17, marginTop: 2 }}
            >
              {c.businessObjective}
            </div>
            <div style={{ fontSize: 11, color: "#6e7681", marginLeft: 17 }}>
              {c.contentTypes.join(", ")} → {c.publishingChannels.join(", ")}
            </div>
          </div>
        ))}
      </Card>

      <Card
        title="Commercialization (all five layers)"
        sub="Marketing supports every Commercialization Law #1 layer."
      >
        {operatingModel.commercialization.map((c) => (
          <Row
            key={c.layer}
            k={`${c.layer} · ${c.name}`}
            v={c.howMarketingBecomesThis}
          />
        ))}
      </Card>
    </PortalShell>
  );
}
