import { Shell, PageHead, Empty } from "@/components/Shell";
import { Stage } from "@/components/Stage";
import {
  buildReel,
  demoAnalysis,
  overlayFrames,
  playRows,
  selectionFor,
} from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { clock, decimal, duration, eventLabel, involvementLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Highlight Editor.
 *
 * Plays on the left, the video in the middle, the reel timeline on the right.
 * The reel's contents and running time are computed by the engine's
 * assembleReel(), so what this screen shows is what an export would produce —
 * not a preview that drifts from the render.
 */
export default async function HighlightEditor({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = currentMode();
  const analysis = demoAnalysis();
  const rows = playRows(analysis);

  const requested = typeof params["play"] === "string" ? params["play"] : undefined;
  const selection = selectionFor(analysis, "involved_plays");
  const reel = buildReel(analysis, selection);

  const focus =
    rows.find((r) => r.playId === requested) ??
    rows.find((r) => r.playId === selection[0]?.playId) ??
    null;
  const frames = focus === null ? [] : overlayFrames(analysis, focus.playId, 40);
  const frame = frames[Math.floor(frames.length * 0.5)] ?? null;

  return (
    <Shell active="/editor" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Highlight Editor"
        sub="Keep what you want, drop what you do not. The running time updates from the same code that renders the export."
      />

      <div className="split">
        <div className="card" style={{ maxHeight: 740, overflowY: "auto" }}>
          <h2 className="card-title">Detected plays</h2>
          {rows.map((row) => {
            const candidate = selection.find((c) => c.playId === row.playId);
            return (
              <a
                key={row.playId}
                href={`/editor?play=${row.playId}`}
                className="play-card"
                data-active={focus?.playId === row.playId ? "true" : "false"}
              >
                <div className="between">
                  <span style={{ fontWeight: 700 }}>Play {row.index + 1}</span>
                  <span className="mono dim">
                    {row.snapSeconds !== null ? clock(row.snapSeconds) : "—"}
                  </span>
                </div>
                <div className="row-sub">{involvementLabel(row.involvement)}</div>
                <div className="between" style={{ marginTop: 6 }}>
                  <span className="small dim">
                    {row.events.map(eventLabel).join(", ") || "no event"}
                  </span>
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {row.score === null ? "—" : decimal(row.score)}
                  </span>
                </div>
                {candidate !== undefined ? (
                  <span className="pill pill-ok" style={{ marginTop: 7 }}>
                    In the reel
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>

        <div>
          <Stage
            player={frame?.player ?? null}
            ball={frame?.ball ?? null}
            markerLabel={`#${analysis.source.target.number}`}
            caption={
              focus !== null && frame !== null
                ? `Play ${focus.index + 1} · ${clock(frame.at.seconds)}`
                : undefined
            }
          />
          {focus !== null ? (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="between">
                <div>
                  <div style={{ fontWeight: 700 }}>Play {focus.index + 1}</div>
                  <div className="small muted">
                    {focus.snapSeconds !== null
                      ? `Snap ${clock(focus.snapSeconds)} · clip ${clock(Math.max(0, focus.snapSeconds - 5))}–${clock(focus.endSeconds + 8)}`
                      : "No snap located — the clip is anchored on the play start."}
                  </div>
                </div>
                <div className="btn-row">
                  <button className="btn" type="button">
                    Trim
                  </button>
                  <button className="btn" type="button">
                    Star
                  </button>
                  <button className="btn btn-primary" type="button">
                    Add clip
                  </button>
                </div>
              </div>
              <div className="stack" style={{ marginTop: 12 }}>
                {focus.reasons.map((r) => (
                  <p className="reason" key={r}>
                    {r}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="card">
            <div className="between" style={{ marginBottom: 10 }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                Highlight timeline
              </h2>
              <span className="pill">{duration(reel.totalSeconds)}</span>
            </div>

            {reel.clips.length === 0 ? (
              <Empty title="No clips yet">
                Add a play from the left and it appears here.
              </Empty>
            ) : (
              <ul className="list">
                {reel.opening !== null ? (
                  <li className="row">
                    <div className="row-main">
                      <div className="row-title">{reel.opening.headline}</div>
                      <div className="row-sub">
                        Opening card · {reel.opening.durationSeconds}s
                      </div>
                    </div>
                  </li>
                ) : null}
                {reel.clips.map((clip, i) => (
                  <li className="row" key={clip.clipId}>
                    <span className="mono dim">{i + 1}</span>
                    <div className="row-main">
                      <div className="row-title">{clip.title}</div>
                      <div className="row-sub">
                        {clock(clip.window.startSeconds)}–
                        {clock(clip.window.endSeconds)} ·{" "}
                        {duration(clip.durationSeconds)} · score {decimal(clip.score)}
                      </div>
                    </div>
                    <button className="btn" type="button" aria-label="Remove clip">
                      ✕
                    </button>
                  </li>
                ))}
                {reel.closing !== null ? (
                  <li className="row">
                    <div className="row-main">
                      <div className="row-title">{reel.closing.headline}</div>
                      <div className="row-sub">
                        Closing card · {reel.closing.durationSeconds}s
                      </div>
                    </div>
                  </li>
                ) : null}
              </ul>
            )}

            {reel.omitted.length > 0 ? (
              <p className="hint">
                {reel.omitted.length} clip(s) were left out: {reel.omitted[0]?.reason}
              </p>
            ) : null}

            <div className="stack" style={{ marginTop: 14 }}>
              <a
                className="btn btn-primary btn-lg"
                href="/preview"
                style={{ width: "100%" }}
              >
                Create my highlights
              </a>
              <a className="btn" href="/export" style={{ width: "100%" }}>
                Export options
              </a>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Clip settings</h2>
            <div className="field">
              <label className="label" htmlFor="pre">
                Seconds before the snap
              </label>
              <input
                className="input"
                id="pre"
                type="number"
                defaultValue={5}
                min={0}
                max={30}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="post">
                Seconds after the play ends
              </label>
              <input
                className="input"
                id="post"
                type="number"
                defaultValue={8}
                min={0}
                max={30}
              />
            </div>
            <p className="hint">
              The clip end is computed from the end of the <em>play</em>, never from a
              fixed length after the snap. A 40-yard run that fades out at the 3-yard
              line is not a highlight.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
