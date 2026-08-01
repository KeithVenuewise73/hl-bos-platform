import { StudioShell } from "@/components/StudioShell";
import { ProvisioningBanner, FactorySection } from "@/components/sections";
import { getOpportunity } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FactoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOpportunity(id);
  return (
    <StudioShell view="factory_preview">
      <h1 style={{ fontSize: 20 }}>Factory Readiness Preview</h1>
      <ProvisioningBanner detail={detail} />
      <FactorySection detail={detail} />
    </StudioShell>
  );
}
