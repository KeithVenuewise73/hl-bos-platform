"use client";

import { useState } from "react";
import { browserSupabase } from "@/lib/browser";
import { button, input } from "@/components/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = browserSupabase();
    if (supabase === null) {
      // Not "sign-in failed" -- nothing was attempted, and saying so is the
      // difference between a wrong password and a misconfigured install.
      setError("This installation is not pointed at a BarberOS database yet.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("That email and password did not match an account.");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    window.location.assign(next);
  }

  return (
    <main style={{ maxWidth: 360, margin: "0 auto", padding: "80px 24px" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>BarberOS</h1>
      <p style={{ fontSize: 13, color: "#8b949e", margin: "0 0 22px" }}>
        Sign in to run your shop.
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
          style={{ ...input, marginBottom: 10 }}
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ ...input, marginBottom: 14 }}
        />
        {error !== null && (
          <p style={{ color: "#f85149", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{ ...button(!busy), width: "100%" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
