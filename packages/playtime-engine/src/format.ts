import type { ComplianceStatus, Sport } from "./types";
import { PERIOD_NOUN } from "./types";

/** Presentation helpers shared by every surface that renders participation. */

/** Seconds -> `M:SS`, or `H:MM:SS` past an hour. Never a negative clock. */
export function clockText(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${mm}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A 0..1 share as a whole percent.
 *
 * Null in, em dash out. A player share is null only before the clock has ever
 * started, and "0%" would be a different claim: it would say the athlete has
 * been held out, when in truth nobody has played yet.
 */
export function percentText(share: number | null): string {
  if (share === null) return "—";
  return `${Math.round(share * 100)}%`;
}

export const STATUS_LABEL: Readonly<Record<ComplianceStatus, string>> = {
  safe: "Safe",
  at_risk: "At risk",
  below_target: "Below target",
  no_target: "No target set",
};

/** Wording for a finished game, where "at risk" is no longer a meaningful state. */
export const FINAL_STATUS_LABEL: Readonly<Record<ComplianceStatus, string>> = {
  safe: "Minimum met",
  at_risk: "Below minimum",
  below_target: "Below minimum",
  no_target: "No target set",
};

export function periodLabel(sport: Sport, period: number): string {
  return period <= 0 ? "Not started" : `${PERIOD_NOUN[sport]} ${period}`;
}

export function playerLabel(p: {
  firstName: string;
  lastName: string;
  jerseyNumber: string;
}): string {
  const name = `${p.firstName} ${p.lastName}`.trim();
  const jersey = p.jerseyNumber.trim();
  return jersey ? `#${jersey} ${name}`.trim() : name || "Unnamed player";
}
