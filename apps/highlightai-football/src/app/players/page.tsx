import { Shell, PageHead, Empty } from "@/components/Shell";
import { demoAnalysis } from "@/lib/analysis";
import { currentMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Players() {
  const mode = currentMode();

  if (mode.mode === "live") {
    return (
      <Shell active="/players" isDemo={false}>
        <PageHead title="Players" sub={mode.reason} />
        <Empty title="No athletes yet">
          Athletes are created when you pick a player to follow on an uploaded game.
        </Empty>
      </Shell>
    );
  }

  const analysis = demoAnalysis();
  const target = analysis.source.target;

  return (
    <Shell active="/players" isDemo>
      <PageHead
        title="Players"
        sub="Athlete profiles accumulate games, clips and reels across a season."
      />
      <div className="grid grid-3">
        <a className="card" href={`/players/${target.playerId}`}>
          <div className="between">
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{target.name}</div>
              <div className="small muted">
                #{target.number} · {target.positions.join(" / ")}
              </div>
            </div>
            <span className="pill pill-ok">
              {analysis.result.summary.selectedHighlights} clips
            </span>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="row-main">
              <div className="row-sub">
                1 game · {analysis.result.summary.playsAnalyzed} plays analysed ·{" "}
                {analysis.result.summary.playerAppearances} appearances
              </div>
            </div>
          </div>
        </a>
      </div>
    </Shell>
  );
}
