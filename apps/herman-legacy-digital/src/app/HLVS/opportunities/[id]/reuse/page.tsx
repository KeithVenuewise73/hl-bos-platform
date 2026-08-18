import { StudioShell } from "@/hlvs/components/StudioShell";
import { ProvisioningBanner, ReuseSection } from "@/hlvs/components/sections";
import { getOpportunity } from "@/hlvs/lib/data";

export const dynamic = "force-dynamic";

export default async function ReusePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOpportunity(id);
  return (
    <StudioShell view="reuse">
      <h1 style={{ fontSize: 20 }}>Reuse Analysis</h1>
      <ProvisioningBanner detail={detail} />
      <ReuseSection detail={detail} />
    </StudioShell>
  );
}
