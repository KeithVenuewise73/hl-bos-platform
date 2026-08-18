import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Empty } from "@/hlvs/components/ui";
import { ProvisioningBanner } from "@/hlvs/components/sections";
import { DecisionForm } from "@/hlvs/components/Forms";
import { getOpportunity } from "@/hlvs/lib/data";
import { getViewer } from "@/hlvs/lib/session";
import { canDecide } from "@/hlvs/lib/authz";

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
