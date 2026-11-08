import { defectRows, isOutstanding, text } from "@hl-bos/tms";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import { Card, Empty, PageTitle } from "@/components/ui.tsx";
import { MaintenanceForms } from "@/components/MaintenanceForms.tsx";

export const dynamic = "force-dynamic";

export default async function Maintenance({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; inspection?: string }>;
}) {
  const ctx = await requireScreen("maintenance");
  const q = await searchParams;
  const s = await snapshotFor(ctx);
  const work = s.state.payload?.work ?? [];
  const units = (s.state.payload?.assets ?? []).map((a) => text(a.id));
  const open = defectRows(s).filter(isOutstanding);
  const canManage = ctx.user.role === "owner" || ctx.user.role === "manager";
  return (
    <div className="space-y-4">
      <PageTitle
        title="Maintenance"
        sub="Work orders, service records and repair cost. Preventive-maintenance schedules are not built yet."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Defects waiting for repair (${open.length})`}>
          {open.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <ul className="text-sm">
              {open.map((d) => (
                <li key={d.inspection.id}>
                  • <b>{d.unitId}</b> {d.defects.map((x) => x.item).join(", ")}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Work orders">
          {work.length === 0 ? (
            <Empty>No work orders.</Empty>
          ) : (
            <ul data-testid="work-orders" className="space-y-1 text-sm">
              {work.map((w) => (
                <li key={text(w.id)}>
                  <b>{text(w.id)}</b> · {text(w.asset)} · {text(w.title, "")} ·{" "}
                  {text(w.status, "")}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <MaintenanceForms
        units={units}
        work={work.map((w) => ({
          id: text(w.id),
          asset: text(w.asset),
          status: text(w.status, ""),
        }))}
        canManage={canManage}
        preset={q}
      />
      <Card title="Service records">
        {s.unit_records.length === 0 ? (
          <Empty>No service records yet.</Empty>
        ) : (
          <table data-testid="service-records" className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th>Date</th>
                <th>Unit</th>
                <th>Category</th>
                <th>Title</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {s.unit_records.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1">{String(r.payload.date)}</td>
                  <td>{r.asset}</td>
                  <td>{String(r.payload.category)}</td>
                  <td>{String(r.payload.title)}</td>
                  <td className="text-right">
                    ${(Number(r.payload.costCents) / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
