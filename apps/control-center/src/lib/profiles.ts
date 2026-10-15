// Business Profiles in the console: seeding HLG's own companies, saving the
// editor form, running a business's own presence assessment, and building its
// internal website draft. Everything is injected (repositories, egress, clock),
// so all of it is tested directly (profiles.test.ts). The server actions in
// src/actions/profiles.ts are thin wrappers. Nothing here publishes anything,
// sends anything or contacts anyone.

import {
  addNote,
  markProspectsSavedCopy,
  runMarketScan,
  savedPageEgress,
  type PresenceRepository,
  type SavedPage,
  type WebEgress,
} from "@hl-bos/presence-scanner";
import {
  buildInternalDraft,
  hlgInternalProfiles,
  InternalDraftError,
  PROFILE_FIELDS,
  PROFILE_LISTS,
  profileBuildProblems,
  validateProfile,
  verified,
  type BusinessProfile,
  type BusinessProfileRepository,
  type ProfileFieldKey,
  type ProfileItem,
  type ProfileListKey,
  type SiteDraftRepository,
  type ToolItem,
  type Verification,
} from "@hl-bos/site-builder";

import type { PresenceResult } from "./presence";

export interface ProfileDeps {
  profiles: BusinessProfileRepository;
  leads: PresenceRepository;
  drafts: SiteDraftRepository;
  /** The real network adapter; a saved homepage copy replaces it for one assessment. */
  egress: WebEgress;
  now: () => Date;
  newId: () => string;
  actor: string;
}

/** The draft key for a profile: its lead, or the profile itself before any assessment. */
export const draftKey = (p: BusinessProfile) => p.prospectId ?? `profile:${p.id}`;

/** Create the HLG company profiles that do not exist yet. Never overwrites. */
export async function seedInternalProfiles(deps: ProfileDeps): Promise<PresenceResult> {
  const have = new Set((await deps.profiles.list()).map((p) => p.id));
  const added: string[] = [];
  for (const p of hlgInternalProfiles(deps.now())) {
    if (have.has(p.id)) continue;
    p.audit.push({
      at: deps.now().toISOString(),
      by: deps.actor,
      detail: "Created from approved facts (each field lists its source).",
    });
    await deps.profiles.save(p);
    added.push(verified(p, "brandName") ?? p.id);
  }
  return added.length
    ? {
        ok: true,
        headline: `Created: ${added.join(" and ")}.`,
        meaning: "Each field shows whether it is verified and where it came from.",
      }
    : { ok: true, headline: "Already created.", meaning: "Nothing was overwritten." };
}

const STATUSES: Verification[] = ["verified", "unverified", "required"];

/**
 * "Name: description" per line. Products may end with " [planned]" (or
 * live, in_development, in_use). Social links are "Label: https://...".
 */
export function parseItems(text: string, k: ProfileListKey): ProfileItem[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      let status: ToolItem["status"] | undefined;
      const m = l.match(/\s*\[(live|in_development|planned|in_use)\]\s*$/);
      if (m && k === "products") {
        status = m[1] as ToolItem["status"];
        l = l.slice(0, m.index).trim();
      }
      const i = l.indexOf(": ");
      const name = (i === -1 ? l : l.slice(0, i)).trim();
      const description = i === -1 ? "" : l.slice(i + 2).trim();
      return { name, description, ...(status ? { status } : {}) };
    });
}

export function itemsToText(items: ProfileItem[]): string {
  return items
    .map(
      (i) =>
        `${i.name}${i.description ? `: ${i.description}` : ""}${i.status ? ` [${i.status}]` : ""}`,
    )
    .join("\n");
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};
const status = (v: string | undefined): Verification | undefined =>
  STATUSES.includes(v as Verification) ? (v as Verification) : undefined;

/** The editor form applied to a profile. Only fields present in the form change. */
export function profileFromForm(
  p: BusinessProfile,
  fd: FormData,
): { profile: BusinessProfile; changed: string[] } {
  const next = structuredClone(p);
  const changed: string[] = [];
  for (const k of Object.keys(PROFILE_FIELDS) as ProfileFieldKey[]) {
    const value = str(fd, `f.${k}.value`);
    const st = status(str(fd, `f.${k}.status`));
    const source = str(fd, `f.${k}.source`);
    if (value === undefined && st === undefined && source === undefined) continue;
    const cur = next.fields[k];
    const upd = {
      value: value?.trim() ?? cur.value,
      status: st ?? cur.status,
      source: source?.trim() ?? cur.source,
    };
    if (
      upd.value !== cur.value ||
      upd.status !== cur.status ||
      upd.source !== cur.source
    ) {
      next.fields[k] = upd;
      changed.push(PROFILE_FIELDS[k]);
    }
  }
  for (const k of Object.keys(PROFILE_LISTS) as ProfileListKey[]) {
    const text = str(fd, `l.${k}.items`);
    const st = status(str(fd, `l.${k}.status`));
    const source = str(fd, `l.${k}.source`);
    if (text === undefined && st === undefined && source === undefined) continue;
    const cur = next.lists[k];
    const items = text === undefined ? cur.items : parseItems(text, k);
    const upd = {
      items,
      status: st ?? cur.status,
      source: source?.trim() ?? cur.source,
    };
    if (JSON.stringify(upd) !== JSON.stringify(cur)) {
      next.lists[k] = upd;
      changed.push(PROFILE_LISTS[k]);
    }
  }
  const notes = str(fd, "internalNotes");
  if (notes !== undefined && notes.trim() !== next.internalNotes) {
    next.internalNotes = notes.trim();
    changed.push("Internal notes");
  }
  return { profile: next, changed };
}

/** Save the editor form. Refused, with reasons, if the profile fails its checks. */
export async function saveProfile(
  id: string,
  fd: FormData,
  deps: ProfileDeps,
): Promise<PresenceResult> {
  const p = await deps.profiles.get(id);
  if (!p)
    return { ok: false, headline: "Profile not found.", meaning: "Reload the page." };
  const { profile, changed } = profileFromForm(p, fd);
  if (!changed.length)
    return {
      ok: true,
      headline: "Nothing changed.",
      meaning: "The profile is as it was.",
    };
  const problems = [
    ...validateProfile(profile),
    ...(verified(profile, "brandName") ? profileBuildProblems(profile) : []),
  ];
  if (problems.length)
    return {
      ok: false,
      headline: "Not saved.",
      meaning: [...new Set(problems)].slice(0, 6).join(" "),
    };
  const at = deps.now().toISOString();
  profile.updatedAt = at;
  profile.audit.push({ at, by: deps.actor, detail: `Changed: ${changed.join(", ")}.` });
  await deps.profiles.save(profile);
  return {
    ok: true,
    headline: "Saved.",
    meaning: "Rebuild the internal draft to see the change on the page.",
  };
}

/** The pasted-list line for a profile's own assessment: name | website | phone. */
export function assessmentLine(p: BusinessProfile): string {
  const name = verified(p, "brandName") ?? p.fields.brandName.value;
  return [name, verified(p, "website") ?? "none", verified(p, "phone") ?? ""]
    .map((s) => s.replace(/\|/g, " "))
    .join(" | ");
}

/**
 * Run the business's own presence assessment through the Presence Scanner, in
 * pasted-list mode. With a saved homepage copy, the website is inspected from
 * that copy (labelled as such on every finding) instead of the network.
 */
export async function assessProfile(
  id: string,
  saved: SavedPage | undefined,
  deps: ProfileDeps,
): Promise<PresenceResult> {
  const p = await deps.profiles.get(id);
  if (!p)
    return { ok: false, headline: "Profile not found.", meaning: "Reload the page." };
  if (!verified(p, "brandName"))
    return {
      ok: false,
      headline: "Not assessed.",
      meaning: "Enter and verify the brand name first.",
    };
  const site = verified(p, "website");
  if (saved && !site)
    return {
      ok: false,
      headline: "Not assessed.",
      meaning:
        "A saved homepage needs the business's existing website address, verified.",
    };
  const page: SavedPage | undefined =
    saved && site ? { ...saved, url: site } : undefined;
  const { run, prospects } = await runMarketScan(
    {
      market: verified(p, "serviceArea") ?? "Western New York",
      zip: undefined,
      radiusMiles: 25,
      vertical: p.vertical,
      maxResults: 1,
      searchTerms: undefined,
      source: "import",
      importText: assessmentLine(p),
    },
    {
      places: null,
      egress: page ? savedPageEgress(page) : deps.egress,
      now: deps.now,
      newId: deps.newId,
      existing: await deps.leads.listProspects(),
      actor: deps.actor,
    },
  );
  if (run.error || !prospects[0])
    return {
      ok: false,
      headline: "The assessment could not run.",
      meaning: run.error ?? "",
    };
  let lead = page ? markProspectsSavedCopy(prospects, page)[0]! : prospects[0];
  if (!lead.notes.some((n) => n.text.startsWith("HLG-owned business")))
    lead = addNote(
      lead,
      `HLG-owned business: internal Business Profile "${verified(p, "brandName")}". Not a sales lead; never contacted.`,
      deps.actor,
      deps.now(),
    );
  if (page) run.warnings.push(`Website inspected from a saved copy: ${page.source}.`);
  await deps.leads.saveProspects([lead]);
  await deps.leads.saveScan(run);
  if (p.prospectId !== lead.id) {
    p.prospectId = lead.id;
    p.audit.push({
      at: deps.now().toISOString(),
      by: deps.actor,
      detail: `Linked to its presence assessment (lead ${lead.id}).`,
    });
    // A draft built before the first assessment moves to the lead's key.
    const early = await deps.drafts.getByProspect(`profile:${p.id}`);
    if (early) await deps.drafts.save({ ...early, prospectId: lead.id });
    await deps.profiles.save(p);
  }
  return {
    ok: true,
    headline: `Assessment finished: score ${lead.score.total} (${lead.score.version}).`,
    meaning: page
      ? `The website was inspected from a saved copy (${page.source}); the live site was not contacted.`
      : lead.websiteStatus === "not_checked"
        ? "This computer is offline, so the website was not checked."
        : "Scored from the business's own details.",
    href: `/presence/${lead.id}`,
  };
}

/** Build (or rebuild) the internal website draft from the profile. */
export async function buildProfileDraft(
  id: string,
  deps: ProfileDeps,
): Promise<PresenceResult> {
  const p = await deps.profiles.get(id);
  if (!p)
    return { ok: false, headline: "Profile not found.", meaning: "Reload the page." };
  const lead = p.prospectId ? await deps.leads.getProspect(p.prospectId) : undefined;
  const previous = await deps.drafts.getByProspect(draftKey(p));
  try {
    const draft = buildInternalDraft(p, lead, {
      now: deps.now,
      newId: deps.newId,
      actor: deps.actor,
      previous,
    });
    await deps.drafts.save(draft);
    return {
      ok: true,
      headline: `Internal draft ${previous ? "rebuilt" : "built"}: version ${draft.version}.`,
      meaning: `${draft.infoRequired?.length ? `${draft.infoRequired.length} item(s) still need information. ` : ""}It is private to this computer; nothing was published.`,
      href: `/profiles/${p.id}/draft`,
    };
  } catch (e) {
    if (e instanceof InternalDraftError)
      return { ok: false, headline: "Not built.", meaning: e.message };
    throw e;
  }
}
