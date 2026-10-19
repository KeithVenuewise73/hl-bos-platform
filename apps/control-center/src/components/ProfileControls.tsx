"use client";

import { useState, useTransition } from "react";

import {
  assessProfileForm,
  buildProfileDraftForm,
  saveProfileForm,
  seedProfiles,
} from "@/actions/profiles";
import type { PresenceResult } from "@/lib/presence";

import { Status } from "./DemoControls";
import { button, C, input, label } from "./presence-style";

type Verification = "verified" | "unverified" | "required";

const STATUS_OPTIONS: [Verification, string][] = [
  ["verified", "Verified"],
  ["unverified", "Unverified"],
  ["required", "Information required"],
];

export const VERIFICATION_COLOUR: Record<Verification, string> = {
  verified: C.green,
  unverified: C.yellow,
  required: C.grey,
};

export function SeedProfilesButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form action={() => start(async () => setResult(await seedProfiles()))}>
      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending ? "Creating…" : "Create HLG company profiles from approved facts"}
      </button>
      <Status r={result} />
    </form>
  );
}

export interface FieldView {
  key: string;
  label: string;
  value: string;
  status: Verification;
  source: string;
  multiline?: boolean;
}

export interface ListView {
  key: string;
  label: string;
  text: string;
  status: Verification;
  source: string;
  hint: string;
}

function StatusSelect({
  name,
  value,
  id,
}: {
  name: string;
  value: Verification;
  id: string;
}) {
  return (
    <select id={id} name={name} defaultValue={value} style={{ ...input, width: 190 }}>
      {STATUS_OPTIONS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** The Business Profile editor. Every field carries its own verification and source. */
export function ProfileEditor({
  id,
  fields,
  lists,
  notes,
}: {
  id: string;
  fields: FieldView[];
  lists: ListView[];
  notes: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("id", id);
          setResult(await saveProfileForm(fd));
        })
      }
    >
      <p
        style={{ margin: "0 0 14px", fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}
      >
        Only <strong style={{ color: C.green }}>Verified</strong> entries appear on the
        site as facts, and each needs a source (who checked it, and when). Unverified
        services, industries and process steps appear marked <em>Sample</em>; unverified
        experience, statistics, case studies and products never appear. Prices,
        guarantees, awards, credentials and testimonials are refused even when verified.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        {fields.map((f) => (
          <div
            key={f.key}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.3fr) 190px minmax(0,1fr)",
              gap: 8,
              alignItems: "end",
              borderLeft: `3px solid ${VERIFICATION_COLOUR[f.status]}`,
              paddingLeft: 10,
            }}
          >
            <div>
              <label style={label} htmlFor={`f-${f.key}`}>
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  id={`f-${f.key}`}
                  name={`f.${f.key}.value`}
                  defaultValue={f.value}
                  rows={3}
                  style={input}
                />
              ) : (
                <input
                  id={`f-${f.key}`}
                  name={`f.${f.key}.value`}
                  defaultValue={f.value}
                  style={input}
                />
              )}
            </div>
            <div>
              <label style={label} htmlFor={`s-${f.key}`}>
                Status
              </label>
              <StatusSelect
                id={`s-${f.key}`}
                name={`f.${f.key}.status`}
                value={f.status}
              />
            </div>
            <div>
              <label style={label} htmlFor={`src-${f.key}`}>
                Source
              </label>
              <input
                id={`src-${f.key}`}
                name={`f.${f.key}.source`}
                defaultValue={f.source}
                style={input}
              />
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 14, margin: "22px 0 8px" }}>Lists</h3>
      <div style={{ display: "grid", gap: 16 }}>
        {lists.map((l) => (
          <div
            key={l.key}
            style={{
              borderLeft: `3px solid ${VERIFICATION_COLOUR[l.status]}`,
              paddingLeft: 10,
            }}
          >
            <label style={label} htmlFor={`l-${l.key}`}>
              {l.label} — {l.hint}
            </label>
            <textarea
              id={`l-${l.key}`}
              name={`l.${l.key}.items`}
              defaultValue={l.text}
              rows={Math.min(10, Math.max(3, l.text.split("\n").length + 1))}
              style={{
                ...input,
                fontFamily: "ui-monospace, monospace",
                marginBottom: 6,
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 8 }}>
              <StatusSelect
                id={`ls-${l.key}`}
                name={`l.${l.key}.status`}
                value={l.status}
              />
              <input
                aria-label={`${l.label} source`}
                name={`l.${l.key}.source`}
                defaultValue={l.source}
                placeholder="Source"
                style={input}
              />
            </div>
          </div>
        ))}
      </div>
      <label style={{ ...label, marginTop: 18 }} htmlFor="internalNotes">
        Internal notes (never shown on the site)
      </label>
      <textarea
        id="internalNotes"
        name="internalNotes"
        defaultValue={notes}
        rows={5}
        style={{ ...input, marginBottom: 12 }}
      />
      <Status r={result} />
      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

/** Run the business's own presence assessment, optionally from a saved homepage. */
export function AssessProfileForm({
  id,
  hasWebsite,
}: {
  id: string;
  hasWebsite: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("id", id);
          setResult(await assessProfileForm(fd));
        })
      }
    >
      {hasWebsite ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          <label style={label} htmlFor="savedHomepage">
            Optional: a saved copy of the current homepage (.html). With one, the
            website is inspected from the copy and the live site is not contacted.
          </label>
          <input
            id="savedHomepage"
            name="savedHomepage"
            type="file"
            accept=".html,.htm,text/html"
            style={{ fontSize: 12.5, color: C.muted }}
          />
          <input
            name="savedSource"
            aria-label="Where the saved copy came from"
            placeholder="Where the copy came from, e.g. GitHub herman-supply-chain @ 0971d06"
            style={input}
          />
          <input
            name="savedAt"
            aria-label="Date the copy was saved"
            placeholder="Date saved (YYYY-MM-DD)"
            style={input}
          />
        </div>
      ) : (
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.muted }}>
          No verified website: the assessment records that the business has no website
          of its own.
        </p>
      )}
      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending ? "Assessing…" : "Run presence assessment"}
      </button>
      <Status r={result} linkText="Open the Lead Card →" />
    </form>
  );
}

export function BuildInternalDraftButton({
  id,
  hasDraft,
}: {
  id: string;
  hasDraft: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("id", id);
          const r = await buildProfileDraftForm(fd);
          setResult(r);
          if (r.ok && r.href && window.location.pathname !== r.href)
            window.location.assign(r.href);
        })
      }
    >
      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending
          ? "Building…"
          : hasDraft
            ? "Rebuild internal draft"
            : "Build internal website draft"}
      </button>
      <Status r={result} linkText="Open the draft →" />
    </form>
  );
}
