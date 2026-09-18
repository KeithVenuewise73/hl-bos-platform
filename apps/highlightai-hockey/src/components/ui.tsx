import type { ReactNode } from "react";

import {
  describeBand,
  jerseyColorLabel,
  type ConfidenceBand,
  type PlayerSegment,
} from "@hl-bos/hockey-highlights";

export function Card({
  title,
  children,
  footnote,
}: {
  title?: string;
  children: ReactNode;
  footnote?: string;
}) {
  return (
    <section className="card">
      {title !== undefined && <h2 className="card-title">{title}</h2>}
      {children}
      {footnote !== undefined && <p className="footnote">{footnote}</p>}
    </section>
  );
}

/**
 * The panel an empty screen shows.
 *
 * Required by the platform's honesty rule: a section with no data says so and
 * says WHY. An empty panel that explains itself beats a green one that lies,
 * and this component exists so no page can accidentally render the second.
 */
export function Empty({
  heading,
  reasons,
}: {
  heading: string;
  reasons: readonly string[];
}) {
  return (
    <div className="empty">
      <p className="empty-heading">{heading}</p>
      {reasons.length > 0 && (
        <ul className="empty-reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * How sure we are, said in words rather than a number.
 *
 * A review screen that prints "0.62" invites the reader to treat it as
 * precision it does not have. The number is shown too, but second, and the
 * evidence behind it is always one click away — never a bare figure.
 */
export function Confidence({ band, value }: { band: ConfidenceBand; value: number }) {
  return (
    <span className={`band band-${band}`} title={describeBand(band)}>
      {band} · {Math.round(value * 100)}%
    </span>
  );
}

/** Why we think this is the player. Always rendered next to the claim. */
export function Evidence({ segment }: { segment: PlayerSegment }) {
  const { evidence } = segment;
  return (
    <dl className="evidence">
      <div>
        <dt>Jersey colour</dt>
        <dd>
          {Math.round(evidence.colorAgreement * 100)}% of readings agreed
          {evidence.colorClarity > 0 &&
            `, clarity ${Math.round(evidence.colorClarity * 100)}%`}
        </dd>
      </div>
      <div>
        <dt>Jersey number</dt>
        <dd>
          {evidence.numberReadCount === 0 ? (
            <em>never read clearly in this stretch</em>
          ) : (
            `read ${evidence.numberReadCount} times, ${Math.round(evidence.numberAgreement * 100)}% agreed, clarity ${Math.round(evidence.numberClarity * 100)}%`
          )}
        </dd>
      </div>
      <div>
        <dt>Reference photo</dt>
        <dd>
          {evidence.photoSimilarity === null ? (
            <em>not compared</em>
          ) : (
            `${Math.round(evidence.photoSimilarity * 100)}% similar`
          )}
        </dd>
      </div>
      <div>
        <dt>Seen in</dt>
        <dd>{evidence.observationCount} sampled frames</dd>
      </div>
      <div>
        <dt>Found by</dt>
        <dd className="mono">{segment.detectionSource}</dd>
      </div>
    </dl>
  );
}

export function Jersey({ colorId, number }: { colorId: string; number: string }) {
  return (
    <span className="jersey">
      {jerseyColorLabel(colorId)} · #{number}
    </span>
  );
}

export function timecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fileSize(bytes: number | null): string {
  if (bytes === null) return "not measured yet";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
