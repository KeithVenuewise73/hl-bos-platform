"use client";

import { useState, useTransition } from "react";
import { upsertPlayer, type ActionResult } from "@/app/actions";

export function PlayerForm({ teamId }: { teamId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("team_id", teamId);
        start(async () => {
          const outcome = await upsertPlayer(fd);
          setResult(outcome);
        });
      }}
    >
      <div className="grid grid-4">
        <label className="field">
          <span className="field-label">First name</span>
          <input type="text" name="first_name" required disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Last name</span>
          <input type="text" name="last_name" required disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Jersey number</span>
          <input
            type="number"
            name="jersey_number"
            min={0}
            max={99}
            disabled={pending}
          />
        </label>
        <label className="field">
          <span className="field-label">Position</span>
          <input type="text" name="position" placeholder="OLB" disabled={pending} />
        </label>
        <label className="field">
          <span className="field-label">Unit</span>
          <select name="unit" disabled={pending}>
            <option value="">Not set</option>
            <option value="offense">Offense</option>
            <option value="defense">Defense</option>
            <option value="special_teams">Special teams</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Class</span>
          <input
            type="text"
            name="class_year"
            placeholder="Junior"
            disabled={pending}
          />
        </label>
        <label className="field">
          <span className="field-label">Height (inches)</span>
          <input
            type="number"
            name="height_inches"
            min={36}
            max={96}
            disabled={pending}
          />
        </label>
        <label className="field">
          <span className="field-label">Weight (lb)</span>
          <input
            type="number"
            name="weight_pounds"
            min={50}
            max={500}
            disabled={pending}
          />
        </label>
      </div>

      <p className="tiny faint" style={{ margin: "0 0 10px" }}>
        Jersey numbers are not unique, on purpose. Most rosters run the same number on
        offense and defense, and youth teams often have none at all.
      </p>

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add player"}
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
