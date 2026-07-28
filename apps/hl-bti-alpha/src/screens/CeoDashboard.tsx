"use client";

import { useWorkspace } from "@/lib/workspace";
import type { Go } from "@/lib/nav";
import { businessById, scorecardFor, projectCompletion } from "@/lib/store";
import { Card, Stat, Badge, EmptyState, ScoreBar } from "@/components/ui";

// CEO DASHBOARD — the executive operating center. Aggregates the real workspace;
// empty sections say so rather than showing invented figures.
export default function CeoDashboard({ go }: { go: Go }) {
  const { ws } = useWorkspace();

  const engagements = ws.engagements;
  const activeClients = new Set(
    engagements.filter((e) => e.stage !== "declined").map((e) => e.businessId),
  ).size;
  const assessmentsDone = engagements.filter((e) => e.assessment.completed).length;
  const openProposals = engagements.filter(
    (e) =>
      e.proposal &&
      e.proposal.status !== "accepted" &&
      e.proposal.status !== "declined",
  ).length;
  const activeProjects = engagements
    .flatMap((e) => e.projects)
    .filter((p) => p.status === "active").length;
  const realizedRoi = engagements
    .flatMap((e) => e.roi)
    .filter((m) => m.status === "realized")
    .reduce((n, m) => n + (m.realized ?? 0), 0);

  const scored = engagements.filter((e) => e.assessment.completed);
  const avgTransformation =
    scored.length === 0
      ? null
      : Math.round(
          scored
            .map((e) => scorecardFor(e.assessment).transformation ?? 0)
            .reduce((a, b) => a + b, 0) / scored.length,
        );

  const activity = engagements
    .flatMap((e) =>
      e.timeline.map((t) => ({
        label: t.label,
        biz: businessById(ws, e.businessId)?.name ?? "",
        demo: e.demo,
      })),
    )
    .slice(-8)
    .reverse();

  return (
    <div className="content">
      <div className="page-head">
        <h1>Executive Dashboard</h1>
        <p>Your Business Transformation operating center.</p>
      </div>

      <div className="grid cols-4">
        <Stat label="Active clients" value={activeClients} />
        <Stat label="Assessments completed" value={assessmentsDone} />
        <Stat
          label="Avg transformation score"
          value={avgTransformation === null ? "—" : avgTransformation}
          sub={
            avgTransformation === null
              ? "no completed assessments"
              : "across completed assessments"
          }
        />
        <Stat label="Open proposals" value={openProposals} />
      </div>
      <div className="grid cols-4" style={{ marginTop: 14 }}>
        <Stat label="Active implementation projects" value={activeProjects} />
        <Stat
          label="Realized ROI (recorded)"
          value={realizedRoi === 0 ? "—" : realizedRoi.toLocaleString()}
          sub="sum of realized metrics"
        />
        <Stat
          label="Revenue pipeline"
          value="—"
          sub="pricing is a CEO decision — not set"
        />
        <Stat label="Businesses" value={ws.businesses.length} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <Card title="Implementation status">
          {activeProjects === 0 ? (
            <EmptyState icon="🧭" title="No active projects yet">
              Projects appear here once an engagement reaches implementation.
            </EmptyState>
          ) : (
            <div className="list">
              {engagements.flatMap((e) =>
                e.projects.map((p) => (
                  <div className="li" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <div className="dim" style={{ fontSize: 12 }}>
                        {businessById(ws, e.businessId)?.name}
                      </div>
                    </div>
                    <div style={{ width: 120 }}>
                      <ScoreBar score={projectCompletion(p)} />
                      <div className="dim" style={{ fontSize: 11, textAlign: "right" }}>
                        {projectCompletion(p)}%
                      </div>
                    </div>
                  </div>
                )),
              )}
            </div>
          )}
        </Card>

        <Card title="Recent activity">
          {activity.length === 0 ? (
            <EmptyState icon="🕰" title="No activity yet" />
          ) : (
            <div className="list">
              {activity.map((a, i) => (
                <div className="li" key={i}>
                  <div>
                    {a.label}
                    <div className="dim" style={{ fontSize: 12 }}>
                      {a.biz}
                    </div>
                  </div>
                  {a.demo && <Badge kind="demo">Demo</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <Card title="Open proposals">
          {openProposals === 0 ? (
            <EmptyState icon="📄" title="No open proposals" />
          ) : (
            <div className="list">
              {engagements
                .filter(
                  (e) =>
                    e.proposal &&
                    e.proposal.status !== "accepted" &&
                    e.proposal.status !== "declined",
                )
                .map((e) => (
                  <button
                    className="li"
                    key={e.id}
                    onClick={() =>
                      go({ view: "engagement", engagementId: e.id, tab: "proposal" })
                    }
                  >
                    <strong>{businessById(ws, e.businessId)?.name}</strong>
                    <Badge kind="warn">{e.proposal?.status.replace(/_/g, " ")}</Badge>
                  </button>
                ))}
            </div>
          )}
        </Card>

        <Card title="Quick actions">
          <div className="list">
            <button className="li" onClick={() => go({ view: "clients" })}>
              <span>➕ Start a new engagement</span>
              <span className="dim">→</span>
            </button>
            <button className="li" onClick={() => go({ view: "command" })}>
              <span>🏢 Open the CEO Command Center</span>
              <span className="dim">→</span>
            </button>
            <button className="li" onClick={() => go({ view: "clients" })}>
              <span>📋 Review clients</span>
              <span className="dim">→</span>
            </button>
          </div>
          <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
            Upcoming meetings and calendar sync are not wired in the Alpha — this panel
            will not show meetings it does not have.
          </div>
        </Card>
      </div>
    </div>
  );
}
