"use client";

import { useState, useTransition } from "react";
import { upsertGame, upsertOpponent, type ActionResult } from "@/app/actions";

export function OpponentForm({ teamId }: { teamId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("team_id", teamId);
        start(async () => setResult(await upsertOpponent(fd)));
      }}
    >
      <div className="row">
        <input
          type="text"
          name="name"
          required
          placeholder="Orchard Park"
          disabled={pending}
        />
        <input type="text" name="mascot" placeholder="Quakers" disabled={pending} />
        <button className="btn" type="submit" disabled={pending}>
          Add opponent
        </button>
      </div>
      {result !== null ? (
        <div
          className={result.ok ? "notice accent" : "notice bad"}
          style={{ marginTop: 10 }}
        >
          {result.message}
        </div>
      ) : null}
    </form>
  );
}

export function GameForm({
  teamId,
  opponents,
  seasons,
}: {
  teamId: string;
  opponents: readonly { id: string; name: string }[];
  seasons: readonly { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("team_id", teamId);
        start(async () => setResult(await upsertGame(fd)));
      }}
    >
      <div className="grid grid-3">
        <label className="field">
          <span className="field-label">Opponent</span>
          <select name="opponent_id" disabled={pending}>
            <option value="">Not set</option>
            {opponents.map((opponent) => (
              <option key={opponent.id} value={opponent.id}>
                {opponent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Season</span>
          <select name="season_id" disabled={pending}>
            <option value="">Not set</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Kickoff</span>
          <input type="datetime-local" name="kickoff_at" disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Venue</span>
          <select name="venue" disabled={pending}>
            <option value="home">Home</option>
            <option value="away">Away</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Week</span>
          <input type="number" name="week" min={0} max={25} disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Location</span>
          <input type="text" name="location" disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Our score</span>
          <input type="number" name="team_score" min={0} max={200} disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Their score</span>
          <input
            type="number"
            name="opponent_score"
            min={0}
            max={200}
            disabled={pending}
          />
        </label>
      </div>
      <p className="tiny faint" style={{ margin: "0 0 10px" }}>
        Leave both scores blank for a game that has not been played. They stay empty
        rather than defaulting to 0, so an upcoming game never renders as a 0&ndash;0
        loss.
      </p>
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save game"}
      </button>
      {result !== null ? (
        <div
          className={result.ok ? "notice accent" : "notice bad"}
          style={{ marginTop: 12 }}
        >
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
