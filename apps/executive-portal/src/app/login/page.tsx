"use client";

import { useState } from "react";
import { browserSupabase } from "@/lib/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = browserSupabase();
    if (!supabase) {
      setError("Sign-in is not configured in this environment.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Sign-in failed. Check your credentials.");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.assign(next);
  }

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "72px 24px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Herman Legacy Executive Portal</h1>
      <p style={{ fontSize: 12.5, color: "#8b949e", marginBottom: 20 }}>
        Invitation-only. Sign in with your Herman Legacy account.
      </p>
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={inputStyle}
        />
        {error ? (
          <div style={{ color: "#f85149", fontSize: 12.5, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ fontSize: 11, color: "#6e7681", marginTop: 20, lineHeight: 1.6 }}>
        This portal is read-only. It cannot run commands, deploy, or change data.
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 10,
  color: "#e8eaed",
  fontSize: 14,
  padding: "11px 13px",
  marginBottom: 10,
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  background: "#1f6feb",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontSize: 14,
  padding: "11px 13px",
  cursor: "pointer",
};
