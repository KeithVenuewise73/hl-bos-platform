"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Field, InfoNote, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LINKS } from "@/lib/config";

export default function SignUpPage() {
  const { state, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (state.status === "unavailable") {
    return (
      <main>
        <TopBar back="/" />
        <h1>Create an account</h1>
        <InfoNote>
          This build has no account service configured. Everything works on this device without
          one.
        </InfoNote>
        <Link className="btn btn-primary btn-block" href="/">
          Continue
        </Link>
      </main>
    );
  }

  if (sent) {
    return (
      <main>
        <TopBar back="/login/" />
        <h1>Check your email</h1>
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Open it, then come back and sign
          in.
        </p>
        <p className="muted">
          Anything you have already recorded stays on this device and will be attached to your
          account the first time you sign in here.
        </p>
        <Link className="btn btn-primary btn-block" href="/login/">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main>
      <TopBar back="/login/" />
      <h1>Create an account</h1>
      <p className="lead">
        An account backs your games up. It is not required — the app works fully without one.
      </p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void signUp(email.trim(), password).then((message) => {
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
        <Field label="Password" hint="At least 6 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </Field>
        <button type="submit" className="btn-primary btn-block" style={{ marginTop: 20 }} disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        By creating an account you agree to the <Link href={LINKS.terms}>Terms of Use</Link> and the{" "}
        <Link href={LINKS.privacy}>Privacy Policy</Link>. You can delete your account, and
        everything in it, from the Account screen at any time.
      </p>
    </main>
  );
}
