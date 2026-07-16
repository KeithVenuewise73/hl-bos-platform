"use client";

import { useState, useTransition } from "react";
import { saveConnection } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

const input: React.CSSProperties = {
  width: "100%",
  background: "#0b0d10",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e8eaed",
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: "ui-monospace, monospace",
  marginBottom: 12,
};

export function ConnectForm({
  hasGithub,
  hasSupabase,
  supabaseRef,
}: {
  hasGithub: boolean;
  hasSupabase: boolean;
  supabaseRef: string | null;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      action={(fd) =>
        start(async () => {
          setResult(await saveConnection(fd));
        })
      }
    >
      <label style={{ fontSize: 12.5, color: "#8b949e" }}>GitHub token</label>
      <input
        name="github"
        type="password"
        style={input}
        placeholder={
          hasGithub
            ? "Already connected — paste a new one to replace it"
            : "github_pat_..."
        }
        autoComplete="off"
      />

      <label style={{ fontSize: 12.5, color: "#8b949e" }}>Supabase access token</label>
      <input
        name="supabase"
        type="password"
        style={input}
        placeholder={
          hasSupabase ? "Already connected — paste a new one to replace it" : "sbp_..."
        }
        autoComplete="off"
      />

      <label style={{ fontSize: 12.5, color: "#8b949e" }}>
        HL-BOS Core project reference
      </label>
      <input
        name="ref"
        type="text"
        style={input}
        defaultValue={supabaseRef ?? ""}
        placeholder="mvvtngiopdrgiedjmhfb"
        autoComplete="off"
      />

      <button
        type="submit"
        disabled={pending}
        style={{
          background: "#238636",
          color: "#e8eaed",
          border: "1px solid #2ea043",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          cursor: pending ? "wait" : "pointer",
        }}
      >
        {pending ? "Saving…" : "Save and connect"}
      </button>

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
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#c9d1d9" }}>
            {result.meaning}
          </p>
          {result.ok && (
            <p style={{ margin: "8px 0 0" }}>
              <a href="/" style={{ color: "#58a6ff", fontSize: 13 }}>
                Back to the console →
              </a>
            </p>
          )}
        </div>
      )}
    </form>
  );
}
