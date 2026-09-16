"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Field, InfoNote, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const { state, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (state.status === "unavailable") {
    return (
      <main>
        <TopBar back="/" />
        <h1>Reset password</h1>
        <InfoNote>This build has no account service configured, so there is no password to reset.</InfoNote>
        <Link className="btn btn-primary btn-block" href="/">
          Continue
        </Link>
      </main>
    );
  }

  return (
    <main>
      <TopBar back="/login/" />
      <h1>Reset password</h1>

      {sent ? (
        <>
          <p>
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </p>
          {/* Deliberately worded so the response is the same whether or not the
              address is registered: confirming which emails have accounts is
              how an account list leaks. */}
          <p className="muted">Check your spam folder if it has not arrived in a few minutes.</p>
          <Link className="btn btn-primary btn-block" href="/login/">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="lead">We will email you a link to choose a new one.</p>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              void sendPasswordReset(email.trim()).then((message) => {
                setBusy(false);
                if (message) setError(message);
                else setSent(true);
              });
            }}
          >
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <button type="submit" className="btn-primary btn-block" style={{ marginTop: 20 }} disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
