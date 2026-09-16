import { Shell, PageHead, Meter, Empty } from "@/components/Shell";
import { Stage } from "@/components/Stage";
import { athleteTrackForPlay, demoAnalysis, overlayFrames } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { confidenceTone, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Player Confirmation.
 *
 * This screen exists because the model will sometimes be wrong, and the cheapest
 * possible fix is a person looking at one frame and saying yes. That single
 * confirmation becomes a PLAYER LOCK, which anchors re-identification for the
 * rest of the video — so one click here measurably improves every later play.
 */
export default function ConfirmPlayer() {
  const mode = currentMode();
  const analysis = demoAnalysis();
  const target = analysis.source.target;

  const decisions = [...analysis.result.decisions].sort(
    (a, b) => b.confidence - a.confidence,
  );
  const claimed = decisions.filter((d) => d.isAthlete);
  const best = claimed[0] ?? decisions[0];

  const firstPlay = analysis.result.plays.find(
    (p) =>
      analysis.result.involvements.find((i) => i.playId === p.playId)?.playerPresent ===
      true,
  );
  const frames =
    firstPlay === undefined ? [] : overlayFrames(analysis, firstPlay.playId, 40);
  const frame = frames[Math.floor(frames.length / 3)] ?? null;
  const track =
    firstPlay === undefined ? null : athleteTrackForPlay(analysis, firstPlay.playId);

  return (
    <Shell active="/confirm-player" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Is this your player?"
        sub={`HighlightAI believes this is #${target.number} ${target.name}. Confirming once anchors the rest of the video to him.`}
      />

      <div className="split split-2">
        <div>
          <Stage
            player={frame?.player ?? null}
            ball={frame?.ball ?? null}
            markerLabel={`#${target.number}`}
            caption={
              firstPlay !== undefined && frame !== null
                ? `Play ${firstPlay.index + 1} · frame ${frame.at.frame}`
                : undefined
            }
          />
          <p className="hint">
            Geometry drawn here is the tracker&rsquo;s genuine output — these are the
            boxes the engine produced, not an illustration.
          </p>

          <div className="card" style={{ marginTop: 14 }}>
            <h2 className="card-title">Confirm or correct</h2>
            <div className="btn-row">
              <button className="btn btn-primary btn-lg" type="button">
                Yes — this is #{target.number}
              </button>
              <button className="btn btn-lg btn-danger" type="button">
                Not my player
              </button>
              <button className="btn btn-lg" type="button">
                Pick the right one
              </button>
            </div>
            <p className="hint">
              Both answers are recorded permanently and outrank every model output in
              their frame range. Corrections cannot be edited or deleted afterwards —
              they are the evidence future improvements are built on.
            </p>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Confidence</h2>
            {best === undefined ? (
              <Empty title="No track could be assessed">
                Nothing was detected in this video, so there is nothing to confirm.
              </Empty>
            ) : (
              <>
                <div className="between">
                  <span style={{ fontWeight: 600 }}>
                    #{target.number} {target.name}
                  </span>
                  <span className="score">{percent(best.confidence)}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Meter
                    value={best.confidence}
                    tone={confidenceTone(best.confidence)}
                  />
                </div>
                <div className="stack" style={{ marginTop: 12 }}>
                  {best.reasons.map((r) => (
                    <p className="reason" key={r}>
                      {r}
                    </p>
                  ))}
                </div>
                {best.reviewRequired ? (
                  <p className="pill pill-warn" style={{ marginTop: 12 }}>
                    REVIEW REQUIRED
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="card">
            <h2 className="card-title">Tracks considered</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              Including the ones rejected — the rejection is what explains a
              misidentification.
            </p>
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Number</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {decisions.slice(0, 12).map((d) => (
                  <tr key={d.trackId}>
                    <td className="mono">{d.trackId}</td>
                    <td className="mono">
                      {d.jerseyVote.number === null ? (
                        <span className="dim">unreadable</span>
                      ) : (
                        `#${d.jerseyVote.number}`
                      )}
                    </td>
                    <td>
                      {d.isAthlete ? (
                        <span className="pill pill-ok">{percent(d.confidence)}</span>
                      ) : (
                        <span className="pill">rejected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {track !== null ? (
              <p className="hint">
                Currently following <span className="mono">{track.trackId}</span>, which
                covers frames {track.startedAt.frame}&ndash;{track.endedAt.frame}.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}
