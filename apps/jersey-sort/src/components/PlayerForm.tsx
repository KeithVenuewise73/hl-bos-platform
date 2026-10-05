import type { PlayerRow } from "@/lib/repo/players.ts";

export function PlayerForm({
  action,
  player,
  submit,
  defaults,
}: {
  action: (f: FormData) => Promise<void>;
  player?: PlayerRow;
  submit: string;
  defaults?: { team?: string; season?: string; sport?: string };
}) {
  return (
    <form action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      {player ? <input type="hidden" name="id" value={player.id} /> : null}
      <div>
        <label className="label" htmlFor="first">
          First name
        </label>
        <input
          className="input"
          id="first"
          name="first"
          required
          defaultValue={player?.first_name}
        />
      </div>
      <div>
        <label className="label" htmlFor="last">
          Last name
        </label>
        <input
          className="input"
          id="last"
          name="last"
          required
          defaultValue={player?.last_name}
        />
      </div>
      <div>
        <label className="label" htmlFor="number">
          Jersey number
        </label>
        <input
          className="input"
          id="number"
          name="number"
          inputMode="numeric"
          maxLength={3}
          defaultValue={player?.jersey_number ?? ""}
          placeholder="24"
        />
      </div>
      <div>
        <label className="label" htmlFor="position">
          Position
        </label>
        <input
          className="input"
          id="position"
          name="position"
          defaultValue={player?.position ?? ""}
          placeholder="Defense"
        />
      </div>
      <div>
        <label className="label" htmlFor="team">
          Team
        </label>
        <input
          className="input"
          id="team"
          name="team"
          required
          defaultValue={player?.team_name ?? defaults?.team}
          placeholder="West Seneca"
        />
      </div>
      <div>
        <label className="label" htmlFor="season">
          Season
        </label>
        <input
          className="input"
          id="season"
          name="season"
          required
          defaultValue={player?.season_name ?? defaults?.season}
          placeholder="2026"
        />
      </div>
      <div>
        <label className="label" htmlFor="sport">
          Sport
        </label>
        <input
          className="input"
          id="sport"
          name="sport"
          defaultValue={player?.sport ?? defaults?.sport ?? ""}
          placeholder="Football"
        />
      </div>
      <div>
        <label className="label" htmlFor="year">
          Graduation year
        </label>
        <input
          className="input"
          id="year"
          name="year"
          inputMode="numeric"
          maxLength={4}
          defaultValue={player?.graduation_year ?? ""}
          placeholder="2029"
        />
      </div>
      <p className="text-xs text-muted sm:col-span-2">
        A jersey number belongs to this player for this team and season only. Next
        season #24 can be someone else, and this season&apos;s photos stay with this
        player.
      </p>
      <div className="sm:col-span-2">
        <button className="btn-primary" type="submit">
          {submit}
        </button>
      </div>
    </form>
  );
}
