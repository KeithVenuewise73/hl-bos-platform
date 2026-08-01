import { StudioShell } from "@/components/StudioShell";
import { Card, Empty } from "@/components/ui";
import { ProvisioningBanner, EvidenceList } from "@/components/sections";
import { EvidenceForm } from "@/components/Forms";
import { getOpportunity } from "@/lib/data";
import { getViewer } from "@/lib/session";
import { canManage } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, viewer] = await Promise.all([getOpportunity(id), getViewer()]);
  return (
    <StudioShell view="evidence">
      <h1 style={{ fontSize: 20 }}>Research & Evidence</h1>
      <ProvisioningBanner detail={detail} />
      <EvidenceList detail={detail} />
      {canManage(viewer.role) && detail.opportunity ? (
        <Card title="Attach evidence">
          <EvidenceForm opportunityId={detail.opportunity.id} />
        </Card>
      ) : (
        <Card>
          <Empty>
            Attaching evidence requires an operating role and a live opportunity.
          </Empty>
        </Card>
      )}
    </StudioShell>
  );
}
