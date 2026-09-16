import { Shell, PageHead, Stat, Empty } from "@/components/Shell";
import { demoAnalysis, playRows, seasonSummary } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { clock, decimal, eventLabel, involvementLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlayerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mode = currentMode();
  const analysis = demoAnalysis();
  const target = analysis.source.target;

  if (mode.mode === "demo" && id !== target.playerId) {
    return (
      <Shell active="/players" isDemo>
        <PageHead title="Player not found" />
        <Empty title="No such athlete">
          The demo game has exactly one athlete profile.
        </Empty>
      </Shell>
    );
  }

  const season = seasonSummary(analysis);
  const rows = playRows(analysis).filter((r) => r.involvement >= 2);

  return (
    <Shell active="/players" isDemo={mode.mode === "demo"}>
      <PageHead
        title={`#${target.number} ${target.name}`}
        sub={`${target.positions.join(" / ")} · West Seneca · Class of 2028`}
      />

      <div className="grid grid-4">
        <Stat label="Games" value={String(season.games)} />
        <Stat label="Plays analysed" value={String(season.playsAnalyzed)} />
        <Stat label="Appearances" value={String(season.playerAppearances)} />
        <Stat label="Top highlights" value={String(season.topHighlights)} />
      </div>

      <div className="split split-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className="card-title">Season highlights</h2>
          {rows.length === 0 ? (
            <Empty title="Nothing above &ldquo;on the field&rdquo; yet">
              Every play he appeared in scored 1. That is what the film showed.
            </Empty>
          ) : (
            <ul className="list">
              {rows.map((row) => (
                <li className="row" key={row.playId}>
                  <span className="score">{decimal(row.score)}</span>
                  <div className="row-main">
                    <div className="row-title">
                      Play {row.index + 1} · {involvementLabel(row.involvement)}
                    </div>
                    <div className="row-sub">
                      {row.snapSeconds !== null ? clock(row.snapSeconds) : "no snap"} ·{" "}
                      {row.events.map(eventLabel).join(", ") || "no event detected"}
                    </div>
                  </div>
                  <a className="btn" href={`/analysis?play=${row.playId}`}>
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Profile</h2>
            <table>
              <tbody>
                <Field label="Name" value={target.name} />
                <Field label="Number" value={`#${target.number}`} />
                <Field label="Positions" value={target.positions.join(" / ")} />
                <Field label="Team" value="West Seneca" />
                <Field label="Jersey" value="Blue, white numbers" />
                <Field label="Height" value={null} />
                <Field label="Weight" value={null} />
              </tbody>
            </table>
            <p className="hint">
              Height and weight are blank because nobody has entered them. They are not
              estimated from the footage.
            </p>
          </div>

          <div className="card">
            <h2 className="card-title">Recruiting profile</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              A finished reel can attach to an AthleteHuddle profile. The integration is
              designed for — clean APIs and event hooks — but not built, so there is
              nothing here to click yet.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <tr>
      <td className="muted small" style={{ width: 110 }}>
        {label}
      </td>
      <td>{value ?? <span className="dim">Not recorded</span>}</td>
    </tr>
  );
}
