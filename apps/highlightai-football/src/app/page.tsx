import { Shell, PageHead, Stat, Empty, Meter } from "@/components/Shell";
import { demoAnalysis, playRows, qualityMetrics } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import {
  clock,
  confidenceTone,
  decimal,
  involvementLabel,
  percent,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const mode = currentMode();

  if (mode.mode === "live") {
    // Live mode with nothing uploaded yet. It says so rather than borrowing
    // the demo's numbers, which would put invented football on the CEO's
    // home screen.
    return (
      <Shell active="/" isDemo={false}>
        <PageHead title="Dashboard" sub={mode.reason} />
        <Empty title="No games have been uploaded yet">
          Upload a game file and HighlightAI will find the plays your athlete was in.
          Nothing is shown here until there is real film to show.
        </Empty>
      </Shell>
    );
  }

  const analysis = demoAnalysis();
  const summary = analysis.result.summary;
  const rows = playRows(analysis);
  const metrics = qualityMetrics(analysis);
  const involved = rows.filter((r) => r.involvement >= 2);
  const best = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 4);

  return (
    <Shell active="/" isDemo>
      <PageHead
        title="Dashboard"
        sub={`${analysis.source.game.name} — ${analysis.source.game.playedOn}. Following #${analysis.source.target.number} ${analysis.source.target.name}.`}
      />

      <div className="grid grid-4">
        <Stat label="Plays analysed" value={String(summary.playsAnalyzed)} />
        <Stat
          label="Player appearances"
          value={String(summary.playerAppearances)}
          note={`Off the field for ${summary.playsAnalyzed - summary.playerAppearances} plays`}
        />
        <Stat
          label="Candidate highlights"
          value={String(summary.candidateHighlights)}
        />
        <Stat
          label="Selected highlights"
          value={String(summary.selectedHighlights)}
          note="Involved plays and above"
        />
      </div>

      <div className="split split-2" style={{ marginTop: 16 }}>
        <div>
          <div className="card">
            <h2 className="card-title">Best plays found</h2>
            {best.length === 0 ? (
              <Empty title="Nothing scored above zero">
                The athlete was not detected in any play. Confirm the player on the
                Player Confirmation screen and HighlightAI will re-run from that anchor.
              </Empty>
            ) : (
              <ul className="list">
                {best.map((row) => (
                  <li className="row" key={row.playId}>
                    <div className="score">{decimal(row.score)}</div>
                    <div className="row-main">
                      <div className="row-title">
                        Play {row.index + 1} · {involvementLabel(row.involvement)}
                      </div>
                      <div className="row-sub">
                        {row.snapSeconds !== null
                          ? `Snap ${clock(row.snapSeconds)}`
                          : "No snap located"}
                        {row.events.length > 0 ? ` · ${row.events.join(", ")}` : ""}
                      </div>
                    </div>
                    <a className="btn" href={`/analysis?play=${row.playId}`}>
                      Review
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="card-title">Involvement across the game</h2>
            <table>
              <thead>
                <tr>
                  <th>Play</th>
                  <th>Snap</th>
                  <th>Involvement</th>
                  <th>Visible</th>
                  <th>Identity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.playId}>
                    <td>{row.index + 1}</td>
                    <td className="mono">
                      {row.snapSeconds !== null ? clock(row.snapSeconds) : "—"}
                    </td>
                    <td>
                      {row.playerPresent ? (
                        involvementLabel(row.involvement)
                      ) : (
                        <span className="dim">Not on the field</span>
                      )}
                    </td>
                    <td>{row.playerPresent ? percent(row.visibility) : "—"}</td>
                    <td>
                      {row.playerPresent ? (
                        <div style={{ minWidth: 90 }}>
                          <Meter
                            value={row.identityConfidence}
                            tone={confidenceTone(row.identityConfidence)}
                          />
                          <div className="small dim" style={{ marginTop: 3 }}>
                            {percent(row.identityConfidence)}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Did we find his plays?</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              Measured against this demo game&rsquo;s labels. On real footage there is
              no answer key, so these read &ldquo;Not measured&rdquo; until a human
              corrects something.
            </p>
            <div className="stack" style={{ marginTop: 12 }}>
              <MetricRow
                label="Player precision"
                value={percent(metrics.selectedPlayerPrecision)}
              />
              <MetricRow
                label="Player recall"
                value={percent(metrics.selectedPlayerRecall)}
              />
              <MetricRow
                label="Plays found"
                value={`${metrics.playsFound} of ${metrics.playsFound + metrics.playsMissed}`}
              />
              <MetricRow label="Plays invented" value={String(metrics.playsInvented)} />
              <MetricRow
                label="Snap accuracy"
                value={
                  metrics.meanSnapErrorSeconds === null
                    ? "Not measured"
                    : `±${decimal(metrics.meanSnapErrorSeconds, 2)}s`
                }
              />
              <MetricRow
                label="Jersey OCR accuracy"
                value={percent(metrics.jerseyOcrAccuracy)}
              />
              <MetricRow
                label="Number readable"
                value={percent(metrics.jerseyReadableShare)}
              />
              <MetricRow
                label="Highlight acceptance"
                value={percent(
                  metrics.highlightAcceptanceRate,
                  "No clips reviewed yet",
                )}
              />
              <MetricRow
                label="Meaningful play recall"
                value={percent(metrics.meaningfulPlayRecall, "Needs a human to label")}
              />
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">What to do next</h2>
            <div className="stack">
              <a className="btn btn-primary" href="/editor" style={{ width: "100%" }}>
                Build the highlight reel
              </a>
              <a className="btn" href="/plays" style={{ width: "100%" }}>
                Review {involved.length} involved plays
              </a>
              <a className="btn" href="/upload" style={{ width: "100%" }}>
                Upload another game
              </a>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="between">
      <span className="small muted">{label}</span>
      <span className="small" style={{ fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}
