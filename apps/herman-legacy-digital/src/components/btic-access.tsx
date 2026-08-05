import Link from "next/link";
import type { InternalViewer } from "@/lib/session";

/**
 * Access-denied / sign-in notice for the Business Transformation Intelligence
 * Center. Rendered inside the /intelligence layout, so it inherits the
 * section-wide noindex. Never leaks whether an engagement or dossier exists, and
 * carries no PII beyond the coarse state.
 */
export function BticAccessNotice({ viewer }: { viewer: InternalViewer }) {
  const authed = viewer.authenticated;
  return (
    <main
      style={{
        maxWidth: 460,
        margin: "0 auto",
        padding: "72px 24px",
        fontFamily: "inherit",
        color: "#0f1720",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Internal access required</h1>
      {authed ? (
        <p style={{ fontSize: 13.5, color: "#5b6672", lineHeight: 1.5 }}>
          The Business Transformation Intelligence Center is restricted to Herman Legacy
          Digital team members. Your account does not have internal access.{" "}
          <Link href="/portal" style={{ color: "#1f5f8b" }}>
            Go to your portal
          </Link>
          .
        </p>
      ) : (
        <p style={{ fontSize: 13.5, color: "#5b6672", lineHeight: 1.5 }}>
          Please{" "}
          <Link href="/admin-login?next=/intelligence" style={{ color: "#1f5f8b" }}>
            sign in with your HLD team account
          </Link>{" "}
          to continue.
        </p>
      )}
    </main>
  );
}
