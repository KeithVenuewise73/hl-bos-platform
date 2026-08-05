import Link from "next/link";
import { getClientViewer, getInternalViewer } from "@/lib/session";
import { clientPortal } from "@/lib/portal-data";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Internal-only nav entry into BTIC. Rendered ONLY for internal HLD roles;
 * anonymous and client-only viewers never see it (it is not in the public
 * navigation). Role is resolved server-side.
 */
async function InternalBticEntry() {
  const internal = await getInternalViewer();
  if (!internal.canBTIC) return null;
  return (
    <Link
      href="/intelligence"
      style={{
        display: "block",
        marginBottom: 16,
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${colors.LINE}`,
        background: "#0f2740",
        color: "#fff",
        textDecoration: "none",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        Business Transformation Intelligence (BTIC)
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>
        Internal HLD workspace — engagements, reports, and intelligence.
      </div>
    </Link>
  );
}

// The authenticated client portal (Release 1). Defense in depth: middleware
// gates /portal, and this server component re-checks the viewer. Every section
// shows REAL data or an honest no-data state — nothing is fabricated.
export default async function PortalPage() {
  const viewer = await getClientViewer();
  if (!viewer.authenticated) {
    return (
      <Shell email={null}>
        <p style={{ color: colors.MUTED }}>
          Please <Link href="/login?next=/portal">sign in</Link> to view your portal.
        </p>
      </Shell>
    );
  }

  const portal = clientPortal(viewer.email);
  const mk = portal.marketplace;

  return (
    <Shell email={viewer.email}>
      <InternalBticEntry />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {portal.sections.map((s) => (
          <div
            key={s.key}
            style={{
              background: "#fff",
              border: `1px solid ${colors.LINE}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              {s.title}
            </div>
            <div style={{ fontSize: 13, color: colors.MUTED, lineHeight: 1.5 }}>
              {s.message}
            </div>
            {s.items ? (
              <ul
                style={{
                  margin: "8px 0 0",
                  paddingLeft: 18,
                  fontSize: 13,
                  color: colors.INK,
                }}
              >
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            ) : null}
            {s.status === "no_data" ? (
              <div style={{ fontSize: 11, color: "#98a2b0", marginTop: 6 }}>
                No data yet
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, margin: "28px 0 10px" }}>Innovation Marketplace</h2>
      <p style={{ fontSize: 12.5, color: colors.MUTED, marginTop: -4 }}>
        Your advisor sets your transformation plan. Additional solutions create a
        discussion request — they never change your plan automatically.
      </p>

      <MarketplaceTier
        heading="Recommended for your transformation"
        note="Confirmed with your advisor."
        items={mk.recommended}
      />
      <MarketplaceTier
        heading="Solutions currently in use"
        note={mk.inUse.length === 0 ? "None adopted yet." : ""}
        items={mk.inUse}
      />
      <MarketplaceTier
        heading="Explore additional Herman Legacy capabilities"
        note="Request a discussion to explore any of these."
        items={mk.explore}
        requestable
      />
    </Shell>
  );
}

function MarketplaceTier({
  heading,
  note,
  items,
  requestable,
}: {
  heading: string;
  note: string;
  items: { key: string; name: string; description: string; category: string }[];
  requestable?: boolean;
}) {
  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{heading}</div>
      {note ? <div style={{ fontSize: 12, color: colors.MUTED }}>{note}</div> : null}
      {items.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
            marginTop: 8,
          }}
        >
          {items.map((i) => (
            <div
              key={i.key}
              style={{
                background: "#fff",
                border: `1px solid ${colors.LINE}`,
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{i.name}</div>
              <div style={{ fontSize: 12.5, color: colors.MUTED, marginTop: 4 }}>
                {i.description}
              </div>
              {requestable ? (
                <Link
                  href={`/book?ref=${encodeURIComponent(i.key)}`}
                  style={{
                    fontSize: 12.5,
                    color: colors.ACCENT,
                    marginTop: 8,
                    display: "inline-block",
                  }}
                >
                  Request a discussion →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Shell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: colors.PAPER, minHeight: "100vh", color: colors.INK }}>
      <header
        style={{
          borderBottom: `1px solid ${colors.LINE}`,
          background: "#fff",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            style={{ fontWeight: 700, color: colors.INK, textDecoration: "none" }}
          >
            Herman Legacy <span style={{ color: colors.ACCENT }}>Digital</span>
          </Link>
          <div
            style={{ fontSize: 12.5, color: colors.MUTED, display: "flex", gap: 14 }}
          >
            {email ? <span>{email}</span> : null}
            <Link href="/logout" style={{ color: colors.ACCENT }}>
              Sign out
            </Link>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Client Portal</h1>
        <p style={{ fontSize: 13.5, color: colors.MUTED, marginTop: 0 }}>
          Your engagement, roadmap, documents and recommended solutions.
        </p>
        {children}
      </main>
    </div>
  );
}
