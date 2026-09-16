"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote, Field, InfoNote, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { state, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "unavailable") {
    return (
      <main>
        <TopBar back="/" />
        <h1>Sign in</h1>
        {/* No form is shown, because there is nothing behind it. A sign-in box
            that cannot sign anyone in is worse than none. */}
        <InfoNote>
          This build has no account service configured, so there is nothing to sign in to.
          Everything you record is saved on this device and works exactly as it does with an
          account — it is simply not backed up anywhere.
        </InfoNote>
        <Link className="btn btn-primary btn-block" href="/">
          Continue
        </Link>
      </main>
    );
  }

  return (
    <main>
      <TopBar back="/" />
      <h1>Sign in</h1>
      <p className="lead">Your games are backed up and available on your other devices.</p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void signIn(email.trim(), password).then((message) => {
            setBusy(false);
            if (message) setError(message);
            else router.push("/");
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
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <button type="submit" className="btn-primary btn-block" style={{ marginTop: 20 }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="stack" style={{ marginTop: 20 }}>
        <Link className="btn btn-block" href="/signup/">
          Create an account
        </Link>
        <Link className="btn btn-block" href="/forgot-password/">
          I forgot my password
        </Link>
        <Link className="btn btn-block" href="/">
          Keep using this device only
        </Link>
      </div>
    </main>
  );
}
