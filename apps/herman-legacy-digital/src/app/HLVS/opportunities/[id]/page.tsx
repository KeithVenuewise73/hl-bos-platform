import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Badge, Row, Empty, colors } from "@/hlvs/components/ui";
import {
  ProvisioningBanner,
  ReuseSection,
  FactorySection,
  EvidenceList,
  DiscoverySection,
  ScorePair,
  ComponentBreakdown,
  NotYetResearched,
} from "@/hlvs/components/sections";
import { EvidenceForm, DecisionForm } from "@/hlvs/components/Forms";
import { getOpportunity } from "@/hlvs/lib/data";
import { opportunityScore } from "@/hlvs/lib/intelligence";
import { getViewer } from "@/hlvs/lib/session";
import { canDecide, canManage } from "@/hlvs/lib/authz";
import { NOT_YET_RESEARCHED_AT_LEVEL_1 } from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, viewer, score] = await Promise.all([
    getOpportunity(id),
    getViewer(),
    opportunityScore(id),
  ]);
  const o = detail.opportunity;

  return (
    <StudioShell view="opportunity_detail">
      <ProvisioningBanner detail={detail} />
      {!o ? (
        <Card>
          <Empty>
            {detail.provisioning === "ready"
              ? "Opportunity not found."
              : "No live data in this environment — the Venture Studio schema is not yet provisioned."}
          </Empty>
        </Card>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "baseline",
            }}
          >
            <h1 style={{ fontSize: 20, margin: 0 }}>{o.title}</h1>
            <span style={{ display: "flex", gap: 6 }}>
              {o.is_demonstration ? (
                <Badge tone="warn">DEMONSTRATION / NOT LIVE</Badge>
              ) : null}
              <Badge tone="accent">{o.status}</Badge>
            </span>
          </div>
          <Card>
            <Row k="Summary" v={o.summary || "—"} />
            <Row k="Industry" v={o.industry || "—"} />
            <Row k="Type" v={o.opportunity_type ?? "—"} />
            <Row
              k="Source"
              v={
                o.source_url ? (
                  <a href={o.source_url} style={{ color: colors.accent }}>
                    {o.source_type}
                  </a>
                ) : (
                  o.source_type
                )
              }
            />
            <Row k="Related product" v={o.related_product ?? "—"} />
          </Card>

          {/*
            The executive card. Two scores, kept apart, each with the component
            breakdown that produced it — and an explicit list of what has NOT
            been researched, so a blank is never mistaken for "nothing to report".
          */}
          <Card
            title="Executive assessment"
            sub={
              score
                ? `Analysis level ${score.analysis_level} · scoring ${score.scoring_version} · ${new Date(score.computed_at).toISOString().slice(0, 10)}`
                : "Not scored"
            }
          >
            {!score ? (
              <Empty>
                This opportunity has not been scored. That is a missing analysis, not a
                low score — nothing here is being withheld.
              </Empty>
            ) : (
              <>
                <ScorePair
                  popularity={score.popularity_score}
                  popularityStatus={score.popularity_status}
                  suitability={score.suitability_score}
                  suitabilityStatus={score.suitability_status}
                  rising={score.rising_score}
                  risingStatus={score.rising_status}
                />
                <ComponentBreakdown
                  title="Popularity — measured from repository metrics"
                  components={score.popularity_components ?? []}
                />
                <ComponentBreakdown
                  title="HLG suitability — inferred from observable properties, not measured"
                  components={score.suitability_components ?? []}
                />
                <div style={{ fontSize: 11, color: colors.dim, marginTop: 10 }}>
                  {score.method}
                </div>
                <NotYetResearched fields={NOT_YET_RESEARCHED_AT_LEVEL_1} />
              </>
            )}
          </Card>
          <DiscoverySection detail={detail} />
          <ReuseSection detail={detail} />
          <EvidenceList detail={detail} />
          {canManage(viewer.role) ? (
            <Card title="Attach evidence">
              <EvidenceForm opportunityId={o.id} />
            </Card>
          ) : null}
          <FactorySection detail={detail} />

          <Card
            title="CEO Decision"
            sub="The single authoritative act — distinct from any AI recommendation."
          >
            {canDecide(viewer.role) ? (
              <DecisionForm opportunityId={o.id} />
            ) : (
              <Empty>Only the CEO role may record the authoritative decision.</Empty>
            )}
          </Card>
        </>
      )}
    </StudioShell>
  );
}
