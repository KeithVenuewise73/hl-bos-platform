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
    try {
      void fetch("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "client_login", path: "/login" }),
        keepalive: true,
      });
    } catch {
      /* best-effort */
    }

    // Route by role: an internal user who happened to use Client Login is sent to
    // the correct internal destination; a client goes to their portal. The
    // server (/api/whoami) computes a safe destination with open-redirect
    // protection; fall back to /portal if it is unavailable.
    const next = new URLSearchParams(window.location.search).get("next");
    // Only a same-origin path is safe: a single leading "/", never "//" or "/\"
    // (protocol-relative / absolute URLs like http(s):// don't start with "/"
    // and are rejected too). Mirrors the server-side `safeNext` in authz.ts so
    // the client fallback can never be turned into an open redirect.
    const nextIsSafe =
      typeof next === "string" &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      !next.startsWith("/\\");
    let destination = nextIsSafe ? next : "/portal";
    try {
      const res = await fetch(
        `/api/whoami${next ? `?next=${encodeURIComponent(next)}` : ""}`,
        { cache: "no-store" },
      );
      const who = (await res.json()) as { destination: string };
      if (who.destination) destination = who.destination;
    } catch {
      /* use the safe default */
    }
    window.location.assign(destination);
  }

  return (
    <main
      style={{
        maxWidth: 380,
        margin: "0 auto",
        padding: "72px 24px",
        fontFamily: "inherit",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Client Login</h1>
      <p style={{ fontSize: 12.5, color: "#5b6672", marginBottom: 20 }}>
        Sign in with your Herman Legacy account.
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
          <div style={{ color: "#b42318", fontSize: 12.5, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ fontSize: 12, color: "#5b6672", marginTop: 20 }}>
        Not a client yet? <a href="/visibility-assessment">Request an assessment</a>.
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  border: "1px solid #d5dae1",
  borderRadius: 10,
  color: "#0f1720",
  fontSize: 14,
  padding: "11px 13px",
  marginBottom: 10,
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  background: "#1f5f8b",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontSize: 14,
  padding: "11px 13px",
  cursor: "pointer",
};
