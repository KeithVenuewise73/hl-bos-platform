"use client";

import { useWorkspace } from "@/lib/workspace";
import type { Go } from "@/lib/nav";
import { latestEngagement, scorecardFor, engagementsForBusiness } from "@/lib/store";
import { STAGE_LABELS } from "@hl-bos/bti-engine";
import { Card, Badge, ScoreBar, scoreColor, scoreWord } from "@/components/ui";

// CEO COMMAND CENTER — cross-business executive view (HSCS, Venuewise,
// HomeHuddle, 5-Star, and any future business). Honest: a business with no
// completed assessment shows "No assessment yet", never an invented score.
export default function CommandCenter({ go }: { go: Go }) {
  const { ws } = useWorkspace();

  return (
    <div className="content">
      <div className="page-head">
        <h1>CEO Command Center</h1>
        <p>Transformation status across every Herman Legacy business.</p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="stat-label">Businesses</div>
          <div className="stat-value">{ws.businesses.length}</div>
          <div className="stat-sub">in the portfolio</div>
        </div>
        <div className="stat">
          <div className="stat-label">Active engagements</div>
          <div className="stat-value">
            {ws.engagements.filter((e) => e.stage !== "declined").length}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Completed assessments</div>
          <div className="stat-value">
            {ws.engagements.filter((e) => e.assessment.completed).length}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Full-transformation clients</div>
          <div className="stat-value">
            {ws.businesses.filter((b) => !b.analysisOnly).length}
          </div>
          <div className="stat-sub">others are analysis-only</div>
        </div>
      </div>

      <div className="grid" style={{ gap: 12 }}>
        {ws.businesses.map((b) => {
          const eng = latestEngagement(ws, b.id);
          const scores = eng ? scorecardFor(eng.assessment) : null;
          const t = scores?.transformation ?? null;
          const openProjects = eng
            ? eng.projects.filter((p) => p.status === "active").length
            : 0;
          const done = eng ? engagementsForBusiness(ws, b.id).length : 0;
          return (
            <Card key={b.id}>
              <div className="row spread">
                <div className="row" style={{ gap: 12 }}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <strong style={{ fontSize: 16 }}>{b.name}</strong>
                      {b.analysisOnly ? (
                        <Badge kind="info">Analysis only</Badge>
                      ) : (
                        <Badge kind="ok">Full transformation</Badge>
                      )}
                      {b.demo && <Badge kind="demo">Demonstration</Badge>}
                    </div>
                    <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {b.industry} · pack: {b.pack}
                    </div>
                  </div>
                </div>
                <div className="row">
                  {eng ? (
                    <button
                      className="btn sm"
                      onClick={() =>
                        go({
                          view: "engagement",
                          engagementId: eng.id,
                          tab: "overview",
                        })
                      }
                    >
                      Open workspace →
                    </button>
                  ) : (
                    <Badge>Not started</Badge>
                  )}
                </div>
              </div>

              <div className="grid cols-4" style={{ marginTop: 14, gap: 12 }}>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Transformation
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: scoreColor(t) }}>
                    {t === null ? "—" : t}
                    <span className="dim" style={{ fontSize: 12, fontWeight: 500 }}>
                      {" "}
                      {scoreWord(t)}
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <ScoreBar score={t} />
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Stage
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {eng ? STAGE_LABELS[eng.stage] : "—"}
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Open projects
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {b.analysisOnly ? "n/a" : openProjects}
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Engagements
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{done}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
