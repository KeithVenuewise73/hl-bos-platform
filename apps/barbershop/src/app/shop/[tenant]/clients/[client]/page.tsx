import { connect } from "@/lib/supabase";
import { myShops } from "@/lib/barberos";
import { loadClient, money, shopTools } from "@/lib/crm";
import { Card, Empty } from "@/components/ui";
import { RecordVisit, Timeline } from "@/components/ClientScreens";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ tenant: string; client: string }>;
}) {
  const { tenant, client: clientId } = await params;
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

  let client, tools, shops;
  try {
    // The shop comes back too, because what this person may DO decides which
    // controls are drawn -- and the app must never work that out for itself.
    [client, tools, shops] = await Promise.all([
      loadClient(state.client, clientId),
      shopTools(state.client, tenant),
      myShops(state.client),
    ]);
  } catch (e) {
    return (
      <Shell tenant={tenant}>
        <Card title="Could not open this client">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  if (client === null) {
    return (
      <Shell tenant={tenant}>
        <Card title="No such client">
          <Empty>Nothing in this shop&apos;s list has that id.</Empty>
        </Card>
      </Shell>
    );
  }

  const mayManage =
    shops.find((s) => s.tenantId === tenant)?.can.manageClients === true;
  const r = client.rhythm;
  const value = money(client.value.totalCents);

  return (
    <Shell tenant={tenant} name={client.displayName}>
      <Card title={client.displayName} sub={client.phone ?? undefined}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6e7681" }}>WORTH SO FAR</div>
            <div style={{ fontSize: 20, color: "#e6edf3", marginTop: 2 }}>
              {client.value.visits === 0 ? "—" : value}
            </div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
              {/* The total never appears without its own gaps. */}
              {client.value.visits === 0
                ? "No visits recorded."
                : client.value.visitsWithoutAPrice === 0
                  ? `across ${client.value.visits} visit${client.value.visits === 1 ? "" : "s"}`
                  : `across ${client.value.visits} visits — ${client.value.visitsWithoutAPrice} of them with no price recorded`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6e7681" }}>COMES IN</div>
            <div style={{ fontSize: 20, color: "#e6edf3", marginTop: 2 }}>
              {r.typicalDays === null ? "—" : `every ${r.typicalDays} days`}
            </div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
              {/* The database's own words about why it does or does not know. */}
              {r.typicalDays === null
                ? r.basis
                : r.overdueByDays !== null && r.overdueByDays > 0
                  ? `${r.overdueByDays} days overdue`
                  : `last in ${r.daysSinceLast} days ago`}
            </div>
          </div>
        </div>
        {client.notes !== null && (
          <p style={{ margin: "14px 0 0", fontSize: 14, color: "#8b949e" }}>
            {client.notes}
          </p>
        )}
      </Card>

      <RecordVisit
        tenantId={tenant}
        clientId={clientId}
        knownTools={tools}
        mayManage={mayManage}
      />
      <Timeline client={client} />
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
        <a href={`/shop/${tenant}/clients`} style={{ color: "#58a6ff" }}>
          ← Clients
        </a>
      </p>
      <h1 style={{ fontSize: 20, margin: "0 0 20px" }}>{name ?? "Client"}</h1>
      {children}
    </main>
  );
}
