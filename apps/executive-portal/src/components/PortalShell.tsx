import "server-only";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import {
  canView,
  groupedViewsFor,
  ROLE_LABEL,
  VIEWS,
  type PortalView,
} from "@/lib/authz";

/**
 * The guarded shell every protected page renders inside.
 * - Unauthenticated → redirect to /login (no portal content).
 * - Authenticated but unauthorized for this view → 403 (no content leak).
 * - Authorized → header + role-gated nav + the page content.
 * Every protected-page access is logged (stdout → platform log sink).
 */
export async function PortalShell({
  view,
  children,
}: {
  view: PortalView;
  children: ReactNode;
}) {
  const viewer = await getViewer();

  if (!viewer.authenticated || viewer.role === null) {
    redirect("/login");
  }

  const meta = VIEWS.find((v) => v.view === view)!;

  // Audit: protected-page access (structured, no secrets).
  console.info(
    JSON.stringify({
      evt: "portal.access",
      view,
      role: viewer.role,
      email: viewer.email,
      dev: viewer.dev,
      at: new Date().toISOString(),
    }),
  );

  if (!canView(viewer.role, view)) {
    console.info(
      JSON.stringify({
        evt: "portal.access_denied",
        view,
        role: viewer.role,
        email: viewer.email,
      }),
    );
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 20 }}>403 — Not authorized</h1>
        <p style={{ color: "#8b949e", fontSize: 13 }}>
          Your role ({ROLE_LABEL[viewer.role]}) does not have access to “{meta.label}”.
          This access attempt was logged.
        </p>
        <p style={{ marginTop: 16 }}>
          <a href="/" style={{ color: "#58a6ff" }}>
            ← Back to the dashboard
          </a>
        </p>
      </main>
    );
  }

  const groups = groupedViewsFor(viewer.role);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "22px 24px 64px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Herman Legacy Executive Portal
          </div>
          <div style={{ fontSize: 12, color: "#6e7681" }}>Read-only · {meta.label}</div>
        </div>
        <div style={{ fontSize: 12, color: "#8b949e", textAlign: "right" }}>
          {viewer.email} · <strong>{ROLE_LABEL[viewer.role]}</strong>
          {viewer.dev ? " · dev" : ""}
          <br />
          <a href="/logout" style={{ color: "#58a6ff", fontSize: 12 }}>
            Sign out
          </a>
        </div>
      </header>

      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 18px",
          marginBottom: 20,
          paddingBottom: 14,
          borderBottom: "1px solid #21262d",
        }}
      >
        {groups.map((g) => (
          <div
            key={g.group}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "#6e7681",
              }}
            >
              {g.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {g.views.map((v) => (
                <a
                  key={v.view}
                  href={v.path}
                  style={{
                    fontSize: 12.5,
                    padding: "5px 10px",
                    borderRadius: 8,
                    textDecoration: "none",
                    color: v.view === view ? "#e8eaed" : "#8b949e",
                    background: v.view === view ? "#1f6feb" : "#0d1117",
                    border: "1px solid #21262d",
                  }}
                >
                  {v.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {children}
    </div>
  );
}
