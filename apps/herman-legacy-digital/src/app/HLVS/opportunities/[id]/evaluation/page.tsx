import { StudioShell } from "@/hlvs/components/StudioShell";
import { ProvisioningBanner, EvaluationDims } from "@/hlvs/components/sections";
import { Card, Empty } from "@/hlvs/components/ui";
import { getOpportunity } from "@/hlvs/lib/data";

export const dynamic = "force-dynamic";

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOpportunity(id);
  return (
    <StudioShell view="evaluation">
      <h1 style={{ fontSize: 20 }}>Evaluation</h1>
      <ProvisioningBanner detail={detail} />
      <EvaluationDims />
      <Card title="Recorded evaluation">
        <Empty>
          No evaluation recorded yet. Scores are captured with methodology, evidence
          basis and confidence; unknown dimensions are excluded (absent is not zero).
        </Empty>
      </Card>
    </StudioShell>
  );
}
