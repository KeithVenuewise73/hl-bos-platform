"use client";

import { useTransition } from "react";
import { selectTeam } from "@/app/actions";
import type { TeamRow } from "@/lib/types";

/**
 * Switch which team is in context.
 *
 * The list only ever contains teams this user can already see — it is read
 * through RLS — so this control cannot be used to reach a team they are not
 * on. Selecting one sets a cookie; the server still resolves the user's role
 * from the database on every request.
 */
export function TeamSwitcher({
  teams,
  currentId,
}: {
  teams: readonly TeamRow[];
  currentId: string;
}) {
  const [pending, start] = useTransition();
  if (teams.length <= 1) return null;

  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="tiny faint">Team</span>
      <select
        value={currentId}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          start(async () => {
            await selectTeam(next);
          });
        }}
        style={{ width: "auto", minWidth: 190 }}
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
            {team.is_demo ? " (demo)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
