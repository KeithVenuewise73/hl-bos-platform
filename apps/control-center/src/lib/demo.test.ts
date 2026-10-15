import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryRepository, type WebEgress } from "@hl-bos/presence-scanner";
import { MemoryDraftRepository } from "@hl-bos/site-builder";

import {
  approveDemo,
  buildDemo,
  buildTime,
  editDemo,
  editFromForm,
  PREVIEW_HEADERS,
  type DemoDeps,
} from "./demo";
import { startScan, type PresenceDeps } from "./presence";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-14T15:00:00Z");
const offline: WebEgress = {
  online: () => Promise.resolve(false),
  resolve: () => Promise.reject(new Error("offline")),
  fetchPage: () => Promise.reject(new Error("offline")),
  fetchRobots: () => Promise.resolve(undefined),
};

let n = 0;
async function seed(lines: string, vertical = "contractor") {
  const leads = new MemoryRepository(() => NOW);
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
  const deps: DemoDeps = {
    leads,
    drafts: new MemoryDraftRepository(),
    writer: null,
    now: () => NOW,
    newId: () => `draft-${++n}`,
    actor: "operator",
  };
  return { deps, lead: (await leads.listProspects())[0]! };
}

describe("buildDemo (the Build demo site button)", () => {
  it("builds a draft, links to it, and moves the lead to Demo built", async () => {
    const { deps, lead } = await seed(
      "Seneca Paving | none | 716-555-0103 | 50 Center Rd, West Seneca",
    );
    const r = await buildDemo(lead.id, deps);
    expect(r.ok).toBe(true);
    expect(r.headline).toMatch(
      /^Demo built: version 1, in (under 0\.1|\d+\.\d) seconds\.$/,
    );
    expect(r.meaning).toContain("nothing was published");
    expect(r.meaning).toContain("moved to Demo built");
    expect(r.href).toBe(`/presence/${lead.id}/demo`);
    expect((await deps.leads.getProspect(lead.id))!.stage).toBe("demo_built");
    expect((await deps.drafts.getByProspect(lead.id))!.version).toBe(1);
  });

  it("a rebuild is version 2 of the same draft and does not move the stage again", async () => {
    const { deps, lead } = await seed("Seneca Paving | none | 716-555-0103");
    await buildDemo(lead.id, deps);
    const r = await buildDemo(lead.id, deps);
    expect(r.headline).toContain("rebuilt: version 2");
    expect(r.meaning).not.toContain("moved");
    expect(await deps.drafts.list()).toHaveLength(1);
  });

  it("does not drag a lead backwards in the pipeline", async () => {
    const { deps, lead } = await seed("Seneca Paving | none | 716-555-0103");
    await deps.leads.saveProspects([{ ...lead, stage: "proposal" }]);
    await buildDemo(lead.id, deps);
    expect((await deps.leads.getProspect(lead.id))!.stage).toBe("proposal");
  });

  it("explains verticals without a template and unknown leads", async () => {
    const { deps, lead } = await seed(
      "Coach Kim | none | 716-555-0111",
      "trainer_coach",
    );
    const r = await buildDemo(lead.id, deps);
    expect(r.ok).toBe(false);
    expect(r.headline).toBe("No demo template for this vertical yet.");
    expect((await buildDemo("nope", deps)).headline).toBe("That lead was not found.");
  });
});

describe("editing and approving", () => {
  it("guards edits, withdraws approval on change, and approves without publishing", async () => {
    const { deps, lead } = await seed("Seneca Paving | none | 716-555-0103");
    expect((await editDemo(lead.id, {}, deps)).headline).toBe("No demo yet.");
    await buildDemo(lead.id, deps);
    const a = await approveDemo(lead.id, deps);
    expect(a.meaning).toContain("Nothing was published");
    const bad = await editDemo(
      lead.id,
      { heroSubhead: "Free estimates, fully insured!" },
      deps,
    );
    expect(bad.ok).toBe(false);
    const good = await editDemo(
      lead.id,
      { heroSubhead: "Driveways and sealcoating in West Seneca." },
      deps,
    );
    expect(good.meaning).toContain("needs approving again");
    expect((await deps.drafts.getByProspect(lead.id))!.status).toBe("draft");
    expect(
      (
        await editDemo(
          lead.id,
          { heroSubhead: "Driveways and sealcoating in West Seneca." },
          deps,
        )
      ).headline,
    ).toBe("Nothing changed.");
  });

  it("reads the edit form, including unticked checkboxes", () => {
    const fd = new FormData();
    fd.set("heroHeadline", "H");
    fd.set("options", "1");
    fd.set("showVideoBlock", "on");
    expect(editFromForm(fd)).toEqual({
      heroHeadline: "H",
      showRating: false,
      showVideoBlock: true,
    });
    expect(editFromForm(new FormData())).toEqual({});
  });
});

describe("build time wording", () => {
  it("never says 0.0 seconds", () => {
    expect(buildTime(12)).toBe("under 0.1 seconds");
    expect(buildTime(1250)).toBe("1.3 seconds");
  });
});

describe("preview headers", () => {
  it("forbid scripts, forms and framing by other sites, and tell crawlers to stay away", () => {
    const csp = PREVIEW_HEADERS["content-security-policy"]!;
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(PREVIEW_HEADERS["x-robots-tag"]).toBe("noindex, nofollow");
  });
});

describe("draft file store", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("keeps one draft per lead across rebuilds", async () => {
    const { FileDraftRepository } = await import("./site-store");
    dir = await mkdtemp(path.join(tmpdir(), "drafts-"));
    const { deps, lead } = await seed("Seneca Paving | none | 716-555-0103");
    const files = { ...deps, drafts: new FileDraftRepository(dir) };
    await buildDemo(lead.id, files);
    await buildDemo(lead.id, files);
    const all = await files.drafts.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.version).toBe(2);
  });
});
