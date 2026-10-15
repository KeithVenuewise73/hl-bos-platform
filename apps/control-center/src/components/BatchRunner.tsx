"use client";

import { useState } from "react";

import { buildBatchLead, recordBatch } from "@/actions/batch";
import type { BatchItemResult, BatchRun, BatchStatus } from "@/lib/batch";

import { button, C } from "./presence-style";

const LABEL: Record<BatchStatus, string> = {
  queued: "Queued",
  building: "Building",
  completed: "Completed",
  needs_info: "Needs information",
  failed: "Failed",
};
const COLOUR: Record<BatchStatus, string> = {
  queued: C.muted,
  building: C.link,
  completed: C.green,
  needs_info: C.yellow,
  failed: C.red,
};

/**
 * Runs a confirmed batch one lead at a time, so each lead's status is shown as
 * it happens and one failure never stops the rest.
 */
export function BatchRunner({
  leads,
  needsInfo,
}: {
  leads: { id: string; name: string }[];
  needsInfo: { id: string; name: string; reason: string }[];
}) {
  const [status, setStatus] = useState<Record<string, BatchStatus>>({});
  const [results, setResults] = useState<Record<string, BatchItemResult>>({});
  const [run, setRun] = useState<BatchRun | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const startedAt = new Date().toISOString();
    setStatus(Object.fromEntries(leads.map((l) => [l.id, "queued" as const])));
    const done: BatchItemResult[] = needsInfo.map((n) => ({
      id: n.id,
      name: n.name,
      status: "needs_info",
      message: n.reason,
      version: undefined,
      ms: undefined,
    }));
    for (const l of leads) {
      setStatus((s) => ({ ...s, [l.id]: "building" }));
      let r: BatchItemResult;
      try {
        r = await buildBatchLead(l.id);
      } catch (e) {
        r = {
          id: l.id,
          name: l.name,
          status: "failed",
          message: `Not built: ${e instanceof Error ? e.message : String(e)}`,
          version: undefined,
          ms: undefined,
        };
      }
      done.push(r);
      setStatus((s) => ({ ...s, [l.id]: r.status }));
      setResults((x) => ({ ...x, [l.id]: r }));
    }
    setRun(await recordBatch(startedAt, done));
    setBusy(false);
  }

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: 6 }}>Business</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Version</th>
            <th style={{ padding: 6 }}>Build time</th>
            <th style={{ padding: 6 }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const s = status[l.id];
            const r = results[l.id];
            return (
              <tr
                key={l.id}
                data-status={s ?? "pending"}
                style={{ borderTop: "1px solid #1c2128" }}
              >
                <td style={{ padding: 6 }}>{l.name}</td>
                <td
                  style={{
                    padding: 6,
                    color: s ? COLOUR[s] : C.muted,
                    fontWeight: 600,
                  }}
                >
                  {s ? LABEL[s] : "Waiting for confirmation"}
                </td>
                <td style={{ padding: 6 }}>{r?.version ?? "—"}</td>
                <td style={{ padding: 6 }}>
                  {r?.ms !== undefined
                    ? r.ms < 100
                      ? "under 0.1 s"
                      : `${(r.ms / 1000).toFixed(1)} s`
                    : "—"}
                </td>
                <td style={{ padding: 6, color: C.muted }}>
                  {r ? (
                    r.status === "completed" ? (
                      <a href={`/presence/${l.id}/demo`} style={{ color: C.link }}>
                        Open the demo →
                      </a>
                    ) : (
                      r.message
                    )
                  ) : null}
                </td>
              </tr>
            );
          })}
          {needsInfo.map((n) => (
            <tr key={n.id} style={{ borderTop: "1px solid #1c2128" }}>
              <td style={{ padding: 6 }}>{n.name}</td>
              <td style={{ padding: 6, color: COLOUR.needs_info, fontWeight: 600 }}>
                {LABEL.needs_info}
              </td>
              <td style={{ padding: 6 }}>—</td>
              <td style={{ padding: 6 }}>—</td>
              <td style={{ padding: 6, color: C.muted }}>{n.reason} Not built.</td>
            </tr>
          ))}
        </tbody>
      </table>
      {run ? (
        <div
          role="status"
          style={{
            marginTop: 14,
            padding: "10px 12px",
            border: `1px solid ${C.green}`,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <strong>Batch finished.</strong> {run.summary}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || leads.length === 0}
          onClick={() => void start()}
          style={{ ...button(true, busy || leads.length === 0), marginTop: 14 }}
        >
          {busy
            ? "Building…"
            : `Confirm and build ${leads.length} demo${leads.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
