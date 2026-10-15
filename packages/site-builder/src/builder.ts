// Building, editing and approving demo drafts. One active draft per lead: a
// rebuild replaces it with the next version (no duplicate demos piling up).
// Every change is audited. Approval is internal quality control only -- it
// publishes nothing.

import type { Prospect } from "@hl-bos/presence-scanner";

import { launchChecklist } from "./checklist.ts";
import { writeCopy, type CopyWriter } from "./copy-claude.ts";
import { factsFromProspect } from "./facts.ts";
import type { Offering, SiteCopy, SiteDraft, SiteOptions } from "./types.ts";
import { validateCopy } from "./validate.ts";

export class DraftEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftEditError";
  }
}

const sampleCount = (c: SiteCopy) =>
  (c.aboutSample ? 1 : 0) + c.offerings.filter((o) => o.sample).length;

export async function buildDraft(
  prospect: Prospect,
  deps: {
    writer: CopyWriter | null;
    now: () => Date;
    newId: () => string;
    actor: string;
    previous: SiteDraft | undefined;
  },
): Promise<SiteDraft> {
  const started = deps.now();
  const t0 = performance.now();
  const facts = factsFromProspect(prospect);
  const { copy, source, notes } = await writeCopy(facts, deps.writer);
  const options: SiteOptions = deps.previous?.options ?? {
    showRating: facts.rating !== undefined,
    showVideoBlock: false,
  };
  const at = deps.now().toISOString();
  const version = (deps.previous?.version ?? 0) + 1;
  return {
    id: deps.previous?.id ?? deps.newId(),
    prospectId: prospect.id,
    version,
    vertical: facts.vertical,
    facts,
    copy,
    copySource: source,
    copyNotes: notes,
    options: {
      ...options,
      showRating: options.showRating && facts.rating !== undefined,
    },
    checklist: launchChecklist(facts, sampleCount(copy)),
    status: "draft",
    createdAt: deps.previous?.createdAt ?? started.toISOString(),
    updatedAt: at,
    buildMs: Math.round(performance.now() - t0),
    approved: undefined,
    audit: [
      ...(deps.previous?.audit ?? []),
      {
        at,
        by: deps.actor,
        action: deps.previous ? "rebuilt" : "built",
        detail: `Version ${version}: copy by ${source === "template" ? "the template writer" : source}${notes.length ? ` (${notes.join(" ")})` : ""}.`,
      },
    ],
  };
}

export interface CopyEdit {
  heroHeadline?: string;
  heroSubhead?: string;
  aboutBody?: string;
  /** One offering per line: "Name: description". Edited offerings are the owner's, not samples. */
  offerings?: string;
  showRating?: boolean;
  showVideoBlock?: boolean;
}

/** Parse "Name: description" lines into offerings written by a reviewer. */
export function parseOfferings(text: string): Offering[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i === -1
        ? { name: l, description: "", sample: false }
        : {
            name: l.slice(0, i).trim(),
            description: l.slice(i + 1).trim(),
            sample: false,
          };
    });
}

/**
 * A reviewer's edit. Edited text passes the same fabrication guard as Claude's;
 * text a reviewer writes stops being "sample". Editing an approved draft
 * returns it to draft.
 */
export function editDraft(
  d: SiteDraft,
  edit: CopyEdit,
  by: string,
  now: Date,
): SiteDraft {
  const copy: SiteCopy = { ...d.copy };
  const changed: string[] = [];
  if (
    edit.heroHeadline !== undefined &&
    edit.heroHeadline.trim() !== d.copy.heroHeadline
  ) {
    copy.heroHeadline = edit.heroHeadline.trim();
    changed.push("headline");
  }
  if (
    edit.heroSubhead !== undefined &&
    edit.heroSubhead.trim() !== d.copy.heroSubhead
  ) {
    copy.heroSubhead = edit.heroSubhead.trim();
    changed.push("subhead");
  }
  if (edit.aboutBody !== undefined && edit.aboutBody.trim() !== d.copy.aboutBody) {
    copy.aboutBody = edit.aboutBody.trim();
    copy.aboutSample = false;
    changed.push("about text");
  }
  if (edit.offerings !== undefined) {
    const next = parseOfferings(edit.offerings);
    const same =
      next.length === d.copy.offerings.length &&
      next.every(
        (o, i) =>
          o.name === d.copy.offerings[i]!.name &&
          o.description === d.copy.offerings[i]!.description,
      );
    if (!same) {
      copy.offerings = next.map((o) => ({
        ...o,
        description: o.description || o.name,
      }));
      changed.push("offerings");
    }
  }
  const options = { ...d.options };
  if (edit.showRating !== undefined && edit.showRating !== d.options.showRating) {
    if (edit.showRating && !d.facts.rating)
      throw new DraftEditError("There is no Google rating on file to show.");
    options.showRating = edit.showRating;
    changed.push(edit.showRating ? "rating shown" : "rating hidden");
  }
  if (
    edit.showVideoBlock !== undefined &&
    edit.showVideoBlock !== d.options.showVideoBlock
  ) {
    options.showVideoBlock = edit.showVideoBlock;
    changed.push(edit.showVideoBlock ? "video block shown" : "video block hidden");
  }
  if (!changed.length) return d;
  const problems = validateCopy(copy, d.facts);
  if (problems.length) throw new DraftEditError(problems.slice(0, 4).join(" "));
  const at = now.toISOString();
  return {
    ...d,
    copy,
    options,
    checklist: launchChecklist(d.facts, sampleCount(copy)),
    status: "draft",
    approved: undefined,
    updatedAt: at,
    audit: [
      ...d.audit,
      {
        at,
        by,
        action: "edited",
        detail: `Changed: ${changed.join(", ")}.${d.status === "approved" ? " Approval withdrawn." : ""}`,
      },
    ],
  };
}

/** Internal quality approval: "this demo is fit to show the owner". Publishes nothing. */
export function approveDraft(d: SiteDraft, by: string, now: Date): SiteDraft {
  if (d.status === "approved") return d;
  const at = now.toISOString();
  return {
    ...d,
    status: "approved",
    approved: { by, at },
    audit: [
      ...d.audit,
      {
        at,
        by,
        action: "approved",
        detail: "Approved as fit to show the business owner. Nothing was published.",
      },
    ],
  };
}
