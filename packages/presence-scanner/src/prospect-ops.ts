// Reviewer actions on a lead. Every one appends to the lead's audit trail;
// nothing a reviewer does overwrites evidence silently.

import { formatPhone, normalizePhone, toUrl } from "./normalize.ts";
import type { Prospect, QualificationStatus } from "./types.ts";

export class ReviewerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerInputError";
  }
}

const MAX_NOTE = 2000;

export function addNote(p: Prospect, text: string, by: string, now: Date): Prospect {
  const t = text.trim();
  if (t === "") throw new ReviewerInputError("The note is empty.");
  if (t.length > MAX_NOTE)
    throw new ReviewerInputError(`Notes are limited to ${MAX_NOTE} characters.`);
  const at = now.toISOString();
  return {
    ...p,
    notes: [...p.notes, { at, by, text: t }],
    audit: [
      ...p.audit,
      { at, by, action: "note", detail: t.length > 80 ? `${t.slice(0, 79)}…` : t },
    ],
  };
}

export function overrideQualification(
  p: Prospect,
  status: QualificationStatus,
  note: string,
  by: string,
  now: Date,
): Prospect {
  const reason = note.trim();
  if (reason === "")
    throw new ReviewerInputError("Say why you are overriding the automatic result.");
  const at = now.toISOString();
  return {
    ...p,
    qualification: { ...p.qualification, override: { status, by, at, note: reason } },
    audit: [
      ...p.audit,
      {
        at,
        by,
        action: "qualification_override",
        detail: `${p.qualification.override?.status ?? p.qualification.computed} → ${status}: ${reason}`,
      },
    ],
  };
}

export function clearQualificationOverride(
  p: Prospect,
  by: string,
  now: Date,
): Prospect {
  if (!p.qualification.override) return p;
  const at = now.toISOString();
  return {
    ...p,
    qualification: { ...p.qualification, override: undefined },
    audit: [
      ...p.audit,
      {
        at,
        by,
        action: "qualification_override_cleared",
        detail: `Back to the automatic result: ${p.qualification.computed}.`,
      },
    ],
  };
}

export type CorrectableField = "website" | "phone" | "email";

/**
 * Record a reviewer's correction. It wins over Google and the import from now
 * on. Returns whether the lead must be re-inspected (a website change does).
 * Use "none" as the website to record that the business has no website.
 */
export function correctField(
  p: Prospect,
  field: CorrectableField,
  value: string,
  by: string,
  now: Date,
): { prospect: Prospect; needsRescan: boolean } {
  const v = value.trim();
  let clean: string;
  if (field === "website") {
    if (/^none$/i.test(v)) clean = "none";
    else {
      const u = toUrl(v);
      if (!u)
        throw new ReviewerInputError(
          `"${v}" is not a web address. Use "none" if the business has no website.`,
        );
      clean = u;
    }
  } else if (field === "phone") {
    const d = normalizePhone(v);
    if (!d) throw new ReviewerInputError(`"${v}" is not a phone number.`);
    clean = formatPhone(d) ?? d;
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v))
      throw new ReviewerInputError(`"${v}" is not an email address.`);
    clean = v.toLowerCase();
  }
  const before = p.corrections[field] ?? p[field] ?? "(none)";
  const at = now.toISOString();
  const updated: Prospect = {
    ...p,
    corrections: { ...p.corrections, [field]: clean },
    ...(field === "website" ? {} : { [field]: clean }),
    audit: [
      ...p.audit,
      { at, by, action: "correction", detail: `${field}: ${before} → ${clean}` },
    ],
  };
  return { prospect: updated, needsRescan: field === "website" || field === "phone" };
}
