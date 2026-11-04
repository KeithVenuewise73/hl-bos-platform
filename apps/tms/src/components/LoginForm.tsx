"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-lg border border-line bg-panel p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        void fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
          .then(async (r) => {
            if (r.ok) window.location.assign("/");
            else
              setError(
                ((await r.json()) as { error?: string }).error ?? "Sign-in failed.",
              );
          })
          .finally(() => setBusy(false));
      }}
    >
      <label className="block text-sm">
        E-mail
        <input
          data-testid="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-line px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          data-testid="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-line px-3 py-2"
        />
      </label>
      <button
        data-testid="sign-in"
        disabled={busy || !email || !password}
        className="w-full rounded bg-brand px-3 py-2 font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error ? (
        <p data-testid="login-error" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </form>
  );
}
