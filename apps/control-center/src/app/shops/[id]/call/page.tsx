import { connect } from "@/lib/shop-audit";
import { HLD_TENANT_SLUG } from "@/lib/shop-audit-sql";
import { loadCall } from "@/lib/discovery-sql";
import { Card, Empty } from "@/components/ui";
import { CallScreen } from "@/components/CallScreen";

export const dynamic = "force-dynamic";

/**
 * The discovery call.
 *
 * The audit sees a shop's website from outside. Only the owner can tell us
 * about the phones, the appointment book and what they keep on a regular --
 * and those are where the money leaks. This is the screen for asking, with the
 * opportunity assembling alongside as they answer.
 */
export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await connect();
  if (!state.connected) {
    return (
      <Shell>
        <Card title="Not connected to the database">
          <Empty>
            {state.reason}{" "}
            <a href="/connect" style={{ color: "#58a6ff" }}>
              Connect accounts
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  let call;
  try {
    call = await loadCall(state.conn.run, HLD_TENANT_SLUG, id);
  } catch (e) {
    // Say what went wrong. An empty form on a failed read looks exactly like a
    // shop nobody has called, and they are very different situations.
    return (
      <Shell>
        <Card title="Could not open this shop">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  if (call === null) {
    return (
      <Shell>
        <Card title="No such shop">
          <Empty>
            Nothing in the prospect list has that id.{" "}
            <a href="/shops" style={{ color: "#58a6ff" }}>
              Back to the list
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  if (call.catalog.length === 0) {
    // Without the catalog there is nothing to cross-reference against, and a
    // screen that silently offered nothing would read as "this shop needs
    // nothing" -- the opposite of the truth.
    return (
      <Shell>
        <Card title="The capability catalog is empty">
          <Empty>
            This project has no BarberOS capabilities recorded, so there is nothing to
            match a shop against. That means migration 0048 has not been applied here.
          </Empty>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card
        title={call.shopName}
        sub={[call.locality, "discovery call"].filter(Boolean).join(" · ")}
      >
        <CallScreen
          prospectId={id}
          shopName={call.shopName}
          phone={call.phone}
          answeredAt={call.answeredAt}
          initial={call.stack}
          initialNotes={call.notes}
          catalog={call.catalog}
        />
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <p style={{ margin: "0 0 18px", fontSize: 13 }}>
        <a href="/shops" style={{ color: "#58a6ff" }}>
          ← Shop Analysis
        </a>
      </p>
      {children}
    </main>
  );
}
