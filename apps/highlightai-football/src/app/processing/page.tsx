import { Shell, PageHead, Meter, Stat } from "@/components/Shell";
import { demoAnalysis } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { percent } from "@/lib/format";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  advance,
  initialStages,
  pipelineProgress,
} from "@hl-bos/highlight-football";

export const dynamic = "force-dynamic";

/**
 * Game Processing.
 *
 * The progress here is computed by the engine's own pipelineProgress(), from
 * stage weights that reflect real wall-clock cost. There is no timer, no
 * animation that creeps toward 90%, and a stage that cannot estimate its
 * remaining work renders as stripes instead of a number nobody computed.
 */
export default function Processing() {
  const mode = currentMode();
  const analysis = demoAnalysis();

  // The demo game is already analysed, so every stage is genuinely finished
  // except the last: there is no rendered file, so export has not run.
  let stages = initialStages();
  for (const stage of PIPELINE_STAGES) {
    if (stage === "final_export") continue;
    stages = advance(stages, stage, { status: "succeeded", progress: 1 });
  }
  stages = advance(stages, "final_export", { status: "pending", progress: null });
  const progress = pipelineProgress(stages);

  return (
    <Shell active="/processing" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Game Processing"
        sub={`${analysis.source.game.name} — analysing for #${analysis.source.target.number} ${analysis.source.target.name}.`}
      />

      <div className="card">
        <div className="between" style={{ marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{progress.label}</div>
            <div className="small muted">
              {progress.completedStages} of {progress.totalStages} stages complete
            </div>
          </div>
          <div className="score">{percent(progress.fraction)}</div>
        </div>
        <Meter value={progress.fraction} indeterminate={progress.indeterminate} />
        {progress.indeterminate ? (
          <p className="hint">
            This stage cannot estimate how much work is left, so the bar is striped
            rather than showing a number nobody computed.
          </p>
        ) : null}
      </div>

      <div className="grid grid-4" style={{ marginTop: 14 }}>
        <Stat
          label="Plays found"
          value={String(analysis.result.summary.playsAnalyzed)}
        />
        <Stat
          label="Player appearances"
          value={String(analysis.result.summary.playerAppearances)}
        />
        <Stat label="Tracks" value={String(analysis.source.tracks.length)} />
        <Stat
          label="Candidates"
          value={String(analysis.result.summary.candidateHighlights)}
        />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 className="card-title">Pipeline</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th>Stage</th>
              <th style={{ width: 130 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.stage}>
                <td>
                  {s.status === "succeeded" ? (
                    <span style={{ color: "var(--brand)" }}>✓</span>
                  ) : s.status === "failed" ? (
                    <span style={{ color: "var(--danger)" }}>✕</span>
                  ) : (
                    <span className="dim">·</span>
                  )}
                </td>
                <td>{STAGE_LABELS[s.stage]}</td>
                <td>
                  {s.status === "succeeded" ? (
                    <span className="pill pill-ok">Done</span>
                  ) : s.status === "running" ? (
                    <span className="pill pill-info">Running</span>
                  ) : s.status === "failed" ? (
                    <span className="pill pill-danger">Failed</span>
                  ) : (
                    <span className="pill">Waiting</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          The export stage has not run: nothing has been rendered yet. It moves when you
          build a reel and press Export.
        </p>
      </div>
    </Shell>
  );
}
