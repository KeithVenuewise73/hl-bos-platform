// The Instant Site Builder's console logic: build, edit and approve a demo for
// one lead. Everything is injected (both repositories, the copy writer, the
// clock), so all of it is tested directly (demo.test.ts). The server actions in
// src/actions/demo.ts are thin wrappers. Nothing here publishes anything.

import {
  canTransition,
  transitionStage,
  type PresenceRepository,
} from "@hl-bos/presence-scanner";
import {
  approveDraft,
  buildDraft,
  DraftEditError,
  editDraft,
  isSiteVertical,
  type CopyEdit,
  type CopyWriter,
  type SiteDraftRepository,
} from "@hl-bos/site-builder";

import type { PresenceResult } from "./presence";

export interface DemoDeps {
  leads: PresenceRepository;
  drafts: SiteDraftRepository;
  writer: CopyWriter | null;
  now: () => Date;
  newId: () => string;
  actor: string;
}

export async function buildDemo(
  prospectId: string,
  deps: DemoDeps,
): Promise<PresenceResult> {
  const lead = await deps.leads.getProspect(prospectId);
  if (!lead)
    return {
      ok: false,
      headline: "That lead was not found.",
      meaning: "Reload the Lead Board.",
    };
  if (!isSiteVertical(lead.vertical))
    return {
      ok: false,
      headline: "No demo template for this vertical yet.",
      meaning:
        "Demo sites are built for contractors, salons/barbers and restaurants/bars so far.",
    };
  const previous = await deps.drafts.getByProspect(prospectId);
  const draft = await buildDraft(lead, {
    writer: deps.writer,
    now: deps.now,
    newId: deps.newId,
    actor: deps.actor,
    previous,
  });
  await deps.drafts.save(draft);

  // Record it on the lead: "Demo built", when the pipeline allows that move.
  let staged = "";
  if (lead.stage !== "demo_built" && canTransition(lead.stage, "demo_built")) {
    await deps.leads.saveProspects([
      transitionStage(
        lead,
        "demo_built",
        deps.actor,
        `Demo site version ${draft.version} built`,
        deps.now(),
      ),
    ]);
    staged = " The lead moved to Demo built.";
  }
  const seconds = (draft.buildMs / 1000).toFixed(1);
  return {
    ok: true,
    headline: `Demo ${previous ? "rebuilt" : "built"}: version ${draft.version}, in ${seconds} seconds.`,
    meaning:
      `Copy by ${draft.copySource === "template" ? "the template writer" : "Claude"}.` +
      (draft.copyNotes.length ? ` ${draft.copyNotes.join(" ")}` : "") +
      staged +
      " It is a private preview on this computer; nothing was published.",
    href: `/presence/${prospectId}/demo`,
  };
}

export async function editDemo(
  prospectId: string,
  edit: CopyEdit,
  deps: DemoDeps,
): Promise<PresenceResult> {
  const d = await deps.drafts.getByProspect(prospectId);
  if (!d)
    return { ok: false, headline: "No demo yet.", meaning: "Build the demo first." };
  try {
    const next = editDraft(d, edit, deps.actor, deps.now());
    if (next === d)
      return {
        ok: true,
        headline: "Nothing changed.",
        meaning: "The demo is as it was.",
      };
    await deps.drafts.save(next);
    return {
      ok: true,
      headline: "Saved.",
      meaning:
        d.status === "approved"
          ? "The demo changed, so it needs approving again."
          : "The preview shows the change.",
    };
  } catch (e) {
    if (e instanceof DraftEditError)
      return { ok: false, headline: "Not saved.", meaning: e.message };
    throw e;
  }
}

export async function approveDemo(
  prospectId: string,
  deps: DemoDeps,
): Promise<PresenceResult> {
  const d = await deps.drafts.getByProspect(prospectId);
  if (!d)
    return { ok: false, headline: "No demo yet.", meaning: "Build the demo first." };
  await deps.drafts.save(approveDraft(d, deps.actor, deps.now()));
  return {
    ok: true,
    headline: "Approved as fit to show the owner.",
    meaning: "This is internal sign-off only. Nothing was published or sent.",
  };
}

/** The edit form -> a CopyEdit. Only fields present in the form are changed. */
export function editFromForm(fd: FormData): CopyEdit {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const edit: CopyEdit = {};
  const headline = s("heroHeadline");
  const subhead = s("heroSubhead");
  const about = s("aboutBody");
  const offerings = s("offerings");
  if (headline !== undefined) edit.heroHeadline = headline;
  if (subhead !== undefined) edit.heroSubhead = subhead;
  if (about !== undefined) edit.aboutBody = about;
  if (offerings !== undefined) edit.offerings = offerings;
  // Checkboxes: present = on. A hidden "options" marker says the form carried them.
  if (s("options") !== undefined) {
    edit.showRating = s("showRating") !== undefined;
    edit.showVideoBlock = s("showVideoBlock") !== undefined;
  }
  return edit;
}

/** Headers for serving a demo preview inside the console. */
export const PREVIEW_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  // No scripts may run; only the console itself may frame it; fonts from Google Fonts only.
  "content-security-policy":
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
};
