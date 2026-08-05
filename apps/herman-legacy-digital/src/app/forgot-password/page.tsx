"use client";

import { useState } from "react";
import { browserSupabase } from "@/lib/browser";

/**
 * Forgot Password — step 1 of recovery. Sends a Supabase recovery email whose
 * link returns to /reset-password (step 2). Reuses Supabase Auth completely; no
 * new identity system, no service-role key, nothing stored here.
 *
 * The response is deliberately neutral (no account enumeration): the same
 * message is shown whether or not an account exists for the address.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = browserSupabase();
    if (!supabase) {
      setError("Password recovery is not configured in this environment.");
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    // We do not branch on the result: a neutral confirmation avoids revealing
    // whether the address has an account.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <main style={mainStyle}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Check your email</h1>
        <p style={{ fontSize: 13, color: "#5b6672", lineHeight: 1.5 }}>
          If an account exists for that address, a password recovery link has been sent.
          Open it to choose a new password. The link expires shortly and can be used
          once.
        </p>
        <p style={{ fontSize: 12.5, color: "#5b6672", marginTop: 16 }}>
          <a href="/admin-login" style={{ color: "#1f5f8b" }}>
            Back to sign in
          </a>
        </p>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Reset your password</h1>
      <p style={{ fontSize: 12.5, color: "#5b6672", marginBottom: 20 }}>
        Enter your account email and we&rsquo;ll send a recovery link.
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
          style={inputStyle}
        />
        {error ? (
          <div style={{ color: "#b42318", fontSize: 12.5, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Sending…" : "Send recovery link"}
        </button>
      </form>
      <p style={{ fontSize: 12, color: "#5b6672", marginTop: 20 }}>
        <a href="/admin-login" style={{ color: "#1f5f8b" }}>
          Back to sign in
        </a>
      </p>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: 380,
  margin: "0 auto",
  padding: "72px 24px",
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  border: "1px solid #d5dae1",
  borderRadius: 10,
  color: "#0f1720",
  fontSize: 14,
  padding: "11px 13px",
  marginBottom: 10,
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f2740",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontSize: 14,
  padding: "11px 13px",
  cursor: "pointer",
};
