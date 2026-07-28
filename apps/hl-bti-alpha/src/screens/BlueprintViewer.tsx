"use client";

import { useWorkspace } from "@/lib/workspace";
import { engagementById, businessById, blueprintFor, scorecardFor } from "@/lib/store";
import { Card, Badge, EmptyState, ScoreBar, scoreColor } from "@/components/ui";

// EXECUTIVE BLUEPRINT VIEWER — a presentation-ready view of the deterministic
// blueprint (17 sections). Sections with no data are shown as "not yet
// available" with the engine's reason — never fabricated prose. "Print /
// export" uses the browser's print-to-PDF (no invented export pipeline).
export default function BlueprintViewer({ engagementId }: { engagementId: string }) {
  const { ws } = useWorkspace();
  const e = engagementById(ws, engagementId)!;
  const b = businessById(ws, e.businessId)!;
  const bp = blueprintFor(e);
  const s = scorecardFor(e.assessment);

  if (s.transformation === null) {
    return (
      <EmptyState icon="📘" title="Blueprint not ready">
        Complete some of the assessment to generate the Executive Blueprint.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <div className="row">
          <Badge kind={bp.complete ? "ok" : "warn"}>
            {bp.sections.filter((x) => x.hasData).length}/{bp.sections.length} sections
            populated
          </Badge>
          {b.demo && <Badge kind="demo">Demonstration</Badge>}
        </div>
        <button
          className="btn"
          onClick={() => typeof window !== "undefined" && window.print()}
        >
          🖨 Print / Export PDF
        </button>
      </div>

      <Card>
        <div
          className="dim"
          style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}
        >
          Business Transformation Blueprint
        </div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>{b.name}</h1>
        <div className="row" style={{ gap: 24, marginTop: 14 }}>
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              Transformation Score
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 750,
                color: scoreColor(s.transformation),
              }}
            >
              {s.transformation}
            </div>
          </div>
          <div style={{ flex: 1, maxWidth: 360 }}>
            <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>
              Domain scores
            </div>
            {Object.entries(s.domainScores).map(([k, v]) => (
              <div key={k} className="row spread" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, textTransform: "capitalize" }}>
                  {k.replace(/_/g, " ")}
                </span>
                <div style={{ width: 140 }}>
                  <ScoreBar score={v} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 8 }}>
        {bp.sections.map((sec) => (
          <Card key={sec.key} title={sec.title}>
            {sec.hasData ? (
              <BlueprintSectionBody sectionKey={sec.key} content={sec.content} />
            ) : (
              <div className="dim" style={{ fontSize: 13 }}>
                Not yet available — {sec.note}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function BlueprintSectionBody({
  sectionKey,
  content,
}: {
  sectionKey: string;
  content: Record<string, unknown>;
}) {
  // Render a few known shapes nicely; fall back to a readable list otherwise.
  if (sectionKey === "executive_summary") {
    return (
      <div className="dim" style={{ fontSize: 13.5 }}>
        Transformation Score of{" "}
        <strong style={{ color: "var(--text)" }}>
          {String(content["transformationScore"])}
        </strong>{" "}
        across {String(content["domainsScored"])} assessed domain(s).
      </div>
    );
  }
  const items =
    (content["items"] as
      | { title: string; priority?: string; recommendedService?: string }[]
      | undefined) ?? undefined;
  if (items && items.length) {
    return (
      <div className="list">
        {items.map((it, i) => (
          <div className="li" key={i}>
            <span>{it.title}</span>
            {it.priority && (
              <Badge
                kind={
                  it.priority === "critical"
                    ? "danger"
                    : it.priority === "high"
                      ? "warn"
                      : undefined
                }
              >
                {it.priority}
              </Badge>
            )}
          </div>
        ))}
      </div>
    );
  }
  const services = content["services"] as string[] | undefined;
  if (services && services.length) {
    return (
      <div className="row" style={{ gap: 8 }}>
        {services.map((sv) => (
          <Badge key={sv} kind="ok">
            {sv}
          </Badge>
        ))}
      </div>
    );
  }
  const strengths = (content["strengths"] ?? content["weaknesses"]) as
    { label: string; score: number }[] | undefined;
  if (strengths && strengths.length) {
    return (
      <div className="row" style={{ gap: 8 }}>
        {strengths.map((x) => (
          <Badge key={x.label}>
            {x.label}: {x.score}
          </Badge>
        ))}
      </div>
    );
  }
  const domainScores = content["domainScores"] as
    { label: string; score: number }[] | undefined;
  if (domainScores) {
    return (
      <div className="grid cols-3">
        {domainScores.map((d) => (
          <div key={d.label}>
            <div className="dim" style={{ fontSize: 12 }}>
              {d.label}
            </div>
            <div style={{ fontWeight: 700, color: scoreColor(d.score) }}>{d.score}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="dim" style={{ fontSize: 13 }}>
      Populated.
    </div>
  );
}
