"use client";

import { useState, useTransition } from "react";

import { unlock } from "@/actions/access";

/**
 * The only thing a visitor without the code ever sees.
 *
 * No hint about what is behind it and no list of what exists — a stranger on
 * the network should learn nothing from this page except that they need a code.
 */
export function Unlock({ reason }: { reason: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(reason);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await unlock(code);
      if (result.ok) {
        // A full reload, not a router refresh: the cookie was set on the
        // response to the action, and the layout must be rendered again with it.
        window.location.reload();
        return;
      }
      setError(result.message);
      setCode("");
    });
  }

  return (
    <main
      style={{
        maxWidth: 380,
        margin: "0 auto",
        padding: "80px 24px",
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20 }}>SceneFlow</h1>
      <p style={{ margin: "8px 0 24px", color: "#8b949e", fontSize: 13 }}>{error}</p>
      <form onSubmit={submit}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Access code"
          placeholder="Access code"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            fontSize: 18,
            letterSpacing: 4,
            textAlign: "center",
            background: "#12151a",
            border: "1px solid #262c36",
            borderRadius: 10,
            color: "#e8eaed",
          }}
        />
        <button
          type="submit"
          disabled={pending || code.trim() === ""}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "12px 14px",
            fontSize: 15,
            background: pending ? "#1b2027" : "#1f6feb",
            border: "1px solid #2f4f8f",
            borderRadius: 10,
            color: "#e8eaed",
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
