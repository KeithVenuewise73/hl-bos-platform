import { checklistFor, defectState, unitStatuses, text } from "@hl-bos/tms";
import { fleetCall, requireScreen, snapshotFor } from "@/lib/guard.ts";
import { PageTitle } from "@/components/ui.tsx";
import { DvirForm, type DvirUnit } from "@/components/DvirForm.tsx";

export const dynamic = "force-dynamic";

/** Workflow A: the driver's phone screen. */
export default async function DriverInspection() {
  const ctx = await requireScreen("driver_dvir");
  const s = await snapshotFor(ctx);
  // Configurable templates add required items per equipment type (P002).
  const templates = await fleetCall<{ equipmentType: string; items: string[] }[]>(
    ctx,
    "templates",
  );
  const extra = new Map(templates.map((t) => [t.equipmentType, t.items]));
  const live = new Map(unitStatuses(s).map((u) => [u.id, u]));
  const units: DvirUnit[] = (s.state.payload?.assets ?? [])
    .filter((a) => a.status !== "Inactive")
    .map((a) => {
      const id = text(a.id);
      const unit = {
        type: text(a.type, ""),
        tankConfig: text(a.tankConfig, "Not applicable"),
      };
      // Repairs certified since a report on this unit, not yet acknowledged by THIS driver.
      const pendingReviews = s.inspections
        .filter((i) => i.payload.asset === id)
        .filter((i) => {
          const acts = s.inspection_actions.filter(
            (x) => x.payload.inspection === i.id,
          );
          const st = defectState(i.payload, acts);
          const mine = acts.some(
            (x) => x.actor === ctx.user.id && x.payload.kind === "review",
          );
          return (st === "certified" || st === "reviewed") && !mine;
        })
        .map((i) => {
          const acts = s.inspection_actions.filter(
            (x) => x.payload.inspection === i.id,
          );
          const cert = [...acts].reverse().find((x) => x.payload.kind === "certify");
          return {
            inspection: i.id,
            defects: i.payload.checks
              .filter((c) => c.result === "Defect")
              .map((c) => c.item)
              .join(", "),
            certification: `${cert?.payload.resolution ?? ""}: ${cert?.payload.note ?? ""} — ${cert?.payload.signature ?? ""}`,
          };
        });
      return {
        id,
        name: text(a.name, id),
        type: unit.type,
        status: live.get(id)?.status ?? "Available",
        checklist: [...checklistFor(unit), ...(extra.get(unit.type) ?? [])],
        pendingReviews,
      };
    });
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle
        title="Vehicle inspection"
        sub={`Digital DVIR · signed as ${ctx.user.name}`}
      />
      <DvirForm units={units} driverName={ctx.user.name} />
    </div>
  );
}
