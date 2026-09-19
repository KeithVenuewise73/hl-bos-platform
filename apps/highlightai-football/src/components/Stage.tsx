import type { BoundingBox } from "@hl-bos/highlight-football";

/**
 * The video stage.
 *
 * IMPORTANT AND DELIBERATE: in demo mode there is no video file, so this draws
 * a field and the real detection boxes over it rather than showing a fake video
 * player with a fake play button. A control that cannot do its job is worse
 * than its absence — a play button over nothing teaches the user the product is
 * broken before they reach the part that works.
 *
 * The overlay geometry is the genuine output of the engine: these box positions
 * are what the tracker and the spotlight planner produced.
 */
export function Stage({
  player,
  ball,
  markerLabel,
  cropWindow,
  caption,
}: {
  player: BoundingBox | null;
  ball: BoundingBox | null;
  markerLabel?: string | undefined;
  cropWindow?: BoundingBox | null | undefined;
  caption?: string | undefined;
}) {
  const yardLines = Array.from({ length: 11 }, (_, i) => i * 10);
  return (
    <div className="stage">
      <svg
        className="stage-field"
        viewBox="0 0 160 90"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="160" height="90" fill="#0a1410" />
        <rect x="0" y="18" width="160" height="60" fill="#0c1c14" />
        {yardLines.map((y) => (
          <line
            key={y}
            x1={y * 1.6}
            y1="18"
            x2={y * 1.6}
            y2="78"
            stroke="#16311f"
            strokeWidth="0.4"
          />
        ))}
        <line
          x1="0"
          y1="34"
          x2="160"
          y2="34"
          stroke="#16311f"
          strokeWidth="0.3"
          strokeDasharray="1 3"
        />
        <line
          x1="0"
          y1="62"
          x2="160"
          y2="62"
          stroke="#16311f"
          strokeWidth="0.3"
          strokeDasharray="1 3"
        />
      </svg>

      {cropWindow != null ? (
        <div
          className="crop-guide"
          style={{
            left: `${cropWindow.x * 100}%`,
            top: `${cropWindow.y * 100}%`,
            width: `${cropWindow.w * 100}%`,
            height: `${cropWindow.h * 100}%`,
          }}
        />
      ) : null}

      {ball !== null ? (
        <div
          style={{
            position: "absolute",
            left: `${ball.x * 100}%`,
            top: `${ball.y * 100}%`,
            width: `${Math.max(ball.w, 0.01) * 100}%`,
            height: `${Math.max(ball.h, 0.018) * 100}%`,
            background: "#c98a4b",
            borderRadius: "50%",
            boxShadow: "0 0 8px rgba(201,138,75,0.7)",
          }}
          aria-label="Football"
        />
      ) : null}

      {player !== null ? (
        <>
          {/* An OUTLINE, never a fill. A filled shape hides the play it is
              pointing at, which is the one thing the brief forbids. */}
          <div
            className="marker"
            style={{
              left: `${(player.x - player.w * 0.25) * 100}%`,
              top: `${(player.y - player.h * 0.12) * 100}%`,
              width: `${player.w * 1.5 * 100}%`,
              height: `${player.h * 1.24 * 100}%`,
            }}
          />
          {markerLabel !== undefined ? (
            <div
              className="marker-label"
              style={{
                left: `${Math.min(88, (player.x + player.w * 1.5) * 100)}%`,
                top: `${Math.max(2, (player.y - player.h * 0.3) * 100)}%`,
              }}
            >
              {markerLabel}
            </div>
          ) : null}
        </>
      ) : (
        <div className="stage-empty">
          <div>Your player was not detected in this frame.</div>
          <div className="dim">
            He may be in a pile, behind a lineman, or out of shot. Tracking picks him
            back up when he reappears.
          </div>
        </div>
      )}

      {caption !== undefined ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 10,
            fontSize: 11.5,
            color: "#9aa8bb",
            background: "rgba(4,7,10,0.8)",
            padding: "3px 9px",
            borderRadius: 5,
            border: "1px solid #212c3b",
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}
