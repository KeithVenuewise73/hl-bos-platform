import {
  CAREER_GOALS,
  EMPLOYMENT_SITUATIONS,
  EMPLOYMENT_TYPES,
  PAY_PERIODS,
  SEARCH_ACTIVITIES,
  SHIFT_LIMITS,
  WORK_ARRANGEMENTS,
  label,
  type SearchProfile,
} from "@hl-bos/ats-resume";

import { Card, Field, Flash, Notice, PageHead } from "@/components/ui.tsx";
import { saveIntake } from "@/lib/career-actions.ts";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

type Values = Record<string, string | string[] | undefined>;

function decodeState(
  state: string | undefined,
): { errors: Record<string, string>; values: Values } | null {
  if (state === undefined) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      errors?: unknown;
      values?: unknown;
    };
    if (typeof parsed.errors !== "object" || typeof parsed.values !== "object")
      return null;
    return {
      errors: parsed.errors as Record<string, string>,
      values: parsed.values as Values,
    };
  } catch {
    return null;
  }
}

function fromProfile(p: SearchProfile | undefined): Values {
  if (p === undefined) return { salaryCurrency: "USD", salaryPeriod: "year" };
  const firm = (b: boolean | undefined) => (b === true ? "firm" : "");
  return {
    employmentSituation: p.employmentSituation,
    searchActivity: p.searchActivity,
    confidential: p.confidential ? "yes" : "no",
    availability: p.availability,
    targetTitles: p.targetTitles.join(", "),
    relatedTitles: p.relatedTitles.join(", "),
    keywords: p.keywords.join(", "),
    industries: p.industries.join(", "),
    goals: [...p.goals],
    locations: p.locations.value.join("\n"),
    locationsFirm: firm(p.locations.firm),
    maxCommuteMiles: p.maxCommuteMiles?.value.toString() ?? "",
    maxCommuteMilesFirm: firm(p.maxCommuteMiles?.firm),
    arrangements: [...p.arrangements.value],
    arrangementsFirm: firm(p.arrangements.firm),
    relocation: p.willingToRelocate ? "yes" : "no",
    maxTravelPercent: p.maxTravelPercent?.value.toString() ?? "",
    maxTravelPercentFirm: firm(p.maxTravelPercent?.firm),
    shiftLimits: [...p.shiftLimits.value],
    shiftLimitsFirm: firm(p.shiftLimits.firm),
    employmentTypes: [...p.employmentTypes.value],
    employmentTypesFirm: firm(p.employmentTypes.firm),
    salaryMin: p.salary?.minimum?.toString() ?? "",
    salaryTarget: p.salary?.target?.toString() ?? "",
    salaryCurrency: p.salary?.currency ?? "USD",
    salaryPeriod: p.salary?.period ?? "year",
    salaryFirm: firm(p.salary?.firm),
  };
}

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; saved?: string }>;
}) {
  const { state, saved } = await searchParams;
  const ctx = await careerContext();
  const failed = decodeState(state);
  const v: Values = failed?.values ?? fromProfile(ctx.search);
  const e = failed?.errors ?? {};
  const one = (k: string): string => {
    const x = v[k];
    return typeof x === "string" ? x : (x?.[0] ?? "");
  };
  const has = (k: string, value: string): boolean => {
    const x = v[k];
    return typeof x === "string" ? x === value : (x ?? []).includes(value);
  };
  const Firm = ({ name }: { name: string }) => (
    <label className="firm">
      <input
        type="checkbox"
        name={`${name}Firm`}
        value="firm"
        defaultChecked={one(`${name}Firm`) === "firm"}
      />
      Must-have (hide jobs that fail this)
    </label>
  );
  const Checks = ({ name, options }: { name: string; options: readonly string[] }) => (
    <div className="checks">
      {options.map((o) => (
        <label key={o}>
          <input type="checkbox" name={name} value={o} defaultChecked={has(name, o)} />{" "}
          {label(o)}
        </label>
      ))}
    </div>
  );

  return (
    <>
      <PageHead
        title="Search profile"
        lead="What you want next. Anything not ticked as a must-have is treated as a preference: it changes how well a job matches, never whether you see it."
      />
      {Object.keys(e).length > 0 ? (
        <Notice tone="danger">
          <strong>Not saved yet.</strong> Fix the {Object.keys(e).length} highlighted
          item(s) below — everything you typed is still here.
        </Notice>
      ) : null}
      <Flash
        ok={
          saved === "1"
            ? "Saved. Your matches have been re-checked against these preferences."
            : undefined
        }
      />

      <form action={saveIntake}>
        <Card
          title="Your situation"
          sub="Kept private. Your employment situation never lowers a match or qualification score."
        >
          <div className="field-row">
            <Field
              id="employmentSituation"
              label="Employment situation"
              error={e["employmentSituation"]}
            >
              <select
                id="employmentSituation"
                name="employmentSituation"
                defaultValue={one("employmentSituation")}
              >
                <option value="">Choose…</option>
                {EMPLOYMENT_SITUATIONS.map((o) => (
                  <option key={o} value={o}>
                    {label(o)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="searchActivity"
              label="Search activity"
              error={e["searchActivity"]}
            >
              <select
                id="searchActivity"
                name="searchActivity"
                defaultValue={one("searchActivity")}
              >
                <option value="">Choose…</option>
                {SEARCH_ACTIVITIES.map((o) => (
                  <option key={o} value={o}>
                    {label(o)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field
              id="confidential"
              label="Confidential search?"
              hint="If yes, drafts never name your current employer and LinkedIn suggestions do not signal that you are looking."
            >
              <select
                id="confidential"
                name="confidential"
                defaultValue={one("confidential") || "no"}
              >
                <option value="no">No</option>
                <option value="yes">Yes — keep it confidential</option>
              </select>
            </Field>
            <Field
              id="availability"
              label="Desired start date or notice period"
              error={e["availability"]}
            >
              <input
                id="availability"
                name="availability"
                placeholder="e.g. 2 weeks' notice, or 2026-12-01"
                defaultValue={one("availability")}
              />
            </Field>
          </div>
        </Card>

        <Card title="Roles">
          <Field
            id="targetTitles"
            label="Target job titles"
            error={e["targetTitles"]}
            hint="Separate with commas."
          >
            <input
              id="targetTitles"
              name="targetTitles"
              placeholder="Transportation Manager, Dispatch Supervisor"
              defaultValue={one("targetTitles")}
            />
          </Field>
          <Field id="relatedTitles" label="Related titles you would also consider">
            <input
              id="relatedTitles"
              name="relatedTitles"
              placeholder="Fleet Manager, Logistics Coordinator"
              defaultValue={one("relatedTitles")}
            />
          </Field>
          <div className="field-row">
            <Field id="keywords" label="Keywords">
              <input
                id="keywords"
                name="keywords"
                placeholder="DOT, routing, WMS"
                defaultValue={one("keywords")}
              />
            </Field>
            <Field id="industries" label="Industries">
              <input
                id="industries"
                name="industries"
                placeholder="3PL, food distribution"
                defaultValue={one("industries")}
              />
            </Field>
          </div>
          <Field id="goals" label="Goals" error={e["goals"]}>
            <Checks name="goals" options={CAREER_GOALS} />
          </Field>
        </Card>

        <Card title="Where and how">
          <Field
            id="locations"
            label="Locations"
            error={e["locations"]}
            hint="One per line, e.g. Columbus, OH"
          >
            <textarea
              id="locations"
              name="locations"
              rows={3}
              defaultValue={one("locations")}
            />
            <Firm name="locations" />
          </Field>
          <div className="field-row">
            <Field
              id="maxCommuteMiles"
              label="Maximum commute (miles)"
              error={e["maxCommuteMiles"]}
              hint="Recorded. Distance is not yet measured automatically."
            >
              <input
                id="maxCommuteMiles"
                name="maxCommuteMiles"
                inputMode="numeric"
                defaultValue={one("maxCommuteMiles")}
              />
              <Firm name="maxCommuteMiles" />
            </Field>
            <Field id="relocation" label="Willing to relocate?">
              <select
                id="relocation"
                name="relocation"
                defaultValue={one("relocation") || "no"}
              >
                <option value="no">No</option>
                <option value="yes">Yes, for the right role</option>
              </select>
            </Field>
          </div>
          <Field id="arrangements" label="Work arrangement" error={e["arrangements"]}>
            <Checks name="arrangements" options={WORK_ARRANGEMENTS} />
            <Firm name="arrangements" />
          </Field>
          <Field
            id="employmentTypes"
            label="Employment type"
            error={e["employmentTypes"]}
          >
            <Checks name="employmentTypes" options={EMPLOYMENT_TYPES} />
            <Firm name="employmentTypes" />
          </Field>
          <div className="field-row">
            <Field
              id="maxTravelPercent"
              label="Maximum travel (%)"
              error={e["maxTravelPercent"]}
            >
              <input
                id="maxTravelPercent"
                name="maxTravelPercent"
                inputMode="numeric"
                defaultValue={one("maxTravelPercent")}
              />
              <Firm name="maxTravelPercent" />
            </Field>
            <Field id="shiftLimits" label="Shift limits" error={e["shiftLimits"]}>
              <Checks name="shiftLimits" options={SHIFT_LIMITS} />
              <Firm name="shiftLimits" />
            </Field>
          </div>
        </Card>

        <Card title="Pay">
          <div className="field-row">
            <Field id="salaryMin" label="Minimum" error={e["salaryMin"]}>
              <input
                id="salaryMin"
                name="salaryMin"
                inputMode="decimal"
                defaultValue={one("salaryMin")}
              />
            </Field>
            <Field id="salaryTarget" label="Target" error={e["salaryTarget"]}>
              <input
                id="salaryTarget"
                name="salaryTarget"
                inputMode="decimal"
                defaultValue={one("salaryTarget")}
              />
            </Field>
            <Field id="salaryCurrency" label="Currency" error={e["salaryCurrency"]}>
              <input
                id="salaryCurrency"
                name="salaryCurrency"
                maxLength={3}
                defaultValue={one("salaryCurrency")}
              />
            </Field>
            <Field id="salaryPeriod" label="Pay period" error={e["salaryPeriod"]}>
              <select
                id="salaryPeriod"
                name="salaryPeriod"
                defaultValue={one("salaryPeriod")}
              >
                {PAY_PERIODS.map((o) => (
                  <option key={o} value={o}>
                    {label(o)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Firm name="salary" />
          <p className="small muted">
            Must-have pay only excludes jobs that disclose a range below your minimum.
            Jobs that do not list pay are shown as “Salary not listed”.
          </p>
        </Card>

        <button className="btn btn-primary" type="submit">
          Save search profile
        </button>
      </form>
    </>
  );
}
