import { Shell, PageHead, Empty } from "@/components/Shell";
import { buildReel, demoAnalysis, selectionFor } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { clock, decimal, duration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ReelPreview() {
  const mode = currentMode();
  const analysis = demoAnalysis();
  const reel = buildReel(analysis, selectionFor(analysis, "involved_plays"));
  const target = analysis.source.target;

  return (
    <Shell active="/preview" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Reel Preview"
        sub={`${reel.clips.length} clips · ${duration(reel.totalSeconds)} including the cards.`}
      />

      <div className="split split-2">
        <div>
          {/* The opening card, as it will be rendered. */}
          <div
            className="stage"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
                {reel.opening?.headline ?? target.name.toUpperCase()}
              </div>
              <div
                style={{
                  marginTop: 10,
                  color: "var(--brand)",
                  fontSize: 21,
                  fontWeight: 700,
                }}
              >
                #{target.number}
              </div>
              {(reel.opening?.lines ?? []).slice(1).map((line) => (
                <div
                  key={line}
                  className="muted"
                  style={{ marginTop: 5, letterSpacing: 1.5, fontSize: 13 }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
          <p className="hint">
            This is the opening card the renderer produces, from the same reel object
            the export uses. There is no video file in demo mode, so there is no play
            button here — a control that cannot do its job is worse than none.
          </p>
        </div>

        <div>
          <div className="card">
            <h2 className="card-title">Running order</h2>
            {reel.clips.length === 0 ? (
              <Empty title="Nothing selected">
                Pick clips in the Highlight Editor and they appear here in order.
              </Empty>
            ) : (
              <ul className="list">
                {reel.clips.map((clip, i) => (
                  <li className="row" key={clip.clipId}>
                    <span className="mono dim">{String(i + 1).padStart(2, "0")}</span>
                    <div className="row-main">
                      <div className="row-title">{clip.title}</div>
                      <div className="row-sub">
                        {clock(clip.window.startSeconds)}–
                        {clock(clip.window.endSeconds)} ·{" "}
                        {duration(clip.durationSeconds)}
                      </div>
                    </div>
                    <span className="score">{decimal(clip.score)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="stack" style={{ marginTop: 14 }}>
              <a
                className="btn btn-primary btn-lg"
                href="/export"
                style={{ width: "100%" }}
              >
                Export this reel
              </a>
              <a className="btn" href="/editor" style={{ width: "100%" }}>
                Back to the editor
              </a>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
