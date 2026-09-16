import { Shell, PageHead, Meter, Empty } from "@/components/Shell";
import { Stage } from "@/components/Stage";
import {
  cropPathFor,
  demoAnalysis,
  overlayFrames,
  playRows,
  spotlightFor,
} from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import {
  clock,
  confidenceTone,
  decimal,
  involvementLabel,
  percent,
  playClassification,
} from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Game Analysis — the strongest screen in the product.
 *
 * Video with the athlete marked, the play timeline beneath it, and a side panel
 * that says what HighlightAI concluded, how sure it is, and WHY. The three
 * buttons at the bottom are the whole correction loop: add it, reject the
 * identification, or fix it.
 */
export default async function GameAnalysis({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = currentMode();
  const analysis = demoAnalysis();
  const rows = playRows(analysis);

  const requested = typeof params["play"] === "string" ? params["play"] : undefined;
  const selected =
    rows.find((r) => r.playId === requested) ??
    [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ??
    null;

  const totalSeconds = analysis.source.game.durationSeconds;
  const frames = selected === null ? [] : overlayFrames(analysis, selected.playId, 60);
  const frame = frames[Math.floor(frames.length * 0.45)] ?? null;
  const spotlight = selected === null ? null : spotlightFor(analysis, selected.playId);
  const cropPath = selected === null ? [] : cropPathFor(analysis, selected.playId);
  const cropWindow = cropPath[Math.floor(cropPath.length * 0.45)]?.window ?? null;

  return (
    <Shell active="/analysis" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Game Analysis"
        sub={`${analysis.source.game.name} — following #${analysis.source.target.number} ${analysis.source.target.name}.`}
      />

      <div className="split">
        {/* Left: detected plays */}
        <div className="card" style={{ maxHeight: 760, overflowY: "auto" }}>
          <h2 className="card-title">Detected plays</h2>
          {rows.map((row) => (
            <a
              key={row.playId}
              href={`/analysis?play=${row.playId}`}
              className="play-card"
              data-active={selected?.playId === row.playId ? "true" : "false"}
            >
              <div className="between">
                <span style={{ fontWeight: 700 }}>Play {row.index + 1}</span>
                <span className="mono dim">
                  {row.snapSeconds !== null ? clock(row.snapSeconds) : "no snap"}
                </span>
              </div>
              <div className="row-sub">
                {row.playerPresent
                  ? involvementLabel(row.involvement)
                  : "Not on the field"}
              </div>
              {row.score !== null ? (
                <div className="between" style={{ marginTop: 6 }}>
                  <span className="small dim">
                    {row.events.join(", ") || "no event detected"}
                  </span>
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {decimal(row.score)}
                  </span>
                </div>
              ) : null}
            </a>
          ))}
        </div>

        {/* Centre: the video */}
        <div>
          <Stage
            player={frame?.player ?? null}
            ball={frame?.ball ?? null}
            markerLabel={`#${analysis.source.target.number}`}
            cropWindow={cropWindow}
            caption={
              selected !== null && frame !== null
                ? `Play ${selected.index + 1} · ${clock(frame.at.seconds)} · frame ${frame.at.frame}`
                : undefined
            }
          />

          <div style={{ marginTop: 12 }}>
            <div className="timeline">
              {rows.map((row) => (
                <div
                  key={row.playId}
                  className="timeline-play"
                  data-involved={row.involvement >= 2 ? "true" : "false"}
                  data-selected={selected?.playId === row.playId ? "true" : "false"}
                  style={{
                    left: `${(row.startSeconds / totalSeconds) * 100}%`,
                    width: `${Math.max(0.5, ((row.endSeconds - row.startSeconds) / totalSeconds) * 100)}%`,
                  }}
                  title={`Play ${row.index + 1} — ${involvementLabel(row.involvement)}`}
                />
              ))}
            </div>
            <div className="between small dim" style={{ marginTop: 6 }}>
              <span>0:00</span>
              <span>
                Green = your player was involved · {clock(totalSeconds)} total
              </span>
              <span>{clock(totalSeconds)}</span>
            </div>
          </div>

          {spotlight?.freeze != null ? (
            <div className="card" style={{ marginTop: 14 }}>
              <h2 className="card-title">Spotlight plan for this clip</h2>
              <div className="between">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {spotlight.freeze.headline}
                  </div>
                  <div className="small muted">{spotlight.freeze.subhead}</div>
                </div>
                <span className="pill pill-info">{spotlight.style}</span>
              </div>
              <p className="hint">
                Freeze at {clock(spotlight.freeze.atSeconds)} for{" "}
                {spotlight.freeze.holdSeconds}s, then the marker tracks him for the
                first seconds of the play and fades. The label sits{" "}
                {spotlight.freeze.label.side} of him — away from the football, so it
                never covers the play.
              </p>
            </div>
          ) : null}
        </div>

        {/* Right: what HighlightAI concluded */}
        <div>
          {selected === null ? (
            <Empty title="No plays were detected">
              Motion segmentation found no football in this file.
            </Empty>
          ) : (
            <>
              <div className="card">
                <h2 className="card-title">Player</h2>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  #{analysis.source.target.number} {analysis.source.target.name}
                </div>
                <div className="small muted">
                  {analysis.source.target.positions.join(" / ")}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="between small">
                    <span className="muted">Detection confidence</span>
                    <span style={{ fontWeight: 700 }}>
                      {percent(selected.identityConfidence)}
                    </span>
                  </div>
                  <div style={{ marginTop: 5 }}>
                    <Meter
                      value={selected.identityConfidence}
                      tone={confidenceTone(selected.identityConfidence)}
                    />
                  </div>
                </div>

                <div className="stack" style={{ marginTop: 14 }}>
                  <Check ok={selected.playerPresent} text="Player detected" />
                  <Check ok={selected.identityConfidence >= 0.6} text="Jersey match" />
                  <Check ok text="Team match" />
                  <Check
                    ok={selected.visibility >= 0.5}
                    text={`Visible for ${percent(selected.visibility)} of the play`}
                  />
                </div>
              </div>

              <div className="card">
                <h2 className="card-title">Current play</h2>
                <div className="between">
                  <span className="muted small">AI classification</span>
                  <span style={{ fontWeight: 600 }}>
                    {playClassification(
                      selected.events,
                      analysis.source.target.positions,
                    )}
                  </span>
                </div>
                <div className="between" style={{ marginTop: 8 }}>
                  <span className="muted small">Highlight score</span>
                  <span className="score">
                    {selected.score === null ? "—" : `${decimal(selected.score)} / 5`}
                  </span>
                </div>
                <div className="between" style={{ marginTop: 8 }}>
                  <span className="muted small">Snap confidence</span>
                  <span style={{ fontWeight: 600 }}>
                    {percent(selected.snapConfidence)}
                  </span>
                </div>
                <div className="stack" style={{ marginTop: 14 }}>
                  {selected.reasons.map((r) => (
                    <p className="reason" key={r}>
                      {r}
                    </p>
                  ))}
                </div>
                {selected.reviewRequired ? (
                  <p className="pill pill-warn" style={{ marginTop: 12 }}>
                    REVIEW REQUIRED
                  </p>
                ) : null}
              </div>

              <div className="card">
                <div className="stack">
                  <button
                    className="btn btn-primary"
                    type="button"
                    style={{ width: "100%" }}
                  >
                    Add to highlights
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    style={{ width: "100%" }}
                  >
                    Not my player
                  </button>
                  <a className="btn" href="/confirm-player" style={{ width: "100%" }}>
                    Correct player
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="small" style={{ color: ok ? "var(--text)" : "var(--text-3)" }}>
      <span style={{ color: ok ? "var(--brand)" : "var(--text-3)", marginRight: 7 }}>
        {ok ? "✓" : "·"}
      </span>
      {text}
    </div>
  );
}
