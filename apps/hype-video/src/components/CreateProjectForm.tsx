"use client";

import { useActionState, useState } from "react";

import { CREATOR_ROLES, TEMPLATES, type TemplateKey } from "@hl-bos/hype-video";

import { createProject, type CreateState } from "@/lib/actions.ts";

const ROLE_LABEL: Record<(typeof CREATOR_ROLES)[number], string> = {
  parent: "Parent / guardian",
  athlete: "Athlete",
  coach: "Coach",
  team: "Team",
  media: "Sports media creator",
  organizer: "Tournament / event organizer",
};

/**
 * The first thing on the dashboard: start a project right here.
 *
 * Consent is collected up front rather than at the end, because it gates the
 * upload — nobody should have put a child's photo into the app before saying
 * they are allowed to.
 */
export function CreateProjectForm({
  initialTemplate = "game_day",
}: {
  initialTemplate?: TemplateKey;
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    createProject,
    { problems: [] },
  );
  const [minor, setMinor] = useState(true);
  const v = state.values;

  // Keyed on the attempt, so the echoed values are what the form resets to.
  return (
    <form action={action} className="stack" key={state.problems.join("|")}>
      <label className="field">
        <span>Project name</span>
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={v?.name ?? ""}
          placeholder="Jordan — Game Day vs. Central"
        />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>Hype style</span>
          <select name="template" defaultValue={v?.template ?? initialTemplate}>
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>I am a…</span>
          <select name="creatorRole" defaultValue={v?.creatorRole ?? "parent"}>
            {CREATOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="notice warn small">
        <strong>Only upload photos and video you have the right to use.</strong>{" "}
        Don&apos;t upload anyone else&apos;s footage or photos of other people&apos;s
        kids without their permission. Projects are private and stay on this computer.
      </div>

      <label className="check">
        <input
          type="checkbox"
          name="mediaRightsConfirmed"
          defaultChecked={v?.mediaRightsConfirmed ?? false}
        />
        <span>
          <strong>I have the right to use the media I upload</strong>
          <span className="muted small">
            …and permission from everyone who appears in it.
          </span>
        </span>
      </label>

      <label className="check">
        <input
          type="checkbox"
          name="featuresMinor"
          checked={minor}
          onChange={(e) => setMinor(e.target.checked)}
        />
        <span>
          <strong>The athlete is under 18</strong>
          <span className="muted small">
            Youth and high-school athletes need a parent or guardian&apos;s consent.
          </span>
        </span>
      </label>

      {minor ? (
        <div className="stack">
          <label className="check">
            <input
              type="checkbox"
              name="guardianConsentConfirmed"
              defaultChecked={v?.guardianConsentConfirmed ?? false}
            />
            <span>
              <strong>I am the parent or guardian, or I have their consent</strong>
              <span className="muted small">
                to create and keep this video of their child.
              </span>
            </span>
          </label>
          <label className="field">
            <span>Parent / guardian name</span>
            <input
              type="text"
              name="guardianName"
              maxLength={80}
              defaultValue={v?.guardianName ?? ""}
              placeholder="Maria Reyes"
            />
            <small>
              Recorded with the project. We can&apos;t verify it — it&apos;s your
              statement.
            </small>
          </label>
        </div>
      ) : null}

      {state.problems.length > 0 ? (
        <div className="notice bad" role="alert">
          <strong>Almost there:</strong>
          <ul>
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button type="submit" className="btn big" disabled={pending}>
        {pending ? "Creating…" : "Create hype project →"}
      </button>
    </form>
  );
}
