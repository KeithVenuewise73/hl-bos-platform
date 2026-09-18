"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { browserSupabase } from "@/lib/browser.ts";

/**
 * Sign in.
 *
 * Email and password against Supabase Auth — the same identity provider the
 * rest of the platform uses, rather than a second account system.
 *
 * Errors are shown as the provider reported them, not translated into a
 * cheerful generic message: "Invalid login credentials" and "Email not
 * confirmed" need different actions from the person reading them.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // The handler itself is synchronous: an onSubmit that returns a promise is
    // a promise nobody awaits, so rejections would vanish. signIn() owns its
    // own errors and always clears the busy flag.
    void signIn();
  }

  async function signIn() {
    setError(null);
    const supabase = browserSupabase();
    if (supabase === null) {
      setError("No identity provider is configured for this installation.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (signInError !== null) {
      setError(signInError.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 380, margin: "12vh auto" }}>
      <h1 style={{ marginBottom: 6 }}>HighlightAI Hockey</h1>
      <p className="muted small" style={{ marginBottom: 20 }}>
        Sign in to reach your games. Each account sees only its own.
      </p>

      <div className="card">
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error === null ? null : (
            <div className="notice notice-danger" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
