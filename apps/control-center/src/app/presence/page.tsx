import { placesConfigMessage } from "@hl-bos/presence-scanner";

import { Card } from "@/components/ui";
import { LeadBoard } from "@/components/LeadBoard";
import { PresenceScanForm } from "@/components/PresenceScanForm";
import { C } from "@/components/presence-style";
import { leadBoard, toLeadRow } from "@/lib/presence";
import { placesKey } from "@/lib/presence-runtime";
import { FilePresenceRepository } from "@/lib/presence-store";

export const dynamic = "force-dynamic";

export default async function PresencePage() {
  const repo = new FilePresenceRepository();
  const [prospects, scans, key] = await Promise.all([
    leadBoard(repo),
    repo.listScans(),
    placesKey(),
  ]);
  const connected = Boolean(key);
  const last = scans[0];

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a href="/" style={{ color: C.link, fontSize: 13, textDecoration: "none" }}>
        ← Back to the console
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>HLG Presence Scanner</h1>
      <p style={{ margin: "0 0 22px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        Find local businesses with a weak online presence, see exactly why, and rank
        them. Internal and read-only: it looks at public websites and Google listings.
        It never contacts anyone, publishes anything or sends a message.
      </p>

      <Card title="Start a market scan" sub={placesConfigMessage(connected)}>
        {!connected ? (
          <p style={{ margin: "-6px 0 14px", fontSize: 12.5 }}>
            <a href="/connect" style={{ color: C.link }}>
              Add a Google Places key on the Connections page
            </a>{" "}
            when you want Google search switched on.
          </p>
        ) : null}
        <PresenceScanForm placesConnected={connected} />
      </Card>

      {last ? (
        <Card
          title="Last scan"
          sub={`${last.request.market || last.request.zip} · ${last.startedAt.slice(0, 16).replace("T", " ")} UTC · score ${last.scoringVersion}`}
        >
          {last.error ? (
            <p style={{ margin: 0, fontSize: 13, color: C.red }}>{last.error}</p>
          ) : (
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
              {(
                [
                  ["Found", last.counts.discovered],
                  ["Duplicates merged", last.counts.duplicates],
                  ["Websites inspected", last.counts.inspected],
                  ["Qualified", last.counts.qualified],
                  ["To review", last.counts.needsReview],
                  ["Excluded", last.counts.excluded],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{k}</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {last.apiUsage
                    ? `$${last.apiUsage.estimatedCostUsd.toFixed(2)}`
                    : "$0"}
                </div>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  {last.apiUsage
                    ? `${last.apiUsage.requests} Google request(s), list price`
                    : "No Google requests"}
                </div>
              </div>
            </div>
          )}
          {last.warnings.length ? (
            <ul
              style={{
                margin: "12px 0 0",
                paddingLeft: 18,
                fontSize: 12,
                color: C.muted,
              }}
            >
              {last.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card
        title="Lead Board"
        sub="Click a column to sort; click a business for its Lead Card with every finding and the evidence behind it. Google ratings, reviews and listing data: Google Maps."
      >
        <LeadBoard rows={prospects.map(toLeadRow)} />
      </Card>
    </main>
  );
}
