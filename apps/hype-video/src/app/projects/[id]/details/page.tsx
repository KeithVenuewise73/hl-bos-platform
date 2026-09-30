import {
  findTemplate,
  validateDetails,
  emptyDetails,
  type DetailsField,
} from "@hl-bos/hype-video";

import { Steps } from "@/components/Steps.tsx";
import { saveDetails } from "@/lib/actions.ts";
import { loadProject, param } from "@/lib/load.ts";

export const dynamic = "force-dynamic";

export default async function AthleteDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const project = await loadProject((await params).id);
  const check = param((await searchParams)["check"]) === "1";
  const details = project.details ?? emptyDetails();
  const isTeam = findTemplate(project.template)?.subject === "team";
  const validation = validateDetails(details, project.template);
  const showProblems = check && !validation.ok;
  const problem = (f: DetailsField) =>
    showProblems && validation.problems[f] !== undefined ? (
      <div className="field-error">{validation.problems[f]}</div>
    ) : null;

  return (
    <div data-accent={project.accent}>
      <div className="kicker">{project.name}</div>
      <h1>{isTeam ? "Team details" : "Athlete details"}</h1>
      <Steps project={project} current="details" />

      <form action={saveDetails.bind(null, project.id)} className="card stack">
        {showProblems ? (
          <div className="notice bad" role="alert">
            Saved — but a couple of things are needed before we can write the package.
            They&apos;re marked below.
          </div>
        ) : null}

        <div className="grid-2">
          <label className="field">
            <span>{isTeam ? "Featured player (optional)" : "Athlete name *"}</span>
            <input
              type="text"
              name="athleteName"
              defaultValue={details.athleteName}
              maxLength={80}
              placeholder="Jordan Reyes"
            />
            {problem("athleteName")}
          </label>
          <label className="field">
            <span>Sport *</span>
            <input
              type="text"
              name="sport"
              defaultValue={details.sport}
              maxLength={80}
              placeholder="Basketball"
              list="sports"
            />
            <datalist id="sports">
              {[
                "Football",
                "Basketball",
                "Baseball",
                "Softball",
                "Soccer",
                "Volleyball",
                "Track & Field",
                "Wrestling",
                "Lacrosse",
                "Hockey",
                "Swimming",
                "Tennis",
                "Golf",
                "Cheer",
                "Cross Country",
              ].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {problem("sport")}
          </label>
          <label className="field">
            <span>Team / school *</span>
            <input
              type="text"
              name="teamOrSchool"
              defaultValue={details.teamOrSchool}
              maxLength={80}
              placeholder="Lincoln High Lions"
            />
            {problem("teamOrSchool")}
          </label>
          <div className="grid-2" style={{ gridTemplateColumns: "1fr 2fr" }}>
            <label className="field">
              <span>Jersey #</span>
              <input
                type="text"
                name="jerseyNumber"
                defaultValue={details.jerseyNumber}
                maxLength={3}
                inputMode="numeric"
                placeholder="23"
              />
              {problem("jerseyNumber")}
            </label>
            <label className="field">
              <span>Position</span>
              <input
                type="text"
                name="position"
                defaultValue={details.position}
                maxLength={80}
                placeholder="Point Guard"
              />
            </label>
          </div>
          <label className="field">
            <span>Class year or age group</span>
            <input
              type="text"
              name="classYearOrAgeGroup"
              defaultValue={details.classYearOrAgeGroup}
              maxLength={80}
              placeholder="Class of 2027 · 14U · Senior"
            />
          </label>
          <label className="field">
            <span>Sponsor (optional)</span>
            <input
              type="text"
              name="sponsorName"
              defaultValue={details.sponsorName}
              maxLength={80}
              placeholder="Main Street Pizza"
            />
            <small>Adds a “brought to you by” line. Leave empty for none.</small>
          </label>
        </div>

        <label className="field">
          <span>Key achievements — one per line</span>
          <textarea
            name="achievements"
            defaultValue={details.achievements.join("\n")}
            placeholder={
              "Scored 31 points against Central\nTeam captain\nAll-Conference second team"
            }
          />
          <small>
            <strong>The package only states what you write here.</strong> No stats,
            awards or college offers are ever made up — so if it isn&apos;t here, it
            won&apos;t be in the video.
          </small>
        </label>

        <label className="field">
          <span>Personality &amp; style notes</span>
          <textarea
            name="personalityNotes"
            defaultValue={details.personalityNotes}
            placeholder="Quiet leader who lets the game do the talking. Always first to practice."
            style={{ minHeight: 80 }}
          />
        </label>

        <label className="field">
          <span>Anything else? (optional)</span>
          <textarea
            name="extraContext"
            defaultValue={details.extraContext}
            placeholder="Turning 13 on Saturday · Last home game · Playing through a comeback season"
            style={{ minHeight: 70 }}
          />
          <small>
            Don&apos;t include phone numbers, emails, addresses or schedules —
            they&apos;ll be refused.
          </small>
        </label>

        {validation.suggestions.length > 0 && !showProblems ? (
          <div className="notice small">
            <strong>Tips for a stronger package:</strong>
            <ul>
              {validation.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="row">
          <button type="submit" className="btn">
            Save &amp; choose template →
          </button>
        </div>
      </form>
    </div>
  );
}
