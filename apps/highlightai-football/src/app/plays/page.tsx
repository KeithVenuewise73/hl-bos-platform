import { Shell, PageHead, Empty } from "@/components/Shell";
import { demoAnalysis, playRows } from "@/lib/analysis";
import { currentMode } from "@/lib/env";
import { clock, decimal, eventLabel, involvementLabel, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODES = [
  { key: "all_plays", label: "All Plays", min: 0 },
  { key: "involved_plays", label: "Involved Plays", min: 2 },
  { key: "best_plays", label: "Best Plays", min: 3 },
  { key: "elite_highlights", label: "Elite Highlights", min: 4 },
] as const;

export default async function DetectedPlays({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = currentMode();
  const analysis = demoAnalysis();
  const rows = playRows(analysis);

  const requested =
    typeof params["mode"] === "string" ? params["mode"] : "involved_plays";
  const active = MODES.find((m) => m.key === requested) ?? MODES[1];
  const visible = rows.filter((r) => r.involvement >= active.min);

  return (
    <Shell active="/plays" isDemo={mode.mode === "demo"}>
      <PageHead
        title="Detected Plays"
        sub={`${rows.length} plays found by motion. ${rows.filter((r) => r.playerPresent).length} of them had your athlete on the field.`}
      />

      <div className="spread" style={{ marginBottom: 14 }}>
        {MODES.map((m) => (
          <a
            key={m.key}
            href={`/plays?mode=${m.key}`}
            className={m.key === active.key ? "btn btn-primary" : "btn"}
          >
            {m.label} ({rows.filter((r) => r.involvement >= m.min).length})
          </a>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty title={`No plays reached "${active.label}"`}>
          That is the honest result for this game at this threshold, not an error. Drop
          to a lower threshold to see what was detected.
        </Empty>
      ) : (
        <div className="grid grid-3">
          {visible.map((row) => (
            <div className="card" key={row.playId}>
              <div className="play-thumb">
                {[18, 34, 50, 66, 82].map((x) => (
                  <div className="play-thumb-yard" key={x} style={{ left: `${x}%` }} />
                ))}
                <div
                  className="marker"
                  style={{ left: "40%", top: "42%", width: "9%", height: "20%" }}
                />
              </div>
              <div className="between">
                <span style={{ fontWeight: 700 }}>Play {row.index + 1}</span>
                <span className="mono dim">
                  {row.snapSeconds !== null ? clock(row.snapSeconds) : "no snap"}
                </span>
              </div>
              <div className="row-sub" style={{ marginTop: 4 }}>
                {row.playerPresent ? (
                  <>Detected · visible {percent(row.visibility)}</>
                ) : (
                  <span className="dim">Player not detected</span>
                )}
              </div>
              <div className="spread" style={{ marginTop: 8 }}>
                <span className="pill">{involvementLabel(row.involvement)}</span>
                {row.events.map((e) => (
                  <span className="pill pill-info" key={e}>
                    {eventLabel(e)}
                  </span>
                ))}
                {row.reviewRequired ? (
                  <span className="pill pill-warn">Review</span>
                ) : null}
              </div>
              <div className="between" style={{ marginTop: 12 }}>
                <span className="score">
                  {row.score === null ? "—" : decimal(row.score)}
                </span>
                <a className="btn" href={`/analysis?play=${row.playId}`}>
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
