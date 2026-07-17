"use client";

import { useState, useTransition } from "react";
import { approveMerge } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

/**
 * The CEO's approval, as a button.
 *
 * Confirms first -- merge is the one action here that changes the product, and
 * it should take a deliberate second click, not a stray one.
 */
export function MergeButton({ number, title }: { number: number; title: string }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  if (result) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 8,
          background: result.ok ? "#0d2818" : "#2d1214",
          border: "1px solid " + (result.ok ? "#2ea043" : "#f85149"),
        }}
      >
        <strong style={{ fontSize: 13 }}>{result.headline}</strong>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 12.5,
            color: "#c9d1d9",
            lineHeight: 1.5,
          }}
        >
          {result.meaning}
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
      {!armed ? (
        <button
          onClick={() => setArmed(true)}
          style={{
            background: "#238636",
            color: "#e8eaed",
            border: "1px solid #2ea043",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Approve merge
        </button>
      ) : (
        <>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setResult(await approveMerge(number, title));
              })
            }
            style={{
              background: "#238636",
              color: "#e8eaed",
              border: "1px solid #2ea043",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "Merging…" : "Yes — merge it"}
          </button>
          <button
            onClick={() => setArmed(false)}
            disabled={pending}
            style={{
              background: "transparent",
              color: "#8b949e",
              border: "1px solid #30363d",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
