import { StudioShell } from "@/components/StudioShell";
import { ProvisioningBanner, EvaluationDims } from "@/components/sections";
import { Card, Empty } from "@/components/ui";
import { getOpportunity } from "@/lib/data";

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
