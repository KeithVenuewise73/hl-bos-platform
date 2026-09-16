"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote, Field, InfoNote, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/**
 * Where the emailed reset link lands.
 *
 * Supabase signs the user in from the link itself, so by the time this screen
 * renders the session already exists and all that is left is choosing a new
 * password.
 */
export default function ResetPasswordPage() {
  const { state, updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "unavailable") {
    return (
      <main>
        <TopBar back="/" />
        <h1>Choose a new password</h1>
        <InfoNote>This build has no account service configured.</InfoNote>
        <Link className="btn btn-primary btn-block" href="/">
          Continue
        </Link>
      </main>
    );
  }

  return (
    <main>
      <TopBar back="/login/" />
      <h1>Choose a new password</h1>

      {state.status === "signed-out" ? (
        <InfoNote>
          This link has expired or has already been used. Request a new one from{" "}
          <Link href="/forgot-password/">the reset page</Link>.
        </InfoNote>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void updatePassword(password).then((message) => {
            setBusy(false);
            if (message) setError(message);
            else router.push("/");
          });
        }}
      >
        <Field label="New password" hint="At least 6 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </Field>
        <button
          type="submit"
          className="btn-primary btn-block"
          style={{ marginTop: 20 }}
          disabled={busy || state.status !== "signed-in"}
        >
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </main>
  );
}
