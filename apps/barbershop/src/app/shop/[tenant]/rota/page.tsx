import { connect } from "@/lib/supabase";
import { BOOKING, myShops } from "@/lib/barberos";
import { loadBoard } from "@/lib/booking";
import { Card, Empty } from "@/components/ui";
import { AddBarber, RotaEditor } from "@/components/BookingScreens";

export const dynamic = "force-dynamic";

/** Who works here, and when. Separate from the book because it is a different job. */
export default async function RotaPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

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

  let shops, board;
  try {
    shops = await myShops(state.client);
  } catch (e) {
    return (
      <Shell tenant={tenant}>
        <Card title="Could not open the rota">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }
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
  if (!shop.capabilities.includes(BOOKING)) {
    return (
      <Shell tenant={tenant} name={shop.shopName}>
        <Card title="The appointment book is not switched on">
          <Empty>
            This shop does not have the booking capability enabled, so there is no rota
            to keep. Whoever set up your account can turn it on.
          </Empty>
        </Card>
      </Shell>
    );
  }

  try {
    board = await loadBoard(state.client, tenant);
  } catch (e) {
    return (
      <Shell tenant={tenant} name={shop.shopName}>
        <Card title="Could not read the rota">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell tenant={tenant} name={shop.shopName}>
      {board.barbers.length === 0 ? (
        <Card title="Nobody on the rota yet">
          <Empty>
            An appointment is booked with a person. Add whoever takes appointments here
            — this is not a staff list and carries no logins or pay.
          </Empty>
          {shop.can.manageRota && (
            <div style={{ marginTop: 14 }}>
              <AddBarber tenantId={tenant} />
            </div>
          )}
        </Card>
      ) : (
        <>
          {board.barbers.map((b) => (
            <Card
              key={b.id}
              title={b.displayName}
              sub={b.active ? undefined : "not taking appointments"}
            >
              <RotaEditor
                tenantId={tenant}
                barber={b}
                mayManage={shop.can.manageRota}
              />
            </Card>
          ))}
          {shop.can.manageRota && (
            <Card title="Someone else">
              <AddBarber tenantId={tenant} />
            </Card>
          )}
        </>
      )}

      <Card title="How the book behaves">
        <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
          Times are offered every {board.settings.slotMinutes} minutes
          {board.settings.leadTimeMinutes > 0
            ? `, at least ${board.settings.leadTimeMinutes} minutes ahead`
            : ""}
          , up to {board.settings.maxDaysAhead} days out. All times are {board.timezone}
          .
          {board.settings.isDefault && (
            // Stated, because a number on a screen reads as a decision
            // somebody made until it says otherwise.
            <> These are the defaults — nobody at this shop has changed them.</>
          )}
        </p>
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
        {" · "}
        <a href={`/shop/${tenant}/book`} style={{ color: "#58a6ff" }}>
          Appointments
        </a>
      </p>
      <h1 style={{ fontSize: 20, margin: "0 0 20px" }}>Rota</h1>
      {children}
    </main>
  );
}
