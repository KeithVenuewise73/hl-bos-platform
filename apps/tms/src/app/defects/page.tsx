import { defectRows } from "@hl-bos/tms";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import { PageTitle } from "@/components/ui.tsx";
import { DefectQueue } from "@/components/DefectQueue.tsx";

export const dynamic = "force-dynamic";

/** Workflow B: review the defect, record the corrective action, return the unit to service. */
export default async function Defects() {
  const ctx = await requireScreen("defects");
  const s = await snapshotFor(ctx);
  return (
    <div>
      <PageTitle
        title="Defect queue"
        sub="Acknowledge, assess, and certify repairs. Every action is signed and cannot be edited afterwards."
      />
      <DefectQueue
        rows={defectRows(s)}
        signer={ctx.user.name}
        maintenanceLicensed={ctx.activeModules.includes("maintenance")}
      />
    </div>
  );
}
