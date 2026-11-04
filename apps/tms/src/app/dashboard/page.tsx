import Link from "next/link";
import {
  defectRows,
  fleetSummary,
  isOutstanding,
  unitStatuses,
  SEVERITY,
  text,
  type TeamMember,
} from "@hl-bos/tms";
import { fleetCall, requireScreen, snapshotFor } from "@/lib/guard.ts";
import {
  Card,
  Empty,
  PageTitle,
  Stat,
  StatusPill,
  daysUntil,
  fmtTime,
} from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

/** Workflow C: vehicle status, inspection completion and outstanding defects, from the records. */
export default async function Dashboard() {
  const ctx = await requireScreen("dashboard");
  const s = await snapshotFor(ctx);
  const sum = fleetSummary(s);
  const units = unitStatuses(s);
  const open = defectRows(s).filter(isOutstanding);
  // Assignments are visible to owners and managers (fleet.api 'team').
  const team =
    ctx.role === "maintenance"
      ? null
      : await fleetCall<{ members: TeamMember[] }>(ctx, "team");
  const drivers = (team?.members ?? []).filter((m) => m.role === "driver");
  const openWork = (s.state.payload?.work ?? []).filter(
    (w) => w.status !== "Completed",
  );
  const expiring = [
    ...(s.state.payload?.assets ?? []).map((a) => ({
      what: `${text(a.id)} registration`,
      d: daysUntil(a.registrationExpires),
      inactive: a.status === "Inactive",
    })),
    ...(s.state.payload?.drivers ?? []).flatMap((d) => [
      { what: `${text(d.name)} CDL`, d: daysUntil(d.cdlExpires), inactive: false },
      {
        what: `${text(d.name)} medical card`,
        d: daysUntil(d.medicalExpires),
        inactive: false,
      },
    ]),
  ].filter((x) => !x.inactive && x.d !== null && x.d <= 30);
  const pct =
    sum.inspectionCompletion === null
      ? "—"
      : `${Math.round(sum.inspectionCompletion * 100)}%`;
  return (
    <div className="space-y-4">
      <PageTitle
        title="Fleet status"
        sub="Computed live from inspection and repair records — not from a stored status field."
      />
      <div data-testid="summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Available"
          value={<span data-k="available">{sum.available}</span>}
          tone="ok"
        />
        <Stat
          label="Out of service"
          value={<span data-k="oos">{sum.outOfService}</span>}
          tone={sum.outOfService ? "bad" : undefined}
        />
        <Stat
          label="Inspected today"
          value={
            <span data-k="completion">{`${sum.inspectedToday} of ${sum.units - sum.inactive} · ${pct}`}</span>
          }
        />
        <Stat
          label="Outstanding defects"
          value={<span data-k="defects">{sum.outstandingDefects}</span>}
          tone={sum.outstandingDefects ? "warn" : undefined}
        />
      </div>
      <Card title="Vehicles">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1">Unit</th>
              <th>Status</th>
              <th className="hidden md:table-cell">Last inspection</th>
              <th>Today</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} data-unit={u.id} className="border-t border-line">
                <td className="py-2">
                  <Link className="text-brand underline" href={`/fleet/${u.id}`}>
                    {u.id}
                  </Link>{" "}
                  <span className="text-muted">{u.name}</span>
                </td>
                <td>
                  <StatusPill status={u.status} />
                </td>
                <td className="hidden md:table-cell">
                  {u.lastInspection
                    ? `${u.lastInspection.payload.phase} · ${fmtTime(u.lastInspection.payload.inspectedAt)}`
                    : "none"}
                </td>
                <td>
                  {u.status === "Inactive" ? (
                    "—"
                  ) : u.inspectedToday ? (
                    "✓"
                  ) : (
                    <span className="text-warn">not yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card
        title="Outstanding defects"
        right={
          <Link className="text-sm text-brand underline" href="/defects">
            Open defect queue
          </Link>
        }
      >
        {open.length === 0 ? (
          <Empty>No outstanding defects.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {open.map((d) => (
              <li key={d.inspection.id} data-defect={d.unitId}>
                <b>{d.unitId}</b> — {d.defects.map((x) => x.item).join(", ")} ·{" "}
                <span className="text-warn">
                  {SEVERITY.find((v) => v.level === d.level)?.label ??
                    `level ${d.level}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Driver assignments">
          {team === null ? (
            <Empty>Visible to owners and managers.</Empty>
          ) : drivers.length === 0 ? (
            <Empty>No drivers.</Empty>
          ) : (
            <ul data-testid="assignments" className="space-y-1 text-sm">
              {drivers.map((d) => (
                <li key={d.id} data-driver={d.email}>
                  <b>{d.email.split("@")[0]}</b> —{" "}
                  {d.units.length ? (
                    d.units.join(", ")
                  ) : (
                    <span className="text-warn">no vehicle</span>
                  )}
                  {d.active ? "" : " (inactive)"}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Maintenance alerts">
          {openWork.length === 0 && expiring.length === 0 ? (
            <Empty>No alerts.</Empty>
          ) : (
            <ul data-testid="alerts" className="space-y-1 text-sm">
              {openWork.map((w) => (
                <li key={text(w.id)}>
                  Work order <b>{text(w.id)}</b> open on {text(w.asset)}:{" "}
                  {text(w.title)}
                </li>
              ))}
              {expiring.map((x) => (
                <li key={x.what} className={x.d! < 0 ? "text-bad" : "text-warn"}>
                  {x.what}{" "}
                  {x.d! < 0 ? `expired ${-x.d!} days ago` : `expires in ${x.d} days`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Shown here only. No alert is sent: notifications are not built for
            TransportationOS yet.
          </p>
        </Card>
      </div>
    </div>
  );
}
