"use client";
import { useState } from "react";
import { browserSupabase } from "@/lib/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = browserSupabase();
    if (!sb) {
      setError(
        "Sign-in is unavailable (identity not configured for this environment).",
      );
      setBusy(false);
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else
      window.location.href =
        new URLSearchParams(window.location.search).get("next") ?? "/";
  }

  const input: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "#0d1117",
    border: "1px solid #232a33",
    borderRadius: 8,
    color: "#e6edf3",
    padding: "10px 12px",
    marginTop: 6,
    fontSize: 14,
  };

  return (
    <main style={{ maxWidth: 380, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ fontSize: 18, color: "#e6edf3" }}>Herman Legacy Venture Studio</h1>
      <p style={{ color: "#8b949e", fontSize: 13 }}>
        Sign in with your Herman Legacy identity.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <label style={{ fontSize: 12.5, color: "#8b949e" }}>
          Email
          <input
            style={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label
          style={{ fontSize: 12.5, color: "#8b949e", display: "block", marginTop: 12 }}
        >
          Password
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p style={{ color: "#f85149", fontSize: 13 }}>{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 16,
            width: "100%",
            background: "#4493f8",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "11px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
