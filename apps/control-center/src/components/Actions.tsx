"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

type Fn = () => Promise<ActionResult>;

export function ActionBar({
  actions,
}: {
  actions: { label: string; run: Fn; primary?: boolean; hint: string }[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {actions.map((a) => (
          <button
            key={a.label}
            title={a.hint}
            disabled={pending}
            onClick={() => {
              setBusy(a.label);
              setShowDetail(false);
              start(async () => {
                setResult(await a.run());
                setBusy(null);
              });
            }}
            style={{
              background: a.primary ? "#238636" : "#21262d",
              color: "#e8eaed",
              border: "1px solid " + (a.primary ? "#2ea043" : "#30363d"),
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 13,
              cursor: pending ? "wait" : "pointer",
              opacity: pending && busy !== a.label ? 0.5 : 1,
            }}
          >
            {pending && busy === a.label ? "Working…" : a.label}
          </button>
        ))}
      </div>

      {result && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 8,
            background: result.ok ? "#0d2818" : "#2d1214",
            border: "1px solid " + (result.ok ? "#2ea043" : "#f85149"),
          }}
        >
          <strong style={{ fontSize: 13.5 }}>{result.headline}</strong>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#c9d1d9",
              lineHeight: 1.55,
            }}
          >
            {result.meaning}
          </p>
          {result.href && (
            <p style={{ margin: "8px 0 0" }}>
              <a
                href={result.href}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#58a6ff", fontSize: 13 }}
              >
                Open it →
              </a>
            </p>
          )}
          {result.detail && (
            <>
              <button
                onClick={() => setShowDetail((s) => !s)}
                style={{
                  marginTop: 10,
                  background: "none",
                  border: "none",
                  color: "#8b949e",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {showDetail ? "Hide" : "Show"} technical details (for your engineer)
              </button>
              {showDetail && (
                <pre
                  style={{
                    marginTop: 8,
                    maxHeight: 260,
                    overflow: "auto",
                    background: "#0b0d10",
                    border: "1px solid #262c36",
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 11.5,
                    color: "#8b949e",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {result.detail}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
