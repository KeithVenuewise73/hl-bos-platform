"use client";

import { useState, useTransition } from "react";
import { createAssignment, type ActionResult } from "@/app/actions";

export function AssignmentForm({
  players,
  clips,
}: {
  players: readonly { id: string; label: string }[];
  clips: readonly { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form action={(fd) => start(async () => setResult(await createAssignment(fd)))}>
      <div className="grid grid-3">
        <label className="field">
          <span className="field-label">Player</span>
          <select name="player_id" required disabled={pending}>
            <option value="">Choose&hellip;</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <select name="assignment_kind" required disabled={pending}>
            <option value="review">Review</option>
            <option value="correct">Correction</option>
            <option value="study">Study</option>
            <option value="great_rep">Great rep</option>
            <option value="technique">Technique</option>
            <option value="mental_error">Mental error</option>
            <option value="opponent_tendency">Opponent tendency</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Due</span>
          <input type="date" name="due_on" disabled={pending} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Clip</span>
        <select name="clip_id" disabled={pending}>
          <option value="">Attach nothing for now</option>
          {clips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Message</span>
        <textarea
          name="message"
          disabled={pending}
          placeholder="Watch your initial alignment and first two steps."
        />
      </label>

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Assigning…" : "Assign film"}
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
