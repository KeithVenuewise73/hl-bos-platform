import { connect } from "@/lib/supabase";
import { myShops, OWNED_WEBSITE } from "@/lib/barberos";
import { Badge, Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The shops this person runs.
 *
 * With one shop -- which is every shop today -- this is a single card straight
 * through to the work. It is a list rather than a redirect because a barber who
 * owns two shops is a real thing and a redirect would hide the second one.
 */
export default async function Home() {
  const state = await connect();
  if (!state.connected) {
    return (
      <Shell>
        <Card title="Not signed in">
          <Empty>
            {state.reason}{" "}
            <a href="/login" style={{ color: "#58a6ff" }}>
              Sign in
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  let shops;
  try {
    shops = await myShops(state.client);
  } catch (e) {
    // Say what the database said. A blank list on a failed read looks exactly
    // like an account with no shop, and they are very different situations.
    return (
      <Shell email={state.email}>
        <Card title="Could not load your shops">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  if (shops.length === 0) {
    return (
      <Shell email={state.email}>
        <Card title="No shop is set up for this account yet">
          <Empty>
            You are signed in, but this account is not a member of a shop in BarberOS.
            Whoever set up your shop can add you to it.
          </Empty>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell email={state.email}>
      {shops.map((s) => {
        const hasWebsite = s.capabilities.includes(OWNED_WEBSITE);
        return (
          <Card
            key={s.tenantId}
            title={s.shopName}
            sub={`${s.chairCount ?? "?"} chair${s.chairCount === 1 ? "" : "s"}`}
          >
            {s.site !== null && (
              <p style={{ margin: "0 0 12px" }}>
                <Badge status={s.site.status} />
              </p>
            )}
            {hasWebsite ? (
              <a
                href={`/shop/${s.tenantId}`}
                style={{
                  display: "inline-block",
                  padding: "10px 18px",
                  borderRadius: 6,
                  border: "1px solid #2f3742",
                  color: "#58a6ff",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {s.site === null ? "Set up your page →" : "Your page →"}
              </a>
            ) : (
              // The capability is off, so the editor would be refused by the
              // database. A link to a screen that cannot work is worse than
              // saying why it is not there.
              <Empty>
                Your page is not switched on for this shop yet, so there is nothing to
                edit here.
              </Empty>
            )}
          </Card>
        );
      })}
    </Shell>
  );
}

function Shell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 64px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>BarberOS</h1>
        {email !== undefined && email !== null && (
          <span style={{ fontSize: 12, color: "#6e7681" }}>{email}</span>
        )}
      </header>
      {children}
    </main>
  );
}
