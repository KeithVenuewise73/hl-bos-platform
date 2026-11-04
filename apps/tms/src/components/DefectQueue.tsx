"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SEVERITY, type DefectRow } from "@hl-bos/tms";
import { fleetCall } from "@/lib/client.ts";
import { fmtTime } from "@/components/ui.tsx";

const STATE_LABEL = {
  none: "",
  open: "Open",
  assessed: "Assessed",
  certified: "Repair certified",
  reviewed: "Certified · driver reviewed",
} as const;

export function DefectQueue({
  rows,
  signer,
  maintenanceLicensed,
}: {
  rows: DefectRow[];
  signer: string;
  maintenanceLicensed: boolean;
}) {
  const [filter, setFilter] = useState<"outstanding" | "all">("outstanding");
  const shown = rows.filter(
    (r) => filter === "all" || r.state === "open" || r.state === "assessed",
  );
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {(["outstanding", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-3 py-1 ${filter === f ? "border-brand bg-brand text-white" : "border-line bg-panel"}`}
          >
            {f}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded border border-dashed border-line p-4 text-sm text-muted">
          No {filter === "outstanding" ? "outstanding " : ""}defects.
        </p>
      ) : null}
      {shown.map((r) => (
        <DefectCard
          key={r.inspection.id}
          row={r}
          signer={signer}
          maintenanceLicensed={maintenanceLicensed}
        />
      ))}
    </div>
  );
}

function DefectCard({
  row,
  signer,
  maintenanceLicensed,
}: {
  row: DefectRow;
  signer: string;
  maintenanceLicensed: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"acknowledge" | "assess" | "certify">("acknowledge");
  const [level, setLevel] = useState(row.level || 1);
  const [resolution, setResolution] = useState<"Repaired" | "Repair unnecessary">(
    "Repaired",
  );
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState(signer);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = row.state === "certified" || row.state === "reviewed";
  const sev = SEVERITY.find((s) => s.level === row.level);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await fleetCall("submit_action", {
        action: {
          inspection: row.inspection.id,
          kind,
          note: note.trim(),
          signature: signature.trim(),
          consent: true,
          ...(kind === "assess" ? { level } : {}),
          ...(kind === "certify" ? { resolution } : {}),
        },
      });
      setNote("");
      setConsent(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      data-defect-card={row.unitId}
      data-state={row.state}
      className="rounded-lg border border-line bg-panel p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {row.unitId} ·{" "}
          <Link
            className="text-brand underline"
            href={`/inspections/${row.inspection.id}`}
          >
            {row.inspection.payload.phase} {fmtTime(row.inspection.payload.inspectedAt)}
          </Link>
        </h3>
        <span
          className={`text-sm font-semibold ${closed ? "text-ok" : row.level >= 2 ? "text-bad" : "text-warn"}`}
        >
          {STATE_LABEL[row.state]}
          {!closed && sev ? ` · ${sev.label}` : ""}
        </span>
      </div>
      <p className="text-xs text-muted">Reported by {row.inspection.payload.driver}</p>
      <ul className="mt-2 text-sm">
        {row.defects.map((d) => (
          <li key={d.item}>
            • <b>{d.item}</b> (level {d.level}): {d.note}
          </li>
        ))}
      </ul>
      {row.actions.length ? (
        <ol className="mt-2 border-l-2 border-line pl-3 text-xs text-muted">
          {row.actions.map((a) => (
            <li key={a.id}>
              {fmtTime(a.created_at)} · <b>{a.payload.kind}</b>
              {a.payload.level ? ` level ${a.payload.level}` : ""}
              {a.payload.resolution ? ` — ${a.payload.resolution}` : ""}:{" "}
              {a.payload.note} — {a.payload.signature}
            </li>
          ))}
        </ol>
      ) : null}
      {!closed ? (
        <div className="mt-3 space-y-2 rounded bg-wash p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {(["acknowledge", "assess", "certify"] as const).map((k) => (
              <button
                key={k}
                data-kind={k}
                onClick={() => setKind(k)}
                className={`rounded border px-3 py-1 ${kind === k ? "border-brand bg-brand text-white" : "border-line bg-panel"}`}
              >
                {k === "certify" ? "certify repair" : k}
              </button>
            ))}
          </div>
          {kind === "assess" ? (
            <select
              data-testid="assess-level"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full rounded border border-line px-2 py-1"
            >
              {SEVERITY.map((s) => (
                <option key={s.level} value={s.level}>
                  {s.level} — {s.label}
                </option>
              ))}
            </select>
          ) : null}
          {kind === "certify" ? (
            <select
              data-testid="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as typeof resolution)}
              className="w-full rounded border border-line px-2 py-1"
            >
              <option>Repaired</option>
              <option>Repair unnecessary</option>
            </select>
          ) : null}
          <textarea
            data-testid="action-note"
            placeholder={kind === "certify" ? "Corrective action taken" : "Note"}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-line px-2 py-1"
          />
          <input
            data-testid="action-signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            maxLength={120}
            className="w-full rounded border border-line px-2 py-1"
          />
          <label className="flex items-center gap-2">
            <input
              data-testid="action-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            I am signing this electronically.
          </label>
          <button
            data-testid="action-submit"
            disabled={busy || !consent || !note.trim() || !signature.trim()}
            onClick={() => void send()}
            className="rounded bg-brand px-3 py-1 text-white disabled:opacity-40"
          >
            Sign and record
          </button>
          {error ? (
            <p data-testid="action-error" className="text-bad">
              {error}
            </p>
          ) : null}
        </div>
      ) : maintenanceLicensed ? (
        <p className="mt-2 text-xs">
          <Link
            className="text-brand underline"
            href={`/maintenance?unit=${row.unitId}&inspection=${row.inspection.id}`}
          >
            Record the repair cost in Maintenance
          </Link>
        </p>
      ) : null}
    </article>
  );
}
