import { connect } from "@/lib/supabase";
import { myShops } from "@/lib/barberos";
import { clientsDue, listClients } from "@/lib/crm";
import { Card, Empty } from "@/components/ui";
import { AddClient } from "@/components/ClientScreens";

export const dynamic = "force-dynamic";

const CLIENT_CRM = "client_crm";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenant } = await params;
  const { q } = await searchParams;
  const search = q ?? "";

  const state = await connect();
  if (!state.connected) {
    return (
      <Shell tenant={tenant}>
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

  let shops, clients, due;
  try {
    shops = await myShops(state.client);
    const shop = shops.find((s) => s.tenantId === tenant);
    if (shop === undefined) {
      return (
        <Shell tenant={tenant}>
          <Card title="Not your shop">
            <Empty>This account is not a member of that shop.</Empty>
          </Card>
        </Shell>
      );
    }
    if (!shop.capabilities.includes(CLIENT_CRM)) {
      return (
        <Shell tenant={tenant} name={shop.shopName}>
          <Card title="Client records are not switched on">
            <Empty>
              This shop does not have the client record capability enabled, so there is
              nothing to show. Whoever set up your account can turn it on.
            </Empty>
          </Card>
        </Shell>
      );
    }
    [clients, due] = await Promise.all([
      listClients(state.client, tenant, search),
      clientsDue(state.client, tenant),
    ]);
  } catch (e) {
    // An empty list on a failed read looks exactly like a shop with no
    // clients, and those are very different situations.
    return (
      <Shell tenant={tenant}>
        <Card title="Could not read your clients">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  const shop = shops.find((s) => s.tenantId === tenant)!;

  return (
    <Shell tenant={tenant} name={shop.shopName}>
      {/* The one screen in this app that is worth money on its own. */}
      <Card
        title="Due back"
        sub={
          due.length === 0
            ? "Nobody is past their usual gap"
            : `${due.length} past their usual gap`
        }
      >
        {due.length === 0 ? (
          <Empty>
            Only clients with at least three visits appear here — before that there is
            no rhythm to be overdue against, and a guess would be worse than nothing.
          </Empty>
        ) : (
          due.map((d) => (
            <div
              key={d.id}
              style={{
                borderLeft: "3px solid #d29922",
                padding: "2px 0 2px 12px",
                margin: "0 0 12px",
              }}
            >
              <a
                href={`/shop/${tenant}/clients/${d.id}`}
                style={{ fontSize: 15, color: "#e6edf3", textDecoration: "none" }}
              >
                {d.displayName}
              </a>
              <div style={{ fontSize: 13, color: "#8b949e", marginTop: 2 }}>
                {d.overdueByDays} days past his usual {d.typicalDays}
                {d.phone !== null && (
                  <>
                    {" · "}
                    <a
                      href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}
                      style={{ color: "#58a6ff" }}
                    >
                      {d.phone}
                    </a>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title="Clients" sub={`${clients.length}`}>
        <form method="get" style={{ marginBottom: 14 }}>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name or number"
            style={{
              width: "100%",
              padding: "9px 11px",
              borderRadius: 6,
              border: "1px solid #2f3742",
              background: "#0d1117",
              color: "#e6edf3",
              fontSize: 14,
            }}
          />
        </form>
        {clients.length === 0 ? (
          <Empty>
            {search === "" ? "No clients yet." : `Nobody matches "${search}".`}
          </Empty>
        ) : (
          clients.map((c) => (
            <a
              key={c.id}
              href={`/shop/${tenant}/clients/${c.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                borderBottom: "1px solid #21262d",
                padding: "9px 0",
              }}
            >
              <span style={{ fontSize: 15, color: "#e6edf3" }}>{c.displayName}</span>
              <span style={{ float: "right", fontSize: 13, color: "#8b949e" }}>
                {c.visits === 0
                  ? "no visits yet"
                  : `${c.visits} visit${c.visits === 1 ? "" : "s"}`}
              </span>
              {c.phone !== null && (
                <div style={{ fontSize: 13, color: "#6e7681", marginTop: 2 }}>
                  {c.phone}
                </div>
              )}
            </a>
          ))
        )}
        <div style={{ marginTop: 16 }}>
          <AddClient tenantId={tenant} />
        </div>
      </Card>
    </Shell>
  );
}

function Shell({
  tenant,
  name,
  children,
}: {
  tenant: string;
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 64px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 13 }}>
        <a href={`/shop/${tenant}`} style={{ color: "#58a6ff" }}>
          ← {name ?? "Your shop"}
        </a>
      </p>
      <h1 style={{ fontSize: 20, margin: "0 0 20px" }}>Clients</h1>
      {children}
    </main>
  );
}
