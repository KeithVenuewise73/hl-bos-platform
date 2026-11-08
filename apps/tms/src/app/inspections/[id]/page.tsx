import { notFound } from "next/navigation";
import { defectState, currentLevel } from "@hl-bos/tms";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import { fmtTime } from "@/components/ui.tsx";
import { PrintButton } from "@/components/PrintButton.tsx";

export const dynamic = "force-dynamic";

/** The signed report. Print it to PDF from the browser; download the JSON record. */
export default async function InspectionReport({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireScreen("inspection_report");
  const s = await snapshotFor(ctx);
  const rec = s.inspections.find((i) => i.id === id);
  if (!rec) notFound();
  const actions = s.inspection_actions.filter((a) => a.payload.inspection === id);
  const r = rec.payload;
  const json = JSON.stringify({ inspection: rec, actions }, null, 2);
  return (
    <article
      data-testid="report"
      className="mx-auto max-w-2xl rounded-lg border border-line bg-panel p-6 text-sm"
    >
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Driver Vehicle Inspection Report</h1>
          <p className="text-muted">{ctx.company.name} · SYNTHETIC DEMO RECORD</p>
        </div>
        <div className="no-print flex gap-2">
          <PrintButton />
          <a
            className="rounded border border-line px-3 py-1"
            download={`${id}.json`}
            href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}
          >
            JSON
          </a>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-y-1">
        <dt className="text-muted">Report</dt>
        <dd className="font-mono text-xs">{id}</dd>
        <dt className="text-muted">Vehicle</dt>
        <dd>{r.asset}</dd>
        <dt className="text-muted">Inspection</dt>
        <dd>{r.phase}</dd>
        <dt className="text-muted">Date and time</dt>
        <dd>{fmtTime(r.inspectedAt)}</dd>
        <dt className="text-muted">Odometer</dt>
        <dd>{r.odometer}</dd>
        <dt className="text-muted">Driver</dt>
        <dd>{r.driver}</dd>
        <dt className="text-muted">Signed</dt>
        <dd>{r.signature} (typed electronic signature, consent recorded)</dd>
        <dt className="text-muted">Current status</dt>
        <dd>
          {defectState(r, actions)} · severity now {currentLevel(r, actions)}
        </dd>
      </dl>
      <table className="mt-4 w-full">
        <thead className="text-left text-muted">
          <tr>
            <th>Item</th>
            <th>Result</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {r.checks.map((c) => (
            <tr key={c.item} className="border-t border-line">
              <td className="py-1">{c.item}</td>
              <td className={c.result === "Defect" ? "font-semibold text-bad" : ""}>
                {c.result}
                {c.result === "Defect" ? ` (level ${c.level})` : ""}
              </td>
              <td>{c.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.photo ? (
        <img
          alt="Defect photo"
          src={`/api/photo?inspection=${encodeURIComponent(id)}`}
          className="mt-4 max-h-72 rounded border border-line"
        />
      ) : null}
      <h2 className="mt-4 font-semibold">Repair record</h2>
      {actions.length === 0 ? (
        <p className="text-muted">No actions recorded.</p>
      ) : (
        <ol className="list-decimal pl-5">
          {actions.map((a) => (
            <li key={a.id}>
              {fmtTime(a.created_at)} — {a.payload.kind}
              {a.payload.level ? ` (level ${a.payload.level})` : ""}
              {a.payload.resolution ? `: ${a.payload.resolution}` : ""} — “
              {a.payload.note}” — signed {a.payload.signature}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-6 text-xs text-muted">
        Compliance with 49 CFR 396.11 / 396.13 and state rules has not been validated
        for this product. This report format is a prototype.
      </p>
    </article>
  );
}
