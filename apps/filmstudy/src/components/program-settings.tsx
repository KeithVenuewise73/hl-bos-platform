"use client";

import { useState, useTransition } from "react";
import { updateTeamSettings, type ActionResult } from "@/app/actions";
import { Card, Notice } from "./ui";

/**
 * Program settings — the privacy decisions.
 *
 * Both visibility switches default closed and are described in terms of what
 * they actually do to a person, not as feature toggles. A coach grade is
 * coaching information before it is athlete feedback, and this product holds
 * grades of 14-year-olds.
 */
export function ProgramSettings({
  teamId,
  gradeScale,
  athletesSeeGrades,
  guardianAccess,
  guardiansSeeGrades,
}: {
  teamId: string;
  gradeScale: "symbol" | "numeric";
  athletesSeeGrades: boolean;
  guardianAccess: boolean;
  guardiansSeeGrades: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [guardians, setGuardians] = useState(guardianAccess);

  return (
    <Card title="Program settings">
      <form
        action={(fd) => {
          fd.set("team_id", teamId);
          start(async () => setResult(await updateTeamSettings(fd)));
        }}
      >
        <label className="field">
          <span className="field-label">Grading scale</span>
          <select name="grade_scale" defaultValue={gradeScale} disabled={pending}>
            <option value="symbol">
              Symbols (++ / + / 0 / &minus; / &minus;&minus;)
            </option>
            <option value="numeric">Numeric (0&ndash;100)</option>
          </select>
          <span className="tiny faint">
            One scale per team. The database refuses a grade on the other scale, because
            a season summary mixing both is uncomputable.
          </span>
        </label>

        <label className="row" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            name="athletes_see_grades"
            defaultChecked={athletesSeeGrades}
            style={{ width: "auto" }}
            disabled={pending}
          />
          <span className="small">
            <strong>Athletes can see their own grades.</strong> Off by default. When
            off, an athlete still sees the coaching notes you mark as shared.
          </span>
        </label>

        <label className="row" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            name="guardian_access"
            checked={guardians}
            onChange={(event) => setGuardians(event.target.checked)}
            style={{ width: "auto" }}
            disabled={pending}
          />
          <span className="small">
            <strong>Guardians can access this team.</strong> Off by default. Guardians
            never see opponent scouting film on any setting.
          </span>
        </label>

        <label className="row" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            name="guardians_see_grades"
            defaultChecked={guardiansSeeGrades}
            style={{ width: "auto" }}
            disabled={pending || !guardians}
          />
          <span className="small">
            <strong>Guardians can see their child&rsquo;s grades.</strong> Requires
            guardian access. A separate decision on purpose: a program may want teaching
            points to reach home without grades going with them.
          </span>
        </label>

        <Notice>
          These two switches are enforced in the database, not on this screen. Turning
          one off makes the rows unreachable, so a future page cannot leak what this
          page hides.
        </Notice>

        <button
          className="btn primary"
          type="submit"
          disabled={pending}
          style={{ marginTop: 12 }}
        >
          {pending ? "Saving…" : "Save settings"}
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
    </Card>
  );
}
