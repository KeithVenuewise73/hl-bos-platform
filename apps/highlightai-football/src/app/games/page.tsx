import { Shell, PageHead, Empty } from "@/components/Shell";
import { demoAnalysis } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { clock } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function Games() {
  const mode = currentMode();

  if (mode.mode === "live") {
    return (
      <Shell active="/games" isDemo={false}>
        <PageHead title="Games" sub={mode.reason} />
        <Empty title="No games yet">
          Upload a game and it appears here with its analysis status.
        </Empty>
      </Shell>
    );
  }

  const analysis = demoAnalysis();
  const game = analysis.source.game;

  return (
    <Shell active="/games" isDemo>
      <PageHead title="Games" sub="One demo game. Nothing here has been filmed." />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Date</th>
              <th>Level</th>
              <th>Camera</th>
              <th>Length</th>
              <th>Plays</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>{game.name}</td>
              <td className="mono">{game.playedOn}</td>
              <td>{game.level.replace(/_/g, " ")}</td>
              <td>{game.cameraType.replace(/_/g, " ")}</td>
              <td className="mono">{clock(game.durationSeconds)}</td>
              <td>{analysis.result.summary.playsAnalyzed}</td>
              <td>
                <span className="pill pill-demo">Demo</span>
              </td>
              <td>
                <a className="btn" href="/analysis">
                  Open
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
