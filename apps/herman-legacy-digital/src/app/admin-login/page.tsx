"use client";

import { useState } from "react";
import { browserSupabase } from "@/lib/browser";

type Denied = { kind: "denied" };

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<Denied | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDenied(null);
    const supabase = browserSupabase();
    if (!supabase) {
      setError("Sign-in is not configured in this environment.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setBusy(false);
      setError("Sign-in failed. Check your credentials.");
      return;
    }

    // Resolve role server-side to route internal users and safely reject clients.
    const next = new URLSearchParams(window.location.search).get("next");
    let role: string | null = null;
    let internal = false;
    let destination = "/intelligence";
    try {
      const res = await fetch(
        `/api/whoami${next ? `?next=${encodeURIComponent(next)}` : ""}`,
        { cache: "no-store" },
      );
      const who = (await res.json()) as {
        role: string | null;
        internal: boolean;
        destination: string;
      };
      role = who.role;
      internal = who.internal;
      destination = who.destination;
    } catch {
      /* fall through to the safe default below */
    }

    void fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "admin_login_attempt",
        path: "/admin-login",
        role,
      }),
      keepalive: true,
    }).catch(() => {});

    setBusy(false);

    if (internal) {
      window.location.assign(destination || "/intelligence");
      return;
    }
    // Authenticated, but not an internal HLD account — safe access-denied state.
    // Do NOT reveal whether the credentials were "admin"; just deny BTIC.
    setDenied({ kind: "denied" });
  }

  async function signOutAndReset() {
    const supabase = browserSupabase();
    if (supabase) await supabase.auth.signOut();
    setDenied(null);
    setEmail("");
    setPassword("");
  }

  if (denied) {
    return (
      <main style={mainStyle}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Access restricted</h1>
        <p style={{ fontSize: 13, color: "#5b6672", marginBottom: 16 }}>
          This sign-in is for Herman Legacy Digital internal team members. Your account
          does not have access to the Business Transformation Intelligence Center.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href="/portal"
            style={{ ...buttonStyle, textDecoration: "none", textAlign: "center" }}
          >
            Go to your portal
          </a>
          <button onClick={() => void signOutAndReset()} style={secondaryStyle}>
            Sign in as someone else
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>HLD Team Login</h1>
      <p style={{ fontSize: 12.5, color: "#5b6672", marginBottom: 20 }}>
        Internal access to the Business Transformation Intelligence Center. Client
        access is at <a href="/login">Client Login</a>.
      </p>
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <input
          type="email"
          required
          placeholder="Work email"
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
      <p style={{ fontSize: 12, color: "#5b6672", marginTop: 16 }}>
        <a href="/forgot-password" style={{ color: "#1f5f8b" }}>
          Forgot password?
        </a>
      </p>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: 380,
  margin: "0 auto",
  padding: "72px 24px",
  fontFamily: "inherit",
};

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
  background: "#0f2740",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontSize: 14,
  padding: "11px 13px",
  cursor: "pointer",
};

const secondaryStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #d5dae1",
  borderRadius: 10,
  color: "#0f1720",
  fontSize: 13.5,
  padding: "10px 13px",
  cursor: "pointer",
};
