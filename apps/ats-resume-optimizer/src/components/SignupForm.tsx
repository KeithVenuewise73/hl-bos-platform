"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { browserSupabase } from "@/lib/browser.ts";
import { AuthShell } from "@/components/AuthShell.tsx";

/**
 * Create an account.
 *
 * Two outcomes, and the difference matters to the person reading it: Supabase
 * returns a session when email confirmation is switched off, and no session
 * when a confirmation mail has been sent. Telling someone "check your email"
 * when no email is coming is the kind of small lie that costs a signup.
 */
export function SignupForm({ open }: { open: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <AuthShell
        title="Private beta"
        intro="Accounts are being created by hand while this is in private beta."
        footer={
          <>
            Already have an account? <Link href="/login">Sign in</Link>.
          </>
        }
      >
        <p className="small">
          We are running a small closed beta so that every early account gets looked
          after properly. If you would like one, reply to the email that brought you
          here, or use the pilot link on the <Link href="/welcome">overview page</Link>.
        </p>
      </AuthShell>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void signUp();
  }

  async function signUp() {
    setError(null);
    if (password.length < 8) {
      setError("Please choose a password of at least 8 characters.");
      return;
    }
    const supabase = browserSupabase();
    if (supabase === null) {
      setError("No identity provider is configured for this installation.");
      return;
    }
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    setBusy(false);
    if (signUpError !== null) {
      setError(signUpError.message);
      return;
    }
    // No session means Supabase sent a confirmation mail instead.
    if (data.session === null) {
      setSent(true);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        intro="We have sent a confirmation link to that address."
      >
        <p className="small">
          Open it to finish creating your account. If it does not arrive within a few
          minutes, check the spam folder before trying again.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      intro="Your resume and job postings are stored against this account and nobody else's."
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>.
        </>
      }
    >
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
            autoComplete="new-password"
            minLength={8}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="hint">At least 8 characters.</p>
        </div>
        {error === null ? null : (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
