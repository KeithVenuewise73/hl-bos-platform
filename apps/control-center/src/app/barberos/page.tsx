import { connect } from "@/lib/shop-audit";
import {
  completeness,
  decidedAgainst,
  loadProductMap,
  shipped,
  waitingOnCeo,
  waitingOnEngineering,
  type Capability,
} from "@/lib/product-map";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * What BarberOS is, read from the catalog rather than described.
 *
 * This page and the proposal read the SAME table, so they cannot disagree
 * about what is sellable. If a module shows as shipped here, a proposal may
 * rest a contract on it; if it does not, migration 0055's trigger will refuse
 * to let one try.
 *
 * The split that matters is not built/unbuilt. It is WHO CAN MOVE IT: most of
 * this product is waiting on an account somebody has to open, not on code.
 */
export default async function BarberOsPage() {
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

  let all;
  try {
    all = await loadProductMap(state.conn.run);
  } catch (e) {
    // An empty page here would read as "BarberOS has no modules", which is a
    // very different statement from "the catalog could not be read".
    return (
      <Shell>
        <Card title="Could not read the capability catalog">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  if (all.length === 0) {
    return (
      <Shell>
        <Card title="The capability catalog is empty">
          <Empty>
            This project has no BarberOS capabilities recorded, which means migration
            0048 has not been applied here.
          </Empty>
        </Card>
      </Shell>
    );
  }

  const c = completeness(all);
  const ceo = waitingOnCeo(all);
  const eng = waitingOnEngineering(all);

  return (
    <Shell>
      <div
        style={{
          background: "#0d1117",
          border: "1px solid #21262d",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 18,
        }}
      >
        <p style={{ margin: 0, fontSize: 15, color: "#e6edf3" }}>
          <strong>
            {c.shipped} of {c.sellable}
          </strong>{" "}
          modules are built and sellable today.{" "}
          {ceo.length > 0 && (
            <>
              <strong>{ceo.length}</strong> cannot start until an account is opened —
              those are the ones only you can move.
            </>
          )}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6e7681" }}>
          Read from the capability catalog in HL-BOS Core, which is the same table a
          proposal is checked against. Nothing on this page is a description of intent.
        </p>
      </div>

      <Group
        title="Built — a proposal may sell these"
        tone="#3fb950"
        caps={shipped(all)}
        empty="Nothing is shipped yet."
      />
      <Group
        title="Waiting on an account only you can open"
        tone="#d29922"
        caps={ceo}
        empty="Nothing is waiting on you."
        note="Each of these is blocked on a credential, a number or an app review — a decision about trust, not engineering time."
      />
      <Group
        title="Waiting on engineering — mine"
        tone="#58a6ff"
        caps={eng}
        empty="Nothing is waiting on engineering."
      />
      <Group
        title="Decided against"
        tone="#6e7681"
        caps={decidedAgainst(all)}
        empty="Nothing has been ruled out."
        note="Not a queue position. These never appear in a proposal, in any form."
      />
    </Shell>
  );
}

function Group({
  title,
  tone,
  caps,
  empty,
  note,
}: {
  title: string;
  tone: string;
  caps: Capability[];
  empty: string;
  note?: string;
}) {
  return (
    <Card title={title} sub={`${caps.length}`}>
      {note !== undefined && caps.length > 0 && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8b949e" }}>{note}</p>
      )}
      {caps.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        caps.map((cap) => (
          <div
            key={cap.key}
            style={{
              border: "1px solid #21262d",
              borderLeft: `3px solid ${tone}`,
              borderRadius: 6,
              padding: "11px 13px",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
              {cap.name}
              <span style={{ marginLeft: 8, fontSize: 11, color: "#6e7681" }}>
                {cap.category}
              </span>
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#8b949e" }}>
              {cap.description}
            </p>
            {cap.blockedOn !== null && (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: tone }}>
                Waiting on: {cap.blockedOn}
              </p>
            )}
            {cap.requires.length > 0 && (
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#6e7681" }}>
                Needs first: {cap.requires.join(", ")}
              </p>
            )}
          </div>
        ))
      )}
    </Card>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>
      <p style={{ margin: "0 0 6px", fontSize: 13 }}>
        <a href="/" style={{ color: "#58a6ff" }}>
          ← Control Center
        </a>
      </p>
      <h1 style={{ margin: "0 0 18px", fontSize: 22 }}>BarberOS</h1>
      {children}
    </main>
  );
}
