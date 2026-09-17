import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame every auth screen sits in.
 *
 * Shared so sign-in, sign-up and the two reset steps cannot drift apart into
 * four slightly different pages, which is how an auth flow starts feeling
 * untrustworthy at exactly the moment a person is typing a password.
 */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", padding: "0 16px" }}>
      <h1 style={{ marginBottom: 6 }}>{title}</h1>
      <p className="muted small" style={{ marginBottom: 20 }}>
        {intro}
      </p>
      <div className="card">{children}</div>
      {footer === undefined ? null : (
        <p className="muted small" style={{ marginTop: 16 }}>
          {footer}
        </p>
      )}
      <p className="muted small" style={{ marginTop: 24 }}>
        <Link href="/welcome">What this is</Link> · <Link href="/privacy">Privacy</Link>{" "}
        · <Link href="/data-handling">Your data</Link>
      </p>
    </div>
  );
}
