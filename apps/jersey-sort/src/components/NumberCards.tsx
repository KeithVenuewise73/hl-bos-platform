import Link from "next/link";

import { compareJerseyNumbers } from "@hl-bos/jersey-sort";

import type { NumberGroup } from "@/lib/repo/events.ts";

/**
 * "#24 — Dominic Herman · 42 photos", one card per jersey gallery, plus
 * Unidentified. In a two-team event each card is TEAM + NUMBER: "Caz #22".
 */
export function NumberCards({
  groups,
  hrefFor,
  unidentified,
  unidentifiedHref,
  showTeams = false,
}: {
  groups: readonly NumberGroup[];
  hrefFor: (group: NumberGroup) => string;
  /** Label each gallery with its team: a two-team event has a #22 on each side. */
  showTeams?: boolean;
  unidentified: number;
  unidentifiedHref: string;
}) {
  // In a two-team event: each team's numbers together, teams by name, and
  // "team not known" last.
  const byTeam = (a: NumberGroup, b: NumberGroup) =>
    Number(a.team_name === null) - Number(b.team_name === null) ||
    (a.team_name ?? "").localeCompare(b.team_name ?? "");
  const sorted = [...groups].sort(
    (a, b) => (showTeams ? byTeam(a, b) : 0) || compareJerseyNumbers(a.value, b.value),
  );
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {sorted.map((g) => (
        <li key={`${g.team_id ?? "none"}|${g.value}`}>
          <Link
            href={hrefFor(g)}
            className="card block p-3 hover:border-muted"
            data-testid={`gallery-${g.team_name ?? "unknown-team"}-${g.value}`}
          >
            {showTeams ? (
              <span
                className={`block truncate text-xs font-semibold uppercase tracking-wide ${g.team_name ? "text-brand-2" : "text-medium"}`}
              >
                {g.team_name ?? "Team not known"}
              </span>
            ) : null}
            <span className="display block text-3xl text-brand">#{g.value}</span>
            {g.player_name ? (
              <span className="block truncate text-sm font-semibold">
                {g.player_name}
              </span>
            ) : null}
            <span className="block text-xs text-muted">
              {g.photo_count.toLocaleString()} photo{g.photo_count === 1 ? "" : "s"}
              {g.needs_review > 0 ? ` · ${g.needs_review} to review` : ""}
            </span>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={unidentifiedHref}
          className="card block border-dashed p-3 hover:border-muted"
        >
          <span className="display block text-2xl text-muted">Unidentified</span>
          <span className="block text-xs text-muted">
            {unidentified.toLocaleString()} photo{unidentified === 1 ? "" : "s"}
          </span>
        </Link>
      </li>
    </ul>
  );
}
