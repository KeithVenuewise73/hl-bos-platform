"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { ENGAGEMENT_TABS, type Go, type Nav } from "@/lib/nav";
import {
  engagementById,
  businessById,
  scorecardFor,
  blueprintFor,
  assessmentProgress,
  suggestedNextStage,
  advanceEngagement,
  projectCompletion,
} from "@/lib/store";
import { STAGE_LABELS } from "@hl-bos/bti-engine";
import {
  Card,
  Badge,
  EmptyState,
  ScoreBar,
  scoreColor,
  scoreWord,
} from "@/components/ui";
import AssessmentWizard from "./AssessmentWizard";
import Scorecard from "./Scorecard";
import BlueprintViewer from "./BlueprintViewer";
import ProposalViewer from "./ProposalViewer";
import Implementation from "./Implementation";
import RoiDashboard from "./RoiDashboard";

export default function Engagement({ nav, go }: { nav: Nav; go: Go }) {
  const { ws, update } = useWorkspace();
  const [msg, setMsg] = useState<string | null>(null);
  const e = nav.engagementId ? engagementById(ws, nav.engagementId) : undefined;

  if (!e) {
    return (
      <div className="content">
        <EmptyState icon="🔍" title="Engagement not found">
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            onClick={() => go({ view: "clients" })}
          >
            Back to clients
          </button>
        </EmptyState>
      </div>
    );
  }
  const b = businessById(ws, e.businessId)!;
  const next = suggestedNextStage(e);

  function advance() {
    if (!next || !e) return;
    update((draft) => {
      const de = engagementById(draft, e.id)!;
      const res = advanceEngagement(de, next);
      setMsg(res.ok ? null : res.reason);
    });
  }

  return (
    <div className="content">
      <div className="row spread" style={{ marginBottom: 4 }}>
        <button className="btn sm" onClick={() => go({ view: "clients" })}>
          ← Clients
        </button>
        <div className="row">
          {b.analysisOnly ? (
            <Badge kind="info">Analysis only</Badge>
          ) : (
            <Badge kind="ok">Full transformation</Badge>
          )}
          {b.demo && <Badge kind="demo">Demonstration</Badge>}
        </div>
      </div>
      <div className="page-head">
        <h1>{b.name}</h1>
        <p>
          {b.industry} · pack: {b.pack} · engagement workspace
        </p>
      </div>

      {/* Stage bar */}
      <Card>
        <div className="row spread">
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              Current stage
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{STAGE_LABELS[e.stage]}</div>
          </div>
          <div className="row">
            {next ? (
              <button className="btn primary" onClick={advance}>
                Advance to {STAGE_LABELS[next]} →
              </button>
            ) : (
              <Badge kind={b.analysisOnly ? "info" : "ok"}>
                {b.analysisOnly
                  ? "Analysis-only: capped at blueprint"
                  : "Lifecycle complete"}
              </Badge>
            )}
          </div>
        </div>
        {msg && (
          <div className="banner" style={{ marginTop: 10 }}>
            ⚠ {msg}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="tabs" style={{ marginTop: 18 }}>
        {ENGAGEMENT_TABS.map((t) => {
          // hide proposal/implementation/roi for analysis-only engagements
          if (
            b.analysisOnly &&
            (t.key === "proposal" || t.key === "implementation" || t.key === "roi")
          )
            return null;
          return (
            <button
              key={t.key}
              className={`tab${nav.tab === t.key ? " active" : ""}`}
              onClick={() => go({ tab: t.key })}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {nav.tab === "overview" && <Overview engagementId={e.id} go={go} />}
      {nav.tab === "assessment" && <AssessmentWizard engagementId={e.id} />}
      {nav.tab === "scorecard" && <Scorecard engagementId={e.id} />}
      {nav.tab === "blueprint" && <BlueprintViewer engagementId={e.id} />}
      {nav.tab === "proposal" && <ProposalViewer engagementId={e.id} />}
      {nav.tab === "implementation" && <Implementation engagementId={e.id} />}
      {nav.tab === "roi" && <RoiDashboard engagementId={e.id} />}
    </div>
  );
}

function Overview({ engagementId, go }: { engagementId: string; go: Go }) {
  const { ws } = useWorkspace();
  const e = engagementById(ws, engagementId)!;
  const b = businessById(ws, e.businessId)!;
  const scores = scorecardFor(e.assessment);
  const prog = assessmentProgress(e.assessment);
  const bp = blueprintFor(e);
  const projects = e.projects;
  const roiRealized = e.roi
    .filter((m) => m.status === "realized")
    .reduce((n, m) => n + (m.realized ?? 0), 0);

  return (
    <div className="grid cols-2">
      <Card title="Business profile">
        <table className="tbl">
          <tbody>
            <tr>
              <td className="dim">Name</td>
              <td>{b.name}</td>
            </tr>
            <tr>
              <td className="dim">Industry</td>
              <td>{b.industry}</td>
            </tr>
            <tr>
              <td className="dim">Industry pack</td>
              <td>{b.pack}</td>
            </tr>
            <tr>
              <td className="dim">Mode</td>
              <td>{b.analysisOnly ? "Analysis only" : "Full transformation"}</td>
            </tr>
          </tbody>
        </table>
        {e.notes && (
          <div className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>
            {e.notes}
          </div>
        )}
      </Card>

      <Card
        title="Transformation score"
        action={
          <button className="btn sm" onClick={() => go({ tab: "scorecard" })}>
            Scorecard →
          </button>
        }
      >
        <div className="row" style={{ gap: 18 }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 750,
              color: scoreColor(scores.transformation),
            }}
          >
            {scores.transformation ?? "—"}
          </div>
          <div>
            <Badge
              kind={
                scores.transformation === null
                  ? undefined
                  : scores.transformation >= 70
                    ? "ok"
                    : scores.transformation >= 55
                      ? "warn"
                      : "danger"
              }
            >
              {scoreWord(scores.transformation)}
            </Badge>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
              Assessment:{" "}
              {e.assessment.completed
                ? "completed"
                : `${prog.rated}/${prog.total} rated`}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Assessment status"
        action={
          <button className="btn sm" onClick={() => go({ tab: "assessment" })}>
            Open wizard →
          </button>
        }
      >
        <div className="row spread" style={{ marginBottom: 6 }}>
          <span className="dim" style={{ fontSize: 13 }}>
            {prog.rated} of {prog.total} dimensions rated
          </span>
          <span style={{ fontWeight: 600 }}>
            {Math.round((prog.rated / prog.total) * 100)}%
          </span>
        </div>
        <ScoreBar score={Math.round((prog.rated / prog.total) * 100)} />
      </Card>

      <Card
        title="Blueprint"
        action={
          <button className="btn sm" onClick={() => go({ tab: "blueprint" })}>
            View →
          </button>
        }
      >
        <div className="dim" style={{ fontSize: 13.5 }}>
          {bp.complete
            ? "All sections populated."
            : `${bp.sections.filter((s) => s.hasData).length}/${bp.sections.length} sections populated.`}
        </div>
      </Card>

      {!b.analysisOnly && (
        <>
          <Card
            title="Implementation"
            action={
              <button className="btn sm" onClick={() => go({ tab: "implementation" })}>
                Open →
              </button>
            }
          >
            {projects.length === 0 ? (
              <div className="dim" style={{ fontSize: 13 }}>
                No projects yet.
              </div>
            ) : (
              projects.map((p) => (
                <div className="row spread" key={p.id} style={{ marginBottom: 6 }}>
                  <span>{p.name}</span>
                  <span className="dim">{projectCompletion(p)}%</span>
                </div>
              ))
            )}
          </Card>
          <Card
            title="ROI"
            action={
              <button className="btn sm" onClick={() => go({ tab: "roi" })}>
                Open →
              </button>
            }
          >
            <div className="dim" style={{ fontSize: 13 }}>
              {e.roi.length === 0
                ? "No ROI metrics yet."
                : `Realized: ${roiRealized.toLocaleString()}`}
            </div>
          </Card>
        </>
      )}

      <Card title="Timeline">
        <div className="list">
          {e.timeline.map((t, i) => (
            <div className="li" key={i}>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
