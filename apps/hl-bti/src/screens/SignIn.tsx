"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth";
import { Card, Field } from "@/components/ui";

// Sign-in reuses HL-BOS authentication (Supabase Auth). Accounts are created by
// invitation from the dashboard; there is deliberately no self-serve sign-up
// here — access to the Herman Legacy platform is granted, not requested.
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div className="brand-row">
          <div className="brand-mark">HL</div>
          <div>
            <div className="brand-eyebrow">Herman Legacy</div>
            <div className="brand-name">Business Transformation Intelligence</div>
          </div>
        </div>
        <Card>
          <form onSubmit={(e) => void submit(e)}>
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <div className="banner danger" style={{ marginBottom: 10 }}>
                {error}
              </div>
            )}
            <button
              className="btn primary"
              type="submit"
              disabled={busy || !email.trim() || !password}
              style={{ width: "100%" }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </Card>
        <p className="signin-foot">
          Accounts are granted by invitation. If you have not received one, contact your
          Herman Legacy administrator.
        </p>
      </div>
    </div>
  );
}
