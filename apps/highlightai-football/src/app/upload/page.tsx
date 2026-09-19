import { Shell, PageHead } from "@/components/Shell";
import { currentMode } from "@/lib/env";

export const dynamic = "force-dynamic";

const LEVELS = [
  "Youth",
  "Middle school",
  "High school (JV)",
  "High school (Varsity)",
  "College",
  "Professional",
];
const CAMERAS = [
  "Hudl export",
  "Veo",
  "Sideline camera",
  "End-zone camera",
  "Press box",
  "Smartphone",
  "Broadcast",
  "Not sure",
];

export default function UploadGame() {
  const mode = currentMode();
  return (
    <Shell active="/upload" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Upload Game"
        sub="MP4, MOV or MKV. Hudl exports, Veo, press-box, end-zone and phone footage all work — tell us which camera and HighlightAI adjusts what it expects to see."
      />

      <div className="split split-2">
        <div className="card">
          <h2 className="card-title">The game</h2>
          <div className="grid grid-2">
            <div className="field">
              <label className="label" htmlFor="name">
                Game name
              </label>
              <input
                className="input"
                id="name"
                name="name"
                placeholder="West Seneca vs Orchard Park"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="date">
                Date played
              </label>
              <input
                className="input"
                id="date"
                name="date"
                type="date"
                defaultValue="2026-09-11"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="team">
                Your team
              </label>
              <input
                className="input"
                id="team"
                name="team"
                placeholder="West Seneca"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="opponent">
                Opponent
              </label>
              <input
                className="input"
                id="opponent"
                name="opponent"
                placeholder="Orchard Park"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="level">
                Level
              </label>
              <select
                className="select"
                id="level"
                name="level"
                defaultValue="High school (Varsity)"
              >
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="camera">
                Camera
              </label>
              <select
                className="select"
                id="camera"
                name="camera"
                defaultValue="Press box"
              >
                {CAMERAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="hint">
                A press-box camera sees the whole field at a distance; a phone on the
                sideline sees three players close up. HighlightAI expects different
                things from each.
              </div>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="roster">
              Roster (optional)
            </label>
            <textarea
              className="textarea"
              id="roster"
              name="roster"
              rows={4}
              placeholder={"23  Dominic Herman  S/WR\n7   Marcus Bell      QB"}
            />
            <div className="hint">
              One player per line. A roster lets HighlightAI check a number it reads
              against a number that exists, which cuts misidentifications sharply.
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="file">
              Game film
            </label>
            <input
              className="input"
              id="file"
              name="file"
              type="file"
              accept="video/mp4,video/quicktime,video/x-matroska"
            />
            <div className="hint">
              The file goes straight to private storage and is never public. Analysis
              runs on a GPU worker, not in this web app.
            </div>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-primary btn-lg"
              type="button"
              disabled={mode.mode === "demo"}
            >
              Upload and analyse
            </button>
            <a className="btn btn-lg" href="/processing">
              See what processing looks like
            </a>
          </div>
          {mode.mode === "demo" ? (
            <p className="hint" style={{ marginTop: 10 }}>
              Upload is disabled in demo mode because there is no database or storage to
              upload to. A button that cannot do its job is worse than one that says why
              it is off.
            </p>
          ) : null}
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Privacy</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              This footage very likely contains minors, so the defaults are not
              negotiable and are enforced by the database, not by this form:
            </p>
            <ul className="list stack small muted" style={{ marginTop: 10 }}>
              <li className="reason">
                Every upload is private. There is no public default.
              </li>
              <li className="reason">
                Making a video, clip or reel shareable requires a consent record naming
                the adult who granted it. For a minor the database refuses a consent
                with no guardian named.
              </li>
              <li className="reason">
                Consent to a private link is not consent to publish. They are separate
                scopes and separate records.
              </li>
              <li className="reason">
                Nothing trains a model unless{" "}
                <span className="mono">training_opt_in</span> is explicitly true on that
                video. It is false by default and is never set implicitly.
              </li>
            </ul>
          </div>

          <div className="card">
            <h2 className="card-title">What happens next</h2>
            <ol className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>The file is transcoded to a working copy.</li>
              <li>HighlightAI finds the plays by motion — no scoreboard needed.</li>
              <li>It detects players and works out the two teams&rsquo; colours.</li>
              <li>You name your athlete; it tracks him through every play.</li>
              <li>It cuts the clips and you keep the ones you want.</li>
            </ol>
          </div>
        </div>
      </div>
    </Shell>
  );
}
