"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import type { Go } from "@/lib/nav";
import { latestEngagement, openEngagement, scorecardFor } from "@/lib/store";
import { STAGE_LABELS } from "@hl-bos/bti-engine";
import { Card, Badge, EmptyState, Field, scoreColor } from "@/components/ui";

// CLIENT DASHBOARD — the portfolio of businesses and their engagements, plus the
// "New Engagement" entry point.
export default function Clients({ go }: { go: Go }) {
  const { ws, update } = useWorkspace();
  const [selected, setSelected] = useState<string>(ws.businesses[0]?.id ?? "");

  function startEngagement() {
    const b = ws.businesses.find((x) => x.id === selected);
    if (!b) return;
    let newId = "";
    update((draft) => {
      const e = openEngagement(draft, selected);
      newId = e.id;
    });
    // navigate after state settles
    setTimeout(
      () => go({ view: "engagement", engagementId: newId, tab: "overview" }),
      0,
    );
  }

  const selectedBiz = ws.businesses.find((x) => x.id === selected);

  return (
    <div className="content">
      <div className="page-head">
        <h1>Clients</h1>
        <p>Each client gets its own transformation workspace.</p>
      </div>

      <Card title="New engagement">
        <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
          <div style={{ minWidth: 260 }}>
            <Field label="Business">
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {ws.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.analysisOnly ? "(analysis only)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button className="btn primary" onClick={startEngagement}>
            Open engagement →
          </button>
        </div>
        {selectedBiz?.analysisOnly && (
          <div className="banner" style={{ marginTop: 6 }}>
            ⚠ {selectedBiz.name} is <strong>analysis only</strong>: the engagement can
            be assessed and receive a blueprint with recommendations, but not a
            proposal, implementation, or billing.
          </div>
        )}
      </Card>

      <div className="section-title">Portfolio</div>
      <div className="grid cols-2">
        {ws.businesses.map((b) => {
          const eng = latestEngagement(ws, b.id);
          const t = eng ? scorecardFor(eng.assessment).transformation : null;
          return (
            <Card key={b.id}>
              <div className="row spread">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontSize: 15.5 }}>{b.name}</strong>
                    {b.demo && <Badge kind="demo">Demonstration</Badge>}
                  </div>
                  <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {b.industry}
                  </div>
                </div>
                {b.analysisOnly ? (
                  <Badge kind="info">Analysis only</Badge>
                ) : (
                  <Badge kind="ok">Full</Badge>
                )}
              </div>
              <div className="row spread" style={{ marginTop: 14 }}>
                <div className="dim" style={{ fontSize: 13 }}>
                  {eng ? (
                    <>
                      Stage:{" "}
                      <strong style={{ color: "var(--text)" }}>
                        {STAGE_LABELS[eng.stage]}
                      </strong>
                    </>
                  ) : (
                    "No engagement yet"
                  )}
                </div>
                <div style={{ fontWeight: 700, color: scoreColor(t) }}>
                  {t === null ? "—" : t}
                </div>
              </div>
              {eng ? (
                <button
                  className="btn sm"
                  style={{ marginTop: 12 }}
                  onClick={() =>
                    go({ view: "engagement", engagementId: eng.id, tab: "overview" })
                  }
                >
                  Open workspace →
                </button>
              ) : (
                <div className="dim" style={{ fontSize: 12, marginTop: 12 }}>
                  Use “New engagement” above to begin.
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {ws.businesses.length === 0 && (
        <EmptyState icon="🏢" title="No businesses configured" />
      )}
    </div>
  );
}
