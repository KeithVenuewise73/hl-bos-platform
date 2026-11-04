import Link from "next/link";
import { notFound } from "next/navigation";
import { defectRows, unitStatuses, type TeamMember, text } from "@hl-bos/tms";
import { demo } from "@/lib/demo.ts";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import {
  Card,
  Empty,
  Expiry,
  PageTitle,
  StatusPill,
  fmtTime,
} from "@/components/ui.tsx";
import { VehicleEditor } from "@/components/VehicleEditor.tsx";

export const dynamic = "force-dynamic";

export default async function Vehicle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireScreen("fleet_detail");
  const s = await snapshotFor(ctx);
  const a = s.state.payload?.assets.find((x) => text(x.id) === id);
  if (!a) notFound();
  const live = unitStatuses(s).find((u) => u.id === id)!;
  const inspections = s.inspections.filter((i) => i.payload.asset === id).reverse();
  const defects = defectRows(s).filter((d) => d.unitId === id);
  const services = s.unit_records.filter((r) => r.asset === id);
  const work = (s.state.payload?.work ?? []).filter((w) => w.asset === id);
  let drivers: TeamMember[] = [];
  if (ctx.user.role === "owner" || ctx.user.role === "manager") {
    const t = await (
      await demo()
    ).backend.call<{ members: TeamMember[] }>(ctx.user.id, "team", {
      workspace: ctx.company.id,
    });
    drivers = t.members.filter((m) => m.units.includes(id));
  }
  const canEdit = ctx.user.role === "owner" || ctx.user.role === "manager";
  return (
    <div className="space-y-4">
      <PageTitle
        title={`${id} · ${text(a.name, "")}`}
        sub={`${text(a.type, "")} · ${text(a.tankConfig, "")}`}
      />
      <div className="flex items-center gap-2">
        <StatusPill status={live.status} />
        {live.openDefects ? (
          <span className="text-sm text-warn">
            {live.openDefects} outstanding defect report(s)
          </span>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Profile">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            {(["year", "make", "model", "vin", "plate", "odometer"] as const).map(
              (k) => (
                <div key={k} className="contents">
                  <dt className="text-muted capitalize">{k}</dt>
                  <dd>
                    {a[k] === undefined || a[k] === "" ? (
                      <span className="text-muted">not recorded</span>
                    ) : (
                      text(a[k])
                    )}
                  </dd>
                </div>
              ),
            )}
            <dt className="text-muted">Registration</dt>
            <dd>
              <Expiry date={a.registrationExpires} />
            </dd>
            <dt className="text-muted">Assigned drivers</dt>
            <dd>
              {drivers.length ? (
                drivers.map((d) => d.email).join(", ")
              ) : (
                <span className="text-muted">
                  {canEdit ? "none" : "visible to managers"}
                </span>
              )}
            </dd>
          </dl>
          {canEdit ? <VehicleEditor unit={a} /> : null}
        </Card>
        <Card title="Maintenance status">
          {defects.length === 0 && work.length === 0 && services.length === 0 ? (
            <Empty>No defects, work orders or service records.</Empty>
          ) : null}
          <ul className="space-y-1 text-sm">
            {defects.map((d) => (
              <li key={d.inspection.id}>
                Defect · {d.defects.map((x) => x.item).join(", ")} · <b>{d.state}</b>
              </li>
            ))}
            {work.map((w) => (
              <li key={text(w.id)}>
                Work order {text(w.id)} · {text(w.title, "")} ·{" "}
                <b>{text(w.status, "")}</b>
              </li>
            ))}
            {services.map((r) => (
              <li key={r.id}>
                Service · {String(r.payload.title)} · {String(r.payload.date)} · $
                {(Number(r.payload.costCents) / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Inspection history">
        {inspections.length === 0 ? (
          <Empty>No inspections recorded.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {inspections.map((i) => (
              <li key={i.id}>
                <Link className="text-brand underline" href={`/inspections/${i.id}`}>
                  {i.payload.phase} · {fmtTime(i.payload.inspectedAt)}
                </Link>{" "}
                · {i.payload.driver} ·{" "}
                {i.payload.checks.filter((c) => c.result === "Defect").length} defect(s)
                · odometer {i.payload.odometer}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
