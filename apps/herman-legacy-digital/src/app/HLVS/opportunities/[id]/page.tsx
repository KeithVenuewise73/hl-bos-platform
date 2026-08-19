import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Badge, Row, Empty, colors } from "@/hlvs/components/ui";
import {
  ProvisioningBanner,
  ReuseSection,
  FactorySection,
  EvidenceList,
  DiscoverySection,
} from "@/hlvs/components/sections";
import { EvidenceForm, DecisionForm } from "@/hlvs/components/Forms";
import { getOpportunity } from "@/hlvs/lib/data";
import { getViewer } from "@/hlvs/lib/session";
import { canDecide, canManage } from "@/hlvs/lib/authz";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, viewer] = await Promise.all([getOpportunity(id), getViewer()]);
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
