import { Shell, PageHead, Stat } from "@/components/Shell";
import { demoAnalysis, qualityMetrics } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { decimal, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Admin AI Debug View.
 *
 * This is the screen that makes the system improvable. It shows what the models
 * decided AND what they rejected, because the rejected runner-up is what
 * explains a misidentification. A debug view that only showed the winner would
 * be decoration.
 */
export default function DebugView() {
  const mode = currentMode();
  const analysis = demoAnalysis();
  const metrics = qualityMetrics(analysis);
  const decisions = [...analysis.result.decisions].sort(
    (a, b) => b.confidence - a.confidence,
  );

  return (
    <Shell active="/debug" isDemo={mode.mode === "demo"}>
      <PageHead
        title="AI Debug View"
        sub="Internal. Tracking IDs, team classification, jersey voting, confidence, and the identity decision for every track — including the rejections."
      />

      <div className="grid grid-4">
        <Stat label="Tracks" value={String(analysis.source.tracks.length)} />
        <Stat
          label="Claimed as the athlete"
          value={String(decisions.filter((d) => d.isAthlete).length)}
        />
        <Stat label="Plays" value={String(analysis.result.plays.length)} />
        <Stat label="Events" value={String(analysis.source.events.length)} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Segmentation thresholds</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Derived from this video&rsquo;s own motion distribution, not fixed constants —
          an end-zone camera at 60 yards produces a tenth of the pixel motion of a phone
          on the sideline.
        </p>
        <div className="grid grid-3" style={{ marginTop: 10 }}>
          <Stat
            label="Baseline (dead time)"
            value={analysis.result.thresholds.baseline.toFixed(4)}
          />
          <Stat
            label="Enter (play starts)"
            value={analysis.result.thresholds.enter.toFixed(4)}
          />
          <Stat
            label="Exit (play ends)"
            value={analysis.result.thresholds.exit.toFixed(4)}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Identity decisions</h2>
        <table>
          <thead>
            <tr>
              <th>Track</th>
              <th>Team</th>
              <th>Jersey vote</th>
              <th>Frames read</th>
              <th>Source</th>
              <th>Verdict</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.trackId}>
                <td className="mono">{d.trackId}</td>
                <td className="mono dim">
                  {analysis.source.tracks.find((t) => t.trackId === d.trackId)
                    ?.teamId ?? "—"}
                </td>
                <td className="mono">
                  {d.jerseyVote.distribution.length === 0 ? (
                    <span className="dim">no readings</span>
                  ) : (
                    d.jerseyVote.distribution.slice(0, 3).map((x) => (
                      <div key={String(x.number)}>
                        {x.number === "unknown" ? "unknown" : `#${x.number}`} (
                        {decimal(x.confidence, 2)})
                      </div>
                    ))
                  )}
                </td>
                <td className="mono dim">
                  {d.jerseyVote.supportingFrames}/
                  {d.jerseyVote.supportingFrames + d.jerseyVote.abstainingFrames}
                </td>
                <td className="small">{d.source.replace(/_/g, " ")}</td>
                <td>
                  {d.isAthlete ? (
                    <span className="pill pill-ok">{percent(d.confidence)}</span>
                  ) : (
                    <span className="pill">rejected</span>
                  )}
                </td>
                <td className="small muted" style={{ maxWidth: 340 }}>
                  {d.reasons.join(" ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="card-title">Quality metrics</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Computable here only because the demo game is labelled. On customer footage
          these stay &ldquo;Not measured&rdquo; until a human corrects something — a
          metric computed against the model&rsquo;s own output measures nothing.
        </p>
        <table style={{ marginTop: 10 }}>
          <tbody>
            <Metric
              label="Selected player precision"
              value={percent(metrics.selectedPlayerPrecision)}
            />
            <Metric
              label="Selected player recall"
              value={percent(metrics.selectedPlayerRecall)}
            />
            <Metric
              label="Frame-level false claims"
              value={String(metrics.identitySwitches)}
            />
            <Metric
              label="Jersey OCR accuracy"
              value={percent(metrics.jerseyOcrAccuracy)}
            />
            <Metric
              label="Number readable share"
              value={percent(metrics.jerseyReadableShare)}
            />
            <Metric
              label="Plays found"
              value={`${metrics.playsFound} of ${metrics.playsFound + metrics.playsMissed}`}
            />
            <Metric label="Plays invented" value={String(metrics.playsInvented)} />
            <Metric
              label="Mean snap error"
              value={
                metrics.meanSnapErrorSeconds === null
                  ? "Not measured"
                  : `${decimal(metrics.meanSnapErrorSeconds, 3)}s`
              }
            />
            <Metric
              label="Highlight acceptance rate"
              value={percent(metrics.highlightAcceptanceRate, "No clips reviewed yet")}
            />
            <Metric
              label="Manual correction rate"
              value={percent(metrics.manualCorrectionRate, "No corrections yet")}
            />
            <Metric
              label="Meaningful play recall"
              value={percent(
                metrics.meaningfulPlayRecall,
                "Needs a human to label the plays",
              )}
            />
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="muted">{label}</td>
      <td style={{ fontWeight: 600 }}>{value}</td>
    </tr>
  );
}
