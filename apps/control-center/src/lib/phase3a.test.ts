import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryRepository, type WebEgress } from "@hl-bos/presence-scanner";
import {
  HLG_BT_ID,
  HSCS_ID,
  MemoryDraftRepository,
  MemoryProfileRepository,
  renderSite,
  type SiteDraftRepository,
} from "@hl-bos/site-builder";

import {
  BATCH_STATUS_LABELS,
  buildBatchItem,
  MAX_BATCH,
  planBatch,
  runBatch,
  type BatchStatus,
} from "./batch";
import type { DemoDeps } from "./demo";
import { startScan, type PresenceDeps } from "./presence";
import {
  assessmentLine,
  assessProfile,
  buildProfileDraft,
  draftKey,
  itemsToText,
  parseItems,
  profileFromForm,
  saveProfile,
  seedInternalProfiles,
  type ProfileDeps,
} from "./profiles";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-15T12:00:00Z");
const offline: WebEgress = {
  online: () => Promise.resolve(false),
  resolve: () => Promise.reject(new Error("offline")),
  fetchPage: () => Promise.reject(new Error("offline")),
  fetchRobots: () => Promise.resolve(undefined),
};

let n = 0;
function world() {
  const leads = new MemoryRepository(() => NOW);
  const drafts = new MemoryDraftRepository();
  const profiles = new MemoryProfileRepository();
  const pd: ProfileDeps = {
    profiles,
    leads,
    drafts,
    egress: offline,
    now: () => NOW,
    newId: () => `id-${++n}`,
    actor: "ceo",
  };
  const dd: DemoDeps = {
    leads,
    drafts,
    writer: null,
    now: () => NOW,
    newId: () => `draft-${++n}`,
    actor: "ceo",
  };
  return { leads, drafts, profiles, pd, dd };
}

async function importLeads(
  leads: MemoryRepository,
  lines: string,
  vertical = "contractor",
) {
  const p: PresenceDeps = {
    repo: leads,
    places: null,
    egress: offline,
    now: () => NOW,
    newId: () => `lead-${++n}`,
    actor: "operator",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    source: "import",
    market: "West Seneca",
    zip: "14224",
    radius: "10",
    vertical,
    maxResults: "20",
    importText: lines,
  }))
    fd.set(k, v);
  await startScan(fd, p);
  return leads.listProspects();
}

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

describe("Business Profiles in the console", () => {
  it("seeds HLG's two companies once, never overwriting", async () => {
    const { pd, profiles } = world();
    const r = await seedInternalProfiles(pd);
    expect(r.headline).toBe(
      "Created: HLG Business Transformation and Herman Supply Chain Solutions.",
    );
    const bt = (await profiles.get(HLG_BT_ID))!;
    bt.internalNotes = "edited";
    await profiles.save(bt);
    expect((await seedInternalProfiles(pd)).headline).toBe("Already created.");
    expect((await profiles.get(HLG_BT_ID))!.internalNotes).toBe("edited");
  });

  it("saves verified facts with a source; refuses unverifiable or invalid ones", async () => {
    const { pd, profiles } = world();
    await seedInternalProfiles(pd);
    const ok = await saveProfile(
      HSCS_ID,
      form({
        "f.email.value": "hello@hscs.example",
        "f.email.status": "verified",
        "f.email.source": "CEO, 2026-10-15",
      }),
      pd,
    );
    expect(ok.headline).toBe("Saved.");
    const p = (await profiles.get(HSCS_ID))!;
    expect(p.fields.email.status).toBe("verified");
    expect(p.audit.at(-1)!.detail).toBe("Changed: Business email.");

    const bad = await saveProfile(
      HSCS_ID,
      form({
        "f.phone.value": "1-800-555-1234",
        "f.phone.status": "verified",
        "f.phone.source": "old site",
      }),
      pd,
    );
    expect(bad.ok).toBe(false);
    expect(bad.meaning).toContain("reserved for examples");
    const noSource = await saveProfile(
      HSCS_ID,
      form({
        "f.legalName.value": "HSCS LLC",
        "f.legalName.status": "verified",
        "f.legalName.source": "",
      }),
      pd,
    );
    expect(noSource.meaning).toContain("say who verified it");
    expect((await profiles.get(HSCS_ID))!.fields.phone.value).toBe("");
  });

  it("parses list lines, including product status and links", () => {
    const items = parseItems(
      "TakeoutOS: Ordering for takeout restaurants [planned]\nPresence Scanner: Finds gaps [in_development]",
      "products",
    );
    expect(items).toEqual([
      {
        name: "TakeoutOS",
        description: "Ordering for takeout restaurants",
        status: "planned",
      },
      { name: "Presence Scanner", description: "Finds gaps", status: "in_development" },
    ]);
    expect(
      parseItems("LinkedIn: https://www.linkedin.com/company/x", "socialLinks")[0],
    ).toEqual({
      name: "LinkedIn",
      description: "https://www.linkedin.com/company/x",
    });
    expect(parseItems(itemsToText(items), "products")).toEqual(items);
  });

  it("re-submitting the whole editor unchanged changes nothing (CRLF, key order)", async () => {
    const { pd, profiles } = world();
    await seedInternalProfiles(pd);
    const { PROFILE_FIELDS, PROFILE_LISTS } = await import("@hl-bos/site-builder");
    for (const id of [HLG_BT_ID, HSCS_ID]) {
      const p = (await profiles.get(id))!;
      const fd = new FormData();
      for (const k of Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[]) {
        fd.set(`f.${k}.value`, p.fields[k].value);
        fd.set(`f.${k}.status`, p.fields[k].status);
        fd.set(`f.${k}.source`, p.fields[k].source);
      }
      for (const k of Object.keys(PROFILE_LISTS) as (keyof typeof PROFILE_LISTS)[]) {
        // As a browser sends a textarea: CRLF line breaks.
        fd.set(`l.${k}.items`, itemsToText(p.lists[k].items).replace(/\n/g, "\r\n"));
        fd.set(`l.${k}.status`, p.lists[k].status);
        fd.set(`l.${k}.source`, p.lists[k].source);
      }
      fd.set("internalNotes", p.internalNotes.replace(/\n/g, "\r\n"));
      expect(profileFromForm(p, fd).changed).toEqual([]);
      fd.set("l.industries.items", "Regional fleets: Local and regional operations.");
      expect(profileFromForm(p, fd).changed).toEqual(["Industries served"]);
    }
  });

  it("an unchanged form changes nothing", async () => {
    const { pd, profiles } = world();
    await seedInternalProfiles(pd);
    const p = (await profiles.get(HLG_BT_ID))!;
    expect(
      profileFromForm(p, form({ "f.phone.value": p.fields.phone.value })).changed,
    ).toEqual([]);
  });
});

describe("internal presence assessment and draft", () => {
  it("HLG Business Transformation: pasted-list assessment, lead card, draft, approval", async () => {
    const { pd, dd, profiles, leads, drafts } = world();
    await seedInternalProfiles(pd);
    expect(assessmentLine((await profiles.get(HLG_BT_ID))!)).toBe(
      "HLG Business Transformation | none | 716-220-7354",
    );
    const a = await assessProfile(HLG_BT_ID, undefined, pd);
    expect(a.ok).toBe(true);
    expect(a.headline).toMatch(
      /^Assessment finished: score \d+ \(presence-opportunity-0\.2\.0\)\.$/,
    );
    const p = (await profiles.get(HLG_BT_ID))!;
    const lead = (await leads.getProspect(p.prospectId!))!;
    expect(lead.vertical).toBe("professional_services");
    expect(lead.websiteStatus).toBe("none");
    expect(lead.notes[0]!.text).toContain("HLG-owned business");
    expect(a.href).toBe(`/presence/${lead.id}`);

    const b = await buildProfileDraft(HLG_BT_ID, pd);
    expect(b.headline).toBe("Internal draft built: version 1.");
    expect(b.meaning).toContain("nothing was published");
    expect(b.href).toBe(`/profiles/${HLG_BT_ID}/draft`);
    const d = (await drafts.getByProspect(draftKey(p)))!;
    expect(d.mode).toBe("internal_draft");
    expect(d.facts.gaps).toContain("website.exists");
    // The lead's stage is not touched by an internal draft.
    expect((await leads.getProspect(lead.id))!.stage).toBe(lead.stage);

    // Edit and approve through the same buttons as any draft.
    const { approveDemo, editDemo } = await import("./demo");
    const e = await editDemo(
      d.prospectId,
      { heroHeadline: "Practical business systems for local businesses" },
      dd,
    );
    expect(e.headline).toBe("Saved.");
    const ap = await approveDemo(d.prospectId, dd);
    expect(ap.meaning).toContain("Nothing was published");
    expect((await drafts.getByProspect(d.prospectId))!.status).toBe("approved");
    expect((await buildProfileDraft(HLG_BT_ID, pd)).headline).toBe(
      "Internal draft rebuilt: version 2.",
    );
    // A prospect-demo build can never overwrite it.
    const { buildDemo } = await import("./demo");
    const clash = await buildDemo(lead.id, dd);
    expect(clash.headline).toBe("This lead has an internal draft.");
    expect((await drafts.getByProspect(lead.id))!.mode).toBe("internal_draft");
  });

  it("HSCS: assessed from a saved homepage copy, every finding labelled, claims flagged", async () => {
    const { pd, profiles, leads, drafts } = world();
    await seedInternalProfiles(pd);
    const html = `<!doctype html><html><head><title>Herman Supply Chain Solutions | Logistics Consulting</title></head><body>
<a href="/assessment.html">Start Free Operational Assessment</a><h2>Live Performance Benchmarks</h2><p>$2.4M+ Average Annual Savings Identified. 98.2% Client Retention Rate.</p>
<h2>What Our Clients Say</h2><p>Phone 1-800-555-1234</p></body></html>`;
    const a = await assessProfile(
      HSCS_ID,
      {
        url: "ignored",
        html,
        source: "GitHub herman-supply-chain @ 0971d06",
        savedAt: "2026-06-18",
      },
      pd,
    );
    expect(a.meaning).toContain("inspected from a saved copy");
    const p = (await profiles.get(HSCS_ID))!;
    const lead = (await leads.getProspect(p.prospectId!))!;
    expect(lead.websiteStatus).toBe("ok");
    const site = lead.findings.filter((f) => f.source === "website");
    expect(
      site.every((f) =>
        f.evidence.includes("Saved copy of https://www.hermansupplychainsolutions.com"),
      ),
    ).toBe(true);
    const st = (k: string) => lead.findings.find((f) => f.key === k)?.status;
    expect(st("site.claims")).toBe("needs_verification");
    expect(st("site.testimonials")).toBe("needs_verification");
    expect(st("site.placeholder_contact")).toBe("needs_verification");
    expect((await leads.listScans())[0]!.warnings.join(" ")).toContain("saved copy");

    await buildProfileDraft(HSCS_ID, pd);
    const d = (await drafts.getByProspect(lead.id))!;
    expect(d.checklist.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        "audit-site.claims",
        "audit-site.testimonials",
        "audit-site.placeholder_contact",
      ]),
    );
    const page = renderSite(d);
    expect(page).toContain("Internal draft — not published.");
    expect(page.slice(page.indexOf("<body>"))).not.toMatch(/2\.4M|98\.2|555-1234/);
  });

  it("a draft built before any assessment follows the profile to its lead", async () => {
    const { pd, profiles, drafts } = world();
    await seedInternalProfiles(pd);
    await buildProfileDraft(HSCS_ID, pd);
    expect(await drafts.getByProspect(`profile:${HSCS_ID}`)).toBeDefined();
    await assessProfile(HSCS_ID, undefined, pd);
    const p = (await profiles.get(HSCS_ID))!;
    expect((await drafts.getByProspect(p.prospectId!))!.version).toBe(1);
  });

  it("explains what stops an assessment or a build", async () => {
    const { pd, profiles } = world();
    await seedInternalProfiles(pd);
    const bt = (await profiles.get(HLG_BT_ID))!;
    const r = await assessProfile(
      HLG_BT_ID,
      { url: "", html: "<p>x</p>", source: "x", savedAt: "2026-10-15" },
      pd,
    );
    expect(r.meaning).toContain("existing website address, verified");
    bt.fields.brandName.status = "unverified";
    await profiles.save(bt);
    expect((await buildProfileDraft(HLG_BT_ID, pd)).meaning).toContain("brand name");
    expect((await assessProfile("nope", undefined, pd)).headline).toBe(
      "Profile not found.",
    );
  });
});

describe("controlled batch building", () => {
  const LINES = [
    "Seneca Paving | none | 716-555-0103",
    "Union Roofing | none | 716-555-0104",
    "Aurora Plumbing | none | 716-555-0105",
    "Lake Electric | none | 716-555-0106",
  ].join("\n");

  it("the Lead Board's selection limit is the batch limit", async () => {
    const { BATCH_LIMIT } = await import("./lead-board");
    expect(BATCH_LIMIT).toBe(MAX_BATCH);
    expect(MAX_BATCH).toBe(10);
  });

  it("marks which Lead Board rows can join a batch, and why not", async () => {
    const { toLeadRow } = await import("./presence");
    const { leads, pd } = world();
    const [lead] = await importLeads(leads, "Seneca Paving | none | 716-555-0103");
    expect(toLeadRow(lead!).batchable).toBe(true);
    const coach = (
      await importLeads(leads, "Coach Kim | none | 716-555-0111", "trainer_coach")
    ).find((p) => p.name === "Coach Kim");
    expect(toLeadRow(coach!).batchNote).toBe("No demo template for this vertical yet");
    await seedInternalProfiles(pd);
    await assessProfile(HLG_BT_ID, undefined, pd);
    const own = (await leads.listProspects()).find(
      (p) => p.name === "HLG Business Transformation",
    )!;
    expect(toLeadRow(own).batchNote).toBe("HLG-owned: built from its Business Profile");
  });

  it("refuses more than 10 leads, and an empty selection", () => {
    const ids = Array.from({ length: MAX_BATCH + 1 }, (_, i) => `l${i}`);
    expect(planBatch(ids, []).error).toBe(
      "11 leads were selected; a batch builds at most 10. Select fewer and try again.",
    );
    expect(planBatch(ids.slice(0, 10), []).error).toBeUndefined();
    expect(planBatch([], []).error).toBe("No leads were selected.");
  });

  it("builds only qualified leads with a template; explains the rest", async () => {
    const { leads } = world();
    const all = [
      ...(await importLeads(leads, LINES)),
      ...(await importLeads(leads, "Coach Kim | none | 716-555-0111", "trainer_coach")),
    ];
    const coach = all.find((p) => p.vertical === "trainer_coach")!;
    const [first, second] = all.filter((p) => p.vertical === "contractor");
    await leads.saveProspects([
      {
        ...second!,
        qualification: {
          ...second!.qualification,
          override: { status: "excluded", by: "op", at: NOW.toISOString(), note: "x" },
        },
      },
    ]);
    const plan = planBatch(
      [first!.id, second!.id, coach.id, "missing"],
      await leads.listProspects(),
    );
    expect(plan.build.map((b) => b.id)).toEqual([first!.id]);
    expect(plan.excluded.map((e) => e.reason)).toEqual([
      "Not qualified.",
      "No demo template for this vertical yet.",
      "Lead not found.",
    ]);
  });

  it("builds each lead on its own: one failure does not stop the batch", async () => {
    const { leads, dd, drafts } = world();
    const all = await importLeads(leads, LINES);
    const bad = all[1]!.id;
    const flaky: SiteDraftRepository = {
      getByProspect: (id) => drafts.getByProspect(id),
      get: (id) => drafts.get(id),
      list: () => drafts.list(),
      save: (d) =>
        d.prospectId === bad ? Promise.reject(new Error("disk full")) : drafts.save(d),
    };
    const seen: [string, BatchStatus][] = [];
    const run = await runBatch(
      all.map((p) => p.id),
      { ...dd, drafts: flaky },
      (id, s) => seen.push([id, s]),
    );
    if ("error" in run) throw new Error(run.error);
    expect(run.items.map((i) => i.status)).toEqual([
      "completed",
      "failed",
      "completed",
      "completed",
    ]);
    expect(run.items[1]!.message).toBe("Not built: disk full");
    expect(run.summary).toMatch(
      /^3 built, 0 need information, 1 failed \(total build time (under 0\.1|\d+\.\d) seconds\)\. Template copy only\. Nothing was published or sent\.$/,
    );
    for (const i of run.items.filter((x) => x.status === "completed")) {
      expect(i.version).toBe(1);
      expect(i.ms).toBeGreaterThanOrEqual(0);
    }
    expect(seen.filter(([, s]) => s === "queued")).toHaveLength(4);
    expect(seen.map(([, s]) => BATCH_STATUS_LABELS[s])).toContain("Building");
  });

  it("never calls Claude, never moves a lead backwards, and marks missing facts", async () => {
    const { leads, dd } = world();
    const [a, b] = await importLeads(
      leads,
      "Seneca Paving | none | 716-555-0103\nQuiet Masonry | none",
    );
    await leads.saveProspects([{ ...a!, stage: "proposal" }]);
    const write = vi.fn();
    const writer = { id: "claude:test", available: true, write };
    const r = await buildBatchItem(a!.id, { ...dd, writer });
    expect(r.status).toBe("completed");
    expect(write).not.toHaveBeenCalled();
    expect((await leads.getProspect(a!.id))!.stage).toBe("proposal");
    const plan = planBatch([b!.id], await leads.listProspects());
    expect(plan.needsInfo[0]?.reason ?? plan.excluded[0]?.reason).toMatch(
      /Needs a phone number or email address\.|Not qualified\./,
    );
    expect((await buildBatchItem(b!.id, dd)).status).toBe("needs_info");
  });

  it("HLG-owned businesses are excluded from batches", async () => {
    const { pd, leads, profiles } = world();
    await seedInternalProfiles(pd);
    await assessProfile(HLG_BT_ID, undefined, pd);
    const id = (await profiles.get(HLG_BT_ID))!.prospectId!;
    const plan = planBatch([id], await leads.listProspects());
    expect(plan.build).toEqual([]);
  });
});

describe("profile and batch file stores", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("keep profiles and batch records across restarts", async () => {
    const { FileProfileRepository, FileBatchStore } = await import("./site-store");
    dir = await mkdtemp(path.join(tmpdir(), "profiles-"));
    const { pd } = world();
    const files = { ...pd, profiles: new FileProfileRepository(dir) };
    await seedInternalProfiles(files);
    expect(
      (await new FileProfileRepository(dir).list()).map((p) => p.id).sort(),
    ).toEqual([HLG_BT_ID, HSCS_ID].sort());
    const store = new FileBatchStore(dir);
    await store.save({
      id: "b1",
      startedAt: "",
      finishedAt: "",
      actor: "x",
      items: [],
      summary: "s",
    });
    expect((await new FileBatchStore(dir).list())[0]!.id).toBe("b1");
  });
});
