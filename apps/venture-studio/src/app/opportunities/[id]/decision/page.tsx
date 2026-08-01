import { StudioShell } from "@/components/StudioShell";
import { Card, Empty } from "@/components/ui";
import { ProvisioningBanner } from "@/components/sections";
import { DecisionForm } from "@/components/Forms";
import { getOpportunity } from "@/lib/data";
import { getViewer } from "@/lib/session";
import { canDecide } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, viewer] = await Promise.all([getOpportunity(id), getViewer()]);
  return (
    <StudioShell view="decision">
      <h1 style={{ fontSize: 20 }}>CEO Decision</h1>
      <ProvisioningBanner detail={detail} />
      <Card title="Record decision" sub="Authoritative — never an AI recommendation.">
        {canDecide(viewer.role) && detail.opportunity ? (
          <DecisionForm opportunityId={detail.opportunity.id} />
        ) : (
          <Empty>Only the CEO role may record the authoritative decision.</Empty>
        )}
      </Card>
    </StudioShell>
  );
}
