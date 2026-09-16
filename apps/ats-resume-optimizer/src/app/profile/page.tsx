import { Card, Empty, Notice, PageHead, SampleTag } from "@/components/ui.tsx";
import { addCareerFact, deleteCareerFact, saveProfile } from "@/lib/actions.ts";
import { currentProfile, factsFor } from "@/lib/store.ts";
import type { CareerFact, FactCategory } from "@hl-bos/ats-resume";

export const dynamic = "force-dynamic";

const CATEGORIES: readonly { readonly value: FactCategory; readonly label: string }[] =
  [
    { value: "accomplishment", label: "Accomplishment (with a measurable result)" },
    { value: "responsibility", label: "Responsibility" },
    { value: "metric", label: "Measurable result / metric" },
    { value: "scope", label: "Scope (team size, budget, revenue, P&L)" },
    { value: "software", label: "Software / system" },
    { value: "technical_skill", label: "Technical skill" },
    { value: "leadership_skill", label: "Leadership skill" },
    { value: "operational_skill", label: "Operational skill" },
    { value: "certification", label: "Certification" },
    { value: "license", label: "Licence" },
    { value: "education", label: "Education" },
    { value: "industry", label: "Industry experience" },
    { value: "award", label: "Award" },
    { value: "volunteer", label: "Volunteer experience" },
    { value: "project", label: "Project" },
    { value: "military", label: "Military service" },
    { value: "other", label: "Other career fact" },
  ];

const SOURCE_LABEL: Record<CareerFact["source"], { label: string; cls: string }> = {
  resume: { label: "Resume", cls: "tag tag-neutral" },
  user_confirmed: { label: "You confirmed", cls: "tag tag-strong" },
  generated_wording: { label: "Generated wording", cls: "tag tag-confirm" },
};

export default async function ProfilePage() {
  const profile = await currentProfile();
  const facts = profile === undefined ? [] : await factsFor(profile.id);

  const grouped = new Map<string, CareerFact[]>();
  for (const fact of facts) {
    const key = fact.context ?? "Not tied to a specific role";
    const list = grouped.get(key) ?? [];
    list.push(fact);
    grouped.set(key, list);
  }

  return (
    <>
      <PageHead
        title="Candidate Profile"
        lead="Your structured career database. Every fact here carries its source, and nothing else in this app may claim anything that is not in here."
      />

      {profile?.isSample === true ? (
        <Notice tone="sample">
          <strong>Sample profile.</strong> This is fictional data. Add your own resume
          on the Master Resume screen; delete the sample in Settings.
        </Notice>
      ) : null}

      <Card
        title="Identity and contact"
        sub="What appears in the header of an exported resume."
      >
        <form action={saveProfile}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                defaultValue={profile?.fullName ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={profile?.contact.email ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile?.contact.phone ?? ""}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                name="location"
                type="text"
                defaultValue={profile?.contact.location ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="linkedin">LinkedIn</label>
              <input
                id="linkedin"
                name="linkedin"
                type="text"
                defaultValue={profile?.contact.linkedin ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                defaultValue={profile?.contact.website ?? ""}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="headline">Professional headline</label>
            <input
              id="headline"
              name="headline"
              type="text"
              defaultValue={profile?.headline ?? ""}
            />
            <p className="hint">
              A positioning line, not a job title you have never held. The optimizer may
              add supported terminology to it for a specific posting.
            </p>
          </div>
          <div className="field">
            <label htmlFor="summary">Professional summary</label>
            <textarea
              id="summary"
              name="summary"
              defaultValue={profile?.summary ?? ""}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Save profile
          </button>
        </form>
      </Card>

      <Card
        title="Add a career fact"
        sub="Something true about your career that your resume does not currently say. Stored as evidence you confirmed, and usable by the optimizer straight away."
      >
        <Notice>
          This is the only way a new claim can enter the system. Nothing the app
          generates can introduce a fact — it can only rephrase, reorder and emphasise
          what is here.
        </Notice>
        <form action={addCareerFact}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="category">Kind of fact</label>
              <select id="category" name="category" defaultValue="accomplishment">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="context">Which role does it belong to? (optional)</label>
              <input
                id="context"
                name="context"
                type="text"
                placeholder="Meridian Logistics Group — Senior Operations Manager"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="text">The fact, in your own words</label>
            <textarea
              id="text"
              name="text"
              placeholder="Held P&L responsibility for a $40M book across four distribution centers."
              required
            />
            <p className="hint">
              Include the numbers. A figure that is not written down here can never
              appear on a generated resume.
            </p>
          </div>
          <button className="btn btn-primary" type="submit">
            Add fact
          </button>
        </form>
      </Card>

      <Card
        title={`Career database (${facts.length} facts)`}
        sub="Grouped by role. These are the only statements the optimizer may draw on."
      >
        {facts.length === 0 ? (
          <Empty>
            Nothing stored yet. Upload or paste a resume on the Master Resume screen and
            every line of it becomes evidence here.
          </Empty>
        ) : (
          <div className="stack">
            {[...grouped.entries()].map(([context, items]) => (
              <div key={context}>
                <h3 style={{ marginBottom: 6 }}>{context}</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fact</th>
                        <th>Kind</th>
                        <th>Source</th>
                        <th>Figures</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((fact) => (
                        <tr key={fact.id}>
                          <td>
                            {fact.text}
                            {fact.isSample === true ? (
                              <>
                                {" "}
                                <SampleTag />
                              </>
                            ) : null}
                          </td>
                          <td className="small muted nowrap">
                            {fact.category.replace(/_/g, " ")}
                          </td>
                          <td>
                            <span className={SOURCE_LABEL[fact.source].cls}>
                              {SOURCE_LABEL[fact.source].label}
                            </span>
                          </td>
                          <td className="mono small">
                            {fact.numbers.length === 0 ? "—" : fact.numbers.join(", ")}
                          </td>
                          <td>
                            <form action={deleteCareerFact}>
                              <input type="hidden" name="factId" value={fact.id} />
                              <button className="btn btn-sm btn-danger" type="submit">
                                Delete
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
