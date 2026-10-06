import {
  bandFor,
  formatConfidence,
  type ConfidenceThresholds,
} from "@hl-bos/jersey-sort";

import { photoAction } from "@/actions/review.ts";
import type { FullDetection, PhotoDetail } from "@/lib/repo/photos.ts";

type Shade = "light" | "dark";

/** The two teams of a photo's event, when it has two and both jerseys are set. */
export interface EditorTeams {
  readonly home: { readonly name: string; readonly jersey: Shade };
  readonly away: { readonly name: string; readonly jersey: Shade };
}

export function editorTeams(photo: PhotoDetail): EditorTeams | null {
  if (
    photo.away_team_id === null ||
    photo.home_jersey === null ||
    photo.away_jersey === null ||
    photo.opponent === null
  ) {
    return null;
  }
  return {
    home: { name: photo.team_name, jersey: photo.home_jersey },
    away: { name: photo.opponent, jersey: photo.away_jersey },
  };
}

const BAND_STYLE = {
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
} as const;
const BAND_LABEL = {
  high: "High",
  medium: "Needs review",
  low: "Low · unidentified",
} as const;

const LOCATION_LABEL: Record<string, string> = {
  jersey_front: "front of jersey",
  jersey_back: "back of jersey",
  shoulder: "shoulder",
  helmet: "helmet",
  shorts: "shorts",
  jersey_unspecified: "jersey",
  unknown: "location not determined",
};

/**
 * Every detected number with its confidence and its controls: confirm,
 * delete, change; plus "add another number". Plain forms: works without
 * JavaScript and with the keyboard.
 */
export function DetectionEditor({
  photoId,
  detections,
  thresholds,
  returnTo,
  autoFocusAdd = false,
  teams = null,
}: {
  photoId: string;
  detections: readonly FullDetection[];
  thresholds: ConfidenceThresholds;
  returnTo: string;
  autoFocusAdd?: boolean;
  /** Set for a two-team event: each number is TEAM + NUMBER. */
  teams?: EditorTeams | null;
}) {
  const sides = teams === null ? [] : [teams.home, teams.away];
  const active = detections.filter((d) => d.status !== "rejected");
  const rejected = detections.filter((d) => d.status === "rejected");
  return (
    <div className="space-y-2">
      {active.length === 0 ? (
        <p className="text-sm text-muted">No jersey numbers on this photo.</p>
      ) : null}
      {active.map((d) => {
        const band = bandFor(d.confidence, thresholds);
        return (
          <div
            key={d.id}
            className="rounded-lg border border-line bg-panel-2 p-3"
            data-testid={`detection-${d.detected_value}`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {teams !== null ? (
                <span
                  className={`text-sm font-semibold ${d.team_name ? "text-brand-2" : "text-medium"}`}
                  data-testid="detection-team"
                >
                  {d.team_name ?? "Team not known"}
                </span>
              ) : null}
              <span className="display text-3xl">#{d.detected_value}</span>
              {d.status === "confirmed" ? (
                <span className="chip bg-high text-black">Confirmed</span>
              ) : (
                <span className={`text-sm font-semibold ${BAND_STYLE[band]}`}>
                  {formatConfidence(d.confidence)} · {BAND_LABEL[band]}
                </span>
              )}
              <span className="text-xs text-muted">
                {d.method === "manual"
                  ? "added by a person"
                  : `${d.method === "ocr" ? "OCR" : "AI vision"} · ${d.provider}${d.location ? ` · ${LOCATION_LABEL[d.location] ?? d.location}` : ""}`}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {d.status !== "confirmed" ? (
                <form action={photoAction}>
                  <input type="hidden" name="op" value="confirm" />
                  <input type="hidden" name="detectionId" value={d.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button className="btn-primary" type="submit">
                    ✓ Confirm #{d.detected_value}
                  </button>
                </form>
              ) : null}
              {sides
                .filter((side) => side.jersey !== d.jersey)
                .map((side) => (
                  <form action={photoAction} key={side.jersey}>
                    <input type="hidden" name="op" value="jersey" />
                    <input type="hidden" name="detectionId" value={d.id} />
                    <input type="hidden" name="jersey" value={side.jersey} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      className="btn-ghost"
                      type="submit"
                      data-testid={`set-team-${side.jersey}`}
                    >
                      {d.team_name === null ? "" : "No — "}
                      {side.name} ({side.jersey})
                    </button>
                  </form>
                ))}
              <form action={photoAction}>
                <input type="hidden" name="op" value="reject" />
                <input type="hidden" name="detectionId" value={d.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="btn-danger" type="submit">
                  Delete
                </button>
              </form>
              <form action={photoAction} className="flex items-center gap-1">
                <input type="hidden" name="op" value="change" />
                <input type="hidden" name="detectionId" value={d.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input
                  className="input w-16"
                  name="value"
                  inputMode="numeric"
                  maxLength={3}
                  aria-label={`Change #${d.detected_value} to`}
                  placeholder="#"
                  required
                />
                <button className="btn-ghost" type="submit">
                  Change
                </button>
              </form>
            </div>
          </div>
        );
      })}
      <form action={photoAction} className="flex items-center gap-2 pt-1">
        <input type="hidden" name="op" value="add" />
        <input type="hidden" name="photoId" value={photoId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input
          className="input w-20"
          name="value"
          inputMode="numeric"
          maxLength={3}
          placeholder="#"
          aria-label="Add a jersey number"
          required
          autoFocus={autoFocusAdd}
          id="add-number"
        />
        {teams !== null ? (
          <select
            className="input w-auto"
            name="jersey"
            aria-label="Which team"
            defaultValue=""
            data-testid="add-number-team"
          >
            <option value="">Team not known</option>
            {sides.map((side) => (
              <option key={side.jersey} value={side.jersey}>
                {side.name} ({side.jersey})
              </option>
            ))}
          </select>
        ) : null}
        <button className="btn-ghost" type="submit">
          + Add number
        </button>
      </form>
      {rejected.length > 0 ? (
        <p className="text-xs text-muted">
          Removed: {rejected.map((d) => `#${d.detected_value}`).join(", ")} (kept in
          history; analysis will not re-add them)
        </p>
      ) : null}
    </div>
  );
}

export function FlagButton({
  photoId,
  op,
  label,
  returnTo,
  className = "btn-ghost",
  title,
}: {
  photoId: string;
  op: string;
  label: string;
  returnTo: string;
  className?: string;
  title?: string;
}) {
  return (
    <form action={photoAction}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="photoId" value={photoId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button className={className} type="submit" title={title} data-op={op}>
        {label}
      </button>
    </form>
  );
}
