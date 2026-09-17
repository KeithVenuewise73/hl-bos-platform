"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { browserSupabase } from "@/lib/browser.ts";
import { AuthShell } from "@/components/AuthShell.tsx";

/**
 * Step one: ask for the email.
 *
 * The confirmation message is deliberately the same whether or not the address
 * has an account. Saying "no account with that email" turns a reset form into
 * a way of asking whether a named person is job-hunting, which for this
 * product is a genuinely harmful thing to leak.
 */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void request();
  }

  async function request() {
    setError(null);
    const supabase = browserSupabase();
    if (supabase === null) {
      setError("No identity provider is configured for this installation.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password/update`,
    });
    setBusy(false);
    // Rate limiting is worth surfacing; "no such user" is not, and Supabase
    // does not report it here anyway.
    if (resetError !== null && resetError.status === 429) {
      setError("Too many attempts. Please wait a minute and try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        intro="If that address has an account, a reset link is on its way."
      >
        <p className="small">
          The link is valid for a short time. If it expires, request another one.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      intro="We will email you a link to choose a new one."
      footer={<Link href="/login">Back to sign in</Link>}
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
        {error === null ? null : (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}

/**
 * Step two: the page the emailed link lands on.
 *
 * The recovery token arrives in the URL fragment and the Supabase client turns
 * it into a session on load. Until that has happened there is nothing to
 * update, so the form waits rather than letting someone type a new password
 * into a page that would reject it.
 */
export function ResetUpdateForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = browserSupabase();
    if (supabase === null) {
      setError("No identity provider is configured for this installation.");
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session !== null) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session !== null) setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void update();
  }

  async function update() {
    setError(null);
    if (password.length < 8) {
      setError("Please choose a password of at least 8 characters.");
      return;
    }
    const supabase = browserSupabase();
    if (supabase === null) return;
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError !== null) {
      setError(updateError.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro="This replaces the password on your account."
      footer={<Link href="/login">Back to sign in</Link>}
    >
      {!ready && error === null ? (
        <p className="small muted">
          Waiting for the reset link to be verified. If you opened this page directly,
          request a link from <Link href="/reset-password">the reset form</Link>.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={!ready}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="hint">At least 8 characters.</p>
          </div>
          {error === null ? null : (
            <div className="notice notice-danger" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy || !ready}>
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
