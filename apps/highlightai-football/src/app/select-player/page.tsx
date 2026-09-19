import { Shell, PageHead } from "@/components/Shell";
import { demoAnalysis } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { JERSEY_COLORS } from "@hl-bos/highlight-football";

export const dynamic = "force-dynamic";

const POSITIONS = [
  { group: "Offense", codes: ["QB", "RB", "FB", "WR", "TE", "OL"] },
  { group: "Defense", codes: ["DL", "LB", "CB", "S"] },
  { group: "Special teams", codes: ["K", "P", "LS", "RET"] },
];

export default function SelectPlayer() {
  const mode = currentMode();
  const analysis = demoAnalysis();
  const target = analysis.source.target;

  return (
    <Shell active="/select-player" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Which player should HighlightAI follow?"
        sub="Colour and number together. Neither alone is enough: both teams field eleven players in the same colour, and the number is unreadable in most frames."
      />

      <div className="split split-2">
        <div className="card">
          <h2 className="card-title">The athlete</h2>
          <div className="grid grid-2">
            <div className="field">
              <label className="label" htmlFor="pname">
                Player name
              </label>
              <input className="input" id="pname" defaultValue={target.name} />
            </div>
            <div className="field">
              <label className="label" htmlFor="pnumber">
                Jersey number
              </label>
              <input
                className="input"
                id="pnumber"
                type="number"
                min={0}
                max={99}
                defaultValue={target.number}
              />
              <div className="hint">
                00&ndash;99. If he wears &ldquo;00&rdquo; rather than &ldquo;0&rdquo;,
                tick the box below — they are different jerseys.
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="pteam">
                Team
              </label>
              <input className="input" id="pteam" defaultValue="West Seneca" />
            </div>
            <div className="field">
              <label className="label" htmlFor="pjersey">
                Jersey colour
              </label>
              <select
                className="select"
                id="pjersey"
                defaultValue={target.uniform.jersey}
              >
                {JERSEY_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {prettyColor(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pnumcolor">
                Number colour
              </label>
              <select
                className="select"
                id="pnumcolor"
                defaultValue={target.uniform.numberColor}
              >
                {JERSEY_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {prettyColor(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="phelmet">
                Helmet colour
              </label>
              <select
                className="select"
                id="phelmet"
                defaultValue={target.uniform.helmet ?? "navy"}
              >
                {JERSEY_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {prettyColor(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="label">Position</span>
            <div className="stack">
              {POSITIONS.map((g) => (
                <div key={g.group}>
                  <div className="small dim" style={{ marginBottom: 4 }}>
                    {g.group}
                  </div>
                  <div className="spread">
                    {g.codes.map((code) => (
                      <span
                        key={code}
                        className={
                          target.positions.includes(code as never)
                            ? "pill pill-ok"
                            : "pill"
                        }
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hint">
              Position is not decoration. A left tackle never touches the ball, and a
              reel built by looking for touchdowns would tell his family he did nothing
              all year. HighlightAI scores each play against what the position is{" "}
              <em>for</em>.
            </div>
          </div>

          <div className="btn-row">
            <a className="btn btn-primary btn-lg" href="/confirm-player">
              Find this player
            </a>
            <a className="btn btn-lg" href="/confirm-player">
              Pick him from a frame instead
            </a>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Teams detected from the footage</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              Measured by clustering sampled jersey pixels in LAB colour space, so a
              night game and an afternoon game produce the same answer. Correct it if it
              is wrong — your correction is used everywhere in the video.
            </p>
            <div className="stack" style={{ marginTop: 12 }}>
              <TeamRow label="Team A" jersey="Blue" numbers="White" pants="White" />
              <TeamRow label="Team B" jersey="White" numbers="Red" pants="Red" />
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Why we ask for all of it</h2>
            <div className="stack">
              <p className="reason">Jersey colour narrows 22 players to 11.</p>
              <p className="reason">
                The number separates him from his own teammates — when it is readable,
                which is rarely.
              </p>
              <p className="reason">
                Helmet and pants survive frames where the jersey is hidden by a blocker.
              </p>
              <p className="reason">
                Position tells us what a good play looks like for him.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function prettyColor(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function TeamRow({
  label,
  jersey,
  numbers,
  pants,
}: {
  label: string;
  jersey: string;
  numbers: string;
  pants: string;
}) {
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{label}</div>
        <div className="row-sub">
          {jersey} jersey · {numbers} numbers · {pants} pants
        </div>
      </div>
      <button className="btn" type="button">
        Correct
      </button>
    </div>
  );
}
