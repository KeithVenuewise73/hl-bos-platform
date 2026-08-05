"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/browser";
import { validateNewPassword } from "@/lib/password-policy";

/**
 * Reset Password — step 2 of recovery. The Supabase recovery link lands here and
 * the browser client (detectSessionInUrl) establishes a temporary recovery
 * session. This page is the surface that was missing: it detects that session
 * and prompts for a NEW password, then calls supabase.auth.updateUser().
 *
 * Honest states only — a valid recovery session shows the form; anything else
 * shows the invalid/expired notice. Never a fabricated success. Reuses Supabase
 * Auth completely; no token minting, no storage, no service-role key.
 *
 * On success the user is signed out and sent to /admin-login, so they
 * re-authenticate cleanly with the new password (fresh JWT with their claim).
 */

type Phase = "checking" | "ready" | "invalid" | "saving" | "done";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = browserSupabase();
    if (!supabase) {
      setPhase("invalid");
      return;
    }
    let active = true;

    // The recovery event may fire as the client parses the URL. Listen for it,
    // and also check for an already-established session (covers the race where
    // detectSessionInUrl completed before this effect ran).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setPhase((p) => (p === "checking" || p === "invalid" ? "ready" : p));
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setPhase((p) => (p === "checking" ? "ready" : p));
      } else {
        // Give detectSessionInUrl a brief moment; if still nothing, it is not a
        // valid recovery link.
        setTimeout(() => {
          if (active) setPhase((p) => (p === "checking" ? "invalid" : p));
        }, 1500);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = validateNewPassword(password, confirm);
    if (!check.ok) {
      setError(check.message ?? "Invalid password.");
      return;
    }
    const supabase = browserSupabase();
    if (!supabase) {
      setError("Password recovery is not configured in this environment.");
      return;
    }
    setPhase("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPhase("ready");
      setError("Could not update the password. The link may have expired.");
      return;
    }
    // New password set — end the recovery session and route to a clean sign-in.
    await supabase.auth.signOut();
    setPhase("done");
    setTimeout(() => {
      window.location.assign("/admin-login?next=/intelligence");
    }, 1200);
  }

  if (phase === "checking") {
    return (
      <main style={mainStyle}>
        <p style={{ fontSize: 13, color: "#5b6672" }}>Verifying your recovery link…</p>
      </main>
    );
  }

  if (phase === "invalid") {
    return (
      <main style={mainStyle}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Link invalid or expired</h1>
        <p style={{ fontSize: 13.5, color: "#5b6672", lineHeight: 1.5 }}>
          This password recovery link is invalid or has expired.{" "}
          <a href="/forgot-password" style={{ color: "#1f5f8b" }}>
            Request a new one
          </a>
          .
        </p>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main style={mainStyle}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Password updated</h1>
        <p style={{ fontSize: 13.5, color: "#5b6672", lineHeight: 1.5 }}>
          Your password has been changed. Redirecting you to sign in&hellip;
        </p>
        <p style={{ fontSize: 12.5, color: "#5b6672", marginTop: 12 }}>
          <a href="/admin-login" style={{ color: "#1f5f8b" }}>
            Continue to sign in
          </a>
        </p>
      </main>
    );
  }

  const busy = phase === "saving";
  return (
    <main style={mainStyle}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Choose a new password</h1>
      <p style={{ fontSize: 12.5, color: "#5b6672", marginBottom: 20 }}>
        Enter a new password for your account.
      </p>
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <input
          type="password"
          required
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          style={inputStyle}
        />
        <input
          type="password"
          required
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          style={inputStyle}
        />
        {error ? (
          <div style={{ color: "#b42318", fontSize: 12.5, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
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
