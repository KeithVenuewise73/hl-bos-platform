"use client";

import { useState, useTransition } from "react";

import { readLabGpuStatus, turnLabGpuOff, turnLabGpuOn } from "@/actions/lab-gpu";
import type { LabGpuState, LabGpuStatus } from "@/lib/lab-gpu-report";

const COLOR: Record<LabGpuState, string> = {
  ready: "#3fb950",
  starting: "#d29922",
  off: "#6e7681",
  missing: "#6e7681",
  "not-connected": "#d29922",
  unknown: "#f85149",
};

function usd(n: number | null): string {
  return n === null ? "—" : `$${n.toFixed(2)}`;
}

/**
 * On / Off for the Lab GPU, and the truth about what it is costing.
 *
 * Every press says something, whatever happens: a button that fails in silence
 * reads as one that worked, and here that would mean a card billing all night.
 */
export function LabGpuControls({ initial }: { initial: LabGpuStatus }) {
  const [status, setStatus] = useState(initial);
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState("");
  const [pending, start] = useTransition();

  function act(run: () => Promise<{ ok: boolean; message: string; detail?: string }>) {
    start(async () => {
      setNote("");
      setDetail("");
      try {
        const result = await run();
        setNote(result.message);
        setDetail(result.detail ?? "");
      } catch (error) {
        setNote(
          `Something went wrong before RunPod was asked, so nothing changed. Send Claude this: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      try {
        setStatus(await readLabGpuStatus());
      } catch {
        // The message above is the part that explains anything; keep it.
      }
    });
  }

  return (
    <div>
      <p style={{ margin: "0 0 6px", fontSize: 16 }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 10,
            background: COLOR[status.state],
            marginRight: 9,
          }}
        />
        <strong>{status.headline}</strong>
      </p>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: 13.5,
          color: "#c9d1d9",
          lineHeight: 1.6,
        }}
      >
        {status.meaning}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => act(turnLabGpuOn)}
          disabled={pending || !status.canTurnOn}
          style={button(pending || !status.canTurnOn, "#238636")}
        >
          {pending ? "Working…" : "Turn on"}
        </button>
        <button
          type="button"
          onClick={() => act(turnLabGpuOff)}
          disabled={pending || !status.canTurnOff}
          style={button(pending || !status.canTurnOff, "#b62324")}
        >
          {pending ? "Working…" : "Turn off"}
        </button>
        <button
          type="button"
          onClick={() => act(() => Promise.resolve({ ok: true, message: "" }))}
          disabled={pending}
          style={button(pending, "#30363d")}
        >
          Refresh
        </button>
      </div>

      {note !== "" ? (
        <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6 }}>{note}</p>
      ) : null}
      {detail !== "" ? (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ fontSize: 12, color: "#8b949e", cursor: "pointer" }}>
            Details for Claude
          </summary>
          <pre style={{ fontSize: 11.5, color: "#8b949e", whiteSpace: "pre-wrap" }}>
            {detail}
          </pre>
        </details>
      ) : null}

      {status.account ? (
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 12.5,
            color: "#8b949e",
            lineHeight: 1.7,
          }}
        >
          From RunPod, just now: balance{" "}
          <strong>{usd(status.account.balanceUsd)}</strong>
          {" · "}being charged{" "}
          <strong>{usd(status.account.spendPerHrUsd)} an hour</strong> across your whole
          account, storage included.
          {status.costPerHr !== null ? (
            <> The card itself costs {usd(status.costPerHr)} an hour while on.</>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function button(disabled: boolean, background: string) {
  return {
    padding: "9px 18px",
    fontSize: 14,
    background: disabled ? "#1b2027" : background,
    border: "1px solid #30363d",
    borderRadius: 8,
    color: disabled ? "#8b949e" : "#e8eaed",
    cursor: disabled ? "default" : "pointer",
  } as const;
}
