/**
 * Display formatting.
 *
 * Pure, so it is unit tested. Its job is mostly saying "not recorded" in the
 * right places: a product that renders `0` or `—` for a value nobody has
 * entered teaches coaches to distrust every number next to it.
 */

import type { FilmKind, FilmStatus } from "./types";

/** mm:ss, or h:mm:ss past an hour. Game film is routinely 45+ minutes. */
export function timecode(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "--:--";
  }
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
}

/** Human file size. Game film is measured in GB, so this goes that far. */
export function fileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return "unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export const FILM_KIND_LABEL: Record<FilmKind, string> = {
  game: "Game",
  practice: "Practice",
  scrimmage: "Scrimmage",
  individual_workout: "Individual",
  opponent: "Opponent film",
};

export interface StatusDisplay {
  readonly label: string;
  readonly tone: "good" | "warn" | "bad" | "neutral";
  /** Plain English. Shown wherever there is room. */
  readonly meaning: string;
  readonly playable: boolean;
}

/**
 * What a film's status means, in words a coach can act on.
 *
 * `demo_no_video` is the interesting one: it is a success state for demo data
 * and a hard "there is nothing to play" for the UI, and it says so rather than
 * offering a play button that leads nowhere.
 */
export function filmStatus(status: FilmStatus): StatusDisplay {
  switch (status) {
    case "registered":
      return {
        label: "Waiting for upload",
        tone: "warn",
        meaning: "The film record exists. The video file has not been sent yet.",
        playable: false,
      };
    case "uploading":
      return {
        label: "Uploading",
        tone: "warn",
        meaning: "The video is transferring.",
        playable: false,
      };
    case "stored":
      return {
        label: "Stored",
        tone: "warn",
        meaning: "The video arrived and is being made ready to stream.",
        playable: false,
      };
    case "ready":
      return {
        label: "Ready",
        tone: "good",
        meaning: "The film is ready to watch and tag.",
        playable: true,
      };
    case "failed":
      return {
        label: "Upload failed",
        tone: "bad",
        meaning: "The video did not finish transferring. Upload it again.",
        playable: false,
      };
    case "demo_no_video":
      return {
        label: "Demo — no video",
        tone: "neutral",
        meaning:
          "Demo film. The plays and tags are real rows, but there is no video " +
          "file behind this record, so nothing can be played.",
        playable: false,
      };
  }
}

/** A date a coach reads, or a plain statement that there is not one. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "no date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "no date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "W 21-17", "L 14-28", "T 7-7", or null when the game has not been played. */
export function scoreline(
  teamScore: number | null | undefined,
  opponentScore: number | null | undefined,
): string | null {
  if (
    teamScore === null ||
    teamScore === undefined ||
    opponentScore === null ||
    opponentScore === undefined
  ) {
    return null;
  }
  const result =
    teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "T";
  return `${result} ${teamScore}-${opponentScore}`;
}

/** A player's name as a coach writes it: "#24 Reyes". */
export function playerLabel(player: {
  jersey_number: number | null;
  first_name: string;
  last_name: string;
}): string {
  const number = player.jersey_number === null ? "" : `#${player.jersey_number} `;
  return `${number}${player.first_name} ${player.last_name}`;
}

/**
 * A number, or an explicit statement that nothing was recorded.
 *
 * This exists so "0" can only ever mean a measured zero. The dashboard uses it
 * everywhere: a panel with no data says so instead of rendering a confident
 * looking zero.
 */
export function statOrNothing(value: number | null | undefined): {
  text: string;
  measured: boolean;
} {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: "Not recorded", measured: false };
  }
  return { text: String(value), measured: true };
}

/** "3 of 11 (27%)", or an honest refusal when the denominator is zero. */
export function ratio(hits: number, total: number): string {
  if (total <= 0) return "No plays tagged";
  return `${hits} of ${total} (${Math.round((hits / total) * 100)}%)`;
}
