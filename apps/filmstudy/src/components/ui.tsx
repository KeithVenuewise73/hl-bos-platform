import type { ReactNode } from "react";

/**
 * Shared presentation primitives.
 *
 * The empty and notice components are the load-bearing ones. HL-BOS Principle
 * 10 says the dashboard is not exempt from "never invent data", so this product
 * needs a good way to say "there is nothing here, and here is why" — good
 * enough that nobody is tempted to render a plausible zero instead.
 */

export function Card({
  title,
  sub,
  action,
  children,
}: {
  title?: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {title !== undefined ? (
        <div className="card-head">
          <div>
            <h2>{title}</h2>
            {sub !== undefined ? <p className="card-sub">{sub}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  /** A number, or null meaning nothing has been recorded. Never pass 0 for
   *  "unknown" — that is the exact lie this component exists to prevent. */
  value: number | string | null;
  hint?: string;
}) {
  const nothing = value === null;
  return (
    <div className="tile">
      <div className={nothing ? "tile-value muted" : "tile-value"}>
        {nothing ? "Not recorded" : value}
      </div>
      <div className="tile-label">{label}</div>
      {hint !== undefined ? <div className="tile-hint">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?:
    "neutral" | "good" | "warn" | "bad" | "accent" | "offense" | "defense" | "demo";
}) {
  return (
    <span className={tone === "neutral" ? "badge" : `badge ${tone}`}>{children}</span>
  );
}

/**
 * An empty state that explains itself.
 *
 * `reason` is required, not optional. A panel that renders nothing without
 * saying why is indistinguishable from a panel that is broken.
 */
export function Empty({
  title,
  reason,
  action,
}: {
  title: string;
  reason: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <span>{reason}</span>
      {action !== undefined ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function Notice({
  children,
  tone = "warn",
}: {
  children: ReactNode;
  tone?: "warn" | "bad" | "accent";
}) {
  return (
    <div className={tone === "warn" ? "notice" : `notice ${tone}`}>{children}</div>
  );
}

/**
 * A capability that is not built yet.
 *
 * Section 55: "Do not build placeholder screens pretending functionality
 * exists." So this renders what the capability WILL be, which phase it lands
 * in, and what has to be true first — and no mock data, no disabled controls
 * hinting at a finished screen, no sample chart.
 */
export function PhasePage({
  title,
  phase,
  what,
  blockedBy,
}: {
  title: string;
  phase: 2 | 3 | 4 | 5;
  what: string;
  blockedBy: readonly string[];
}) {
  return (
    <div className="phase">
      <span className="phase-tag">Coming in Phase {phase}</span>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>{title}</h2>
      <p className="dim" style={{ maxWidth: 620, margin: "0 auto 18px" }}>
        {what}
      </p>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          textAlign: "left",
          borderTop: "1px solid var(--line)",
          paddingTop: 14,
        }}
      >
        <div
          className="tiny faint"
          style={{ textTransform: "uppercase", letterSpacing: "0.09em" }}
        >
          What has to be true first
        </div>
        <ul className="dim small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {blockedBy.map((item) => (
            <li key={item} style={{ marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub !== undefined ? <p className="page-sub">{sub}</p> : null}
      </div>
      {children !== undefined ? <div className="row">{children}</div> : null}
    </div>
  );
}

/**
 * A model's confidence, shown as a band rather than a decimal.
 *
 * The word "Suggested" is always present. A coach must never have to infer
 * from styling alone that they are looking at a guess.
 */
export function Confidence({
  confidence,
  band,
  label,
}: {
  confidence: number;
  band: "high" | "moderate" | "low";
  label: string;
}) {
  return (
    <span className="confidence" title={label}>
      <span className="confidence-bar">
        <span
          className={`confidence-fill ${band}`}
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`,
          }}
        />
      </span>
      {label}
    </span>
  );
}

/**
 * The field-position strip: a real 100-yard field with the ball spotted on it.
 *
 * A "subtle football-field visual cue" that carries information — where the
 * ball is — rather than decorating the page with turf.
 */
export function FieldStrip({
  yardLine,
  possession,
}: {
  yardLine: number | null;
  possession: "offense" | "defense" | "special_teams" | null;
}) {
  if (yardLine === null) {
    return (
      <div className="field-strip">
        <span className="field-label" style={{ left: "50%" }}>
          field position not tagged
        </span>
      </div>
    );
  }
  const ticks = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  return (
    <div className="field-strip" aria-label={`Ball on the ${yardLine} yard line`}>
      {ticks.map((tick) => (
        <span key={tick} className="field-tick" style={{ left: `${tick}%` }} />
      ))}
      <span className="field-label" style={{ left: "25%" }}>
        {possession === "defense" ? "OPP" : "OWN"} 25
      </span>
      <span className="field-label" style={{ left: "50%" }}>
        50
      </span>
      <span className="field-label" style={{ left: "75%" }}>
        {possession === "defense" ? "OWN" : "OPP"} 25
      </span>
      <span
        className="field-ball"
        style={{ left: `${Math.min(99, Math.max(0, yardLine))}%` }}
      />
    </div>
  );
}

export function Skeleton({ height = 60 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden="true" />;
}
