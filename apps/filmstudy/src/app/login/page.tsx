"use client";

import { useState, useTransition } from "react";
import { browserSupabase } from "@/lib/browser";

/**
 * Sign in.
 *
 * Authentication is Supabase Auth — the platform's existing identity, not a
 * second one. There is no local bypass and no role selector: what this user may
 * do is decided by their tenant membership and their filmstudy.team_members
 * row, both read server-side.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const supabase = browserSupabase();

  if (supabase === null) {
    return (
      <div className="card">
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Not connected</h1>
        <p className="dim">
          This app has no Supabase project configured, so there is nothing to sign in
          to. See{" "}
          <a href="/setup" style={{ color: "var(--accent)" }}>
            setup
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "12vh" }}>
      <div className="brand-name" style={{ fontSize: 17 }}>
        Football FilmStudy AI
      </div>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        Upload the film. Understand the game. Coach the next rep.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          start(async () => {
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (signInError) {
              // Deliberately not "no such user" vs "wrong password": that
              // difference tells an attacker which addresses are real.
              setError("That email and password did not match an account.");
              return;
            }
            const next = new URLSearchParams(window.location.search).get("next");
            window.location.assign(next ?? "/");
          });
        }}
      >
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            autoComplete="username"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error !== null ? (
          <div className="notice bad" style={{ marginBottom: 12 }}>
            {error}
          </div>
        ) : null}
        <button
          className="btn primary"
          type="submit"
          disabled={pending}
          style={{ width: "100%" }}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
