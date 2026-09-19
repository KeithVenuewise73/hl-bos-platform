import { Shell, PageHead } from "@/components/Shell";
import { demoAnalysis } from "@/lib/analysis";
import { currentMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Settings() {
  const mode = currentMode();
  const analysis = demoAnalysis();

  return (
    <Shell active="/settings" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Settings"
        sub="Clip defaults, privacy, and what this installation is actually connected to."
      />

      <div className="split split-2">
        <div>
          <div className="card">
            <h2 className="card-title">Clip defaults</h2>
            <div className="grid grid-2">
              <div className="field">
                <label className="label" htmlFor="s-pre">
                  Seconds before the snap
                </label>
                <input
                  className="input"
                  id="s-pre"
                  type="number"
                  defaultValue={5}
                  min={0}
                  max={30}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="s-post">
                  Seconds after the play ends
                </label>
                <input
                  className="input"
                  id="s-post"
                  type="number"
                  defaultValue={8}
                  min={0}
                  max={30}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="s-style">
                  Spotlight style
                </label>
                <select className="select" id="s-style" defaultValue="Circle">
                  {[
                    "Circle",
                    "Arrow",
                    "Spotlight",
                    "Glow",
                    "Freeze frame",
                    "Zoom",
                    "None",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="s-select">
                  Default clip selection
                </label>
                <select className="select" id="s-select" defaultValue="Involved Plays">
                  {[
                    "All Plays",
                    "Involved Plays",
                    "Best Plays",
                    "Elite Highlights",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Privacy</h2>
            <div className="stack">
              <Toggle
                label="Game film is private"
                note="Enforced by the database. This cannot be turned off."
                locked
              />
              <Toggle
                label="Use my footage to improve the models"
                note="Off. Nothing trains on this footage unless it is explicitly turned on per video."
              />
              <Toggle
                label="Allow public sharing"
                note="Off. Turning it on still requires a per-video consent record naming a guardian."
              />
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">This installation</h2>
            <table>
              <tbody>
                <tr>
                  <td className="muted small">Mode</td>
                  <td>
                    <span
                      className={
                        mode.mode === "demo" ? "pill pill-demo" : "pill pill-ok"
                      }
                    >
                      {mode.mode === "demo" ? "DEMO" : "LIVE"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="muted small">Database</td>
                  <td>{mode.supabaseConfigured ? "Configured" : "Not configured"}</td>
                </tr>
                <tr>
                  <td className="muted small">GPU worker</td>
                  <td>
                    <span className="dim">Not connected</span>
                  </td>
                </tr>
                <tr>
                  <td className="muted small">Object storage</td>
                  <td>
                    <span className="dim">Not connected</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint">{mode.reason}</p>
          </div>

          <div className="card">
            <h2 className="card-title">Models in use</h2>
            <ul className="list small muted">
              {analysis.adapterNames.map((name) => (
                <li className="reason" key={name}>
                  {name}{" "}
                  <span className="pill pill-demo" style={{ marginLeft: 6 }}>
                    demo
                  </span>
                </li>
              ))}
            </ul>
            <p className="hint">
              Every adapter here is a demo adapter, so every result is labelled demo. A
              real detector with a demo event classifier would still be labelled demo —
              partly synthetic football is synthetic football.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Toggle({
  label,
  note,
  locked,
}: {
  label: string;
  note: string;
  locked?: boolean;
}) {
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{label}</div>
        <div className="row-sub">{note}</div>
      </div>
      {locked === true ? (
        <span className="pill pill-ok">Always on</span>
      ) : (
        <span className="pill">Off</span>
      )}
    </div>
  );
}
