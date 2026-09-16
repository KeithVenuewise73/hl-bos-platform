import { Shell, PageHead } from "@/components/Shell";
import { buildReel, demoAnalysis, selectionFor } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { duration } from "@/lib/format";

export const dynamic = "force-dynamic";

const FORMATS = [
  {
    ratio: "16:9",
    name: "YouTube / Hudl",
    note: "The original framing. Nothing is cropped away.",
  },
  {
    ratio: "9:16",
    name: "TikTok / Reels / Shorts",
    note: "Follows your player, biased toward the football so the play stays legible.",
  },
  { ratio: "1:1", name: "Square social", note: "Same tracking crop, square." },
  { ratio: "4:5", name: "Portrait feed", note: "Same tracking crop, taller." },
];

export default function Export() {
  const mode = currentMode();
  const analysis = demoAnalysis();
  const reel = buildReel(analysis, selectionFor(analysis, "involved_plays"));

  return (
    <Shell active="/export" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Export"
        sub={`${reel.clips.length} clips · ${duration(reel.totalSeconds)}. Exports are private until you share them.`}
      />

      <div className="split split-2">
        <div className="card">
          <h2 className="card-title">Format</h2>
          <div className="stack">
            {FORMATS.map((f) => (
              <label className="row" key={f.ratio} htmlFor={`fmt-${f.ratio}`}>
                <input
                  type="checkbox"
                  id={`fmt-${f.ratio}`}
                  name="format"
                  defaultChecked={f.ratio === "16:9"}
                />
                <div className="row-main">
                  <div className="row-title">
                    {f.name} <span className="mono dim">{f.ratio}</span>
                  </div>
                  <div className="row-sub">{f.note}</div>
                </div>
              </label>
            ))}
          </div>

          <h2 className="card-title" style={{ marginTop: 20 }}>
            Spotlight
          </h2>
          <div className="spread">
            {[
              "Circle",
              "Arrow",
              "Spotlight",
              "Glow",
              "Freeze frame",
              "Zoom",
              "None",
            ].map((s) => (
              <span className={s === "Circle" ? "pill pill-ok" : "pill"} key={s}>
                {s}
              </span>
            ))}
          </div>
          <p className="hint">
            Whichever you pick, the marker is an outline and the name label is placed on
            the side of your player away from the football. The overlay identifies him;
            it never hides the play.
          </p>

          <div className="btn-row" style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary btn-lg"
              type="button"
              disabled={mode.mode === "demo"}
            >
              Render export
            </button>
          </div>
          {mode.mode === "demo" ? (
            <p className="hint">
              Rendering is disabled in demo mode: there is no source video to cut and no
              storage to write to. The reel object above is real — it is exactly what
              would be handed to the renderer.
            </p>
          ) : null}
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Sharing</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              Exports are private. Making one shareable requires a consent record naming
              the adult who granted it, and the database refuses a minor&rsquo;s consent
              that names nobody.
            </p>
            <div className="stack" style={{ marginTop: 12 }}>
              <span className="pill pill-ok">Private — only your team</span>
              <span className="pill">Private link — needs consent</span>
              <span className="pill">Public — needs separate consent</span>
            </div>
            <p className="hint">
              Consent to a private link is not consent to publish. They are different
              records, and the reel can only be shared if <em>every</em> game it draws
              on has consent at that scope.
            </p>
          </div>

          <div className="card">
            <h2 className="card-title">Previous exports</h2>
            <p className="small dim" style={{ margin: 0 }}>
              None. Nothing has been rendered from this installation.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
