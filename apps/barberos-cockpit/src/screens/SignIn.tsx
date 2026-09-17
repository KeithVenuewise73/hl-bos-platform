"use client";

import { useState } from "react";

import { signIn } from "@/lib/auth";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setBusy(true);
    setError(null);
    signIn(email.trim(), password)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="signin-shell">
      <form
        className="signin-card"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="brand-eyebrow">Herman Legacy Digital</div>
        <h1 style={{ fontSize: 20, marginTop: 6 }}>Transformation Cockpit</h1>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
          Internal operator tooling for the BarberOS managed service. Sign in with your
          Herman Legacy account.
        </p>

        <div style={{ marginTop: 18 }}>
          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>
              Email
            </div>
            <input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>
              Password
            </div>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>

        {error && (
          <div className="banner bdanger" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        <button
          className="btn primary"
          type="submit"
          disabled={busy}
          style={{ width: "100%" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="signin-foot">
          Access is governed by your HL-BOS membership and permissions. This console can
          do nothing your account is not already permitted to do.
        </div>
      </form>
    </div>
  );
}
