import "server-only";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { canView, VIEWS, ROLE_LABEL, type StudioView } from "@/lib/authz";
import { colors, pageStyle } from "./ui";

/**
 * The guarded shell every protected page renders inside.
 * - Unauthenticated → redirect to /login.
 * - Authenticated but unauthorized for this view → 403 (no content leak).
 * Access is logged (structured, no secrets).
 */
export async function StudioShell({
  view,
  children,
}: {
  view: StudioView;
  children: ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer.authenticated || viewer.role === null) redirect("/login");

  const meta = VIEWS.find((v) => v.view === view);
  const operating = meta?.operating ?? false;

  console.info(
    JSON.stringify({
      evt: "vstudio.access",
      view,
      role: viewer.role,
      email: viewer.email,
      dev: viewer.dev,
      at: new Date().toISOString(),
    }),
  );

  if (!canView(viewer.role, { operating })) {
    return (
      <main style={{ ...pageStyle, color: colors.text }}>
        <h1 style={{ fontSize: 20 }}>403 — Not authorized</h1>
        <p style={{ color: colors.dim, fontSize: 13 }}>
          Your role ({ROLE_LABEL[viewer.role]}) does not have access to this view.
        </p>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text }}>
      <header
        style={{ borderBottom: `1px solid ${colors.border}`, background: colors.panel }}
      >
        <div
          style={{
            ...pageStyle,
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a
              href="/"
              style={{
                color: colors.text,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Herman Legacy Venture Studio
            </a>
            <nav style={{ display: "flex", gap: 14 }}>
              {VIEWS.filter((v) => canView(viewer.role, v)).map((v) => (
                <a
                  key={v.view}
                  href={v.path}
                  style={{ color: colors.dim, textDecoration: "none", fontSize: 13 }}
                >
                  {v.label}
                </a>
              ))}
            </nav>
          </div>
          <div style={{ fontSize: 12, color: colors.dim }}>
            {ROLE_LABEL[viewer.role]}
            {viewer.dev ? " · dev" : ""} ·{" "}
            <a href="/logout" style={{ color: colors.accent }}>
              Sign out
            </a>
          </div>
        </div>
      </header>
      <main style={pageStyle}>{children}</main>
    </div>
  );
}
