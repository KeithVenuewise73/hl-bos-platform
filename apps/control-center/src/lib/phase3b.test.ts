import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryRepository } from "@hl-bos/presence-scanner";
import {
  HLG_BT_ID,
  HSCS_ID,
  MemoryDraftRepository,
  MemoryPremiumRepository,
  MemoryProfileRepository,
  premiumAsset,
} from "@hl-bos/site-builder";

import {
  approvePremium,
  buildPremium,
  PREMIUM_PREVIEW_CSP,
  premiumReview,
  type PremiumDeps,
} from "./premium";
import { saveProfile, seedInternalProfiles, type ProfileDeps } from "./profiles";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-15T12:00:00Z");
let n = 0;
async function world() {
  const profiles = new MemoryProfileRepository();
  const premium = new MemoryPremiumRepository();
  const pd: ProfileDeps = {
    profiles,
    leads: new MemoryRepository(() => NOW),
    drafts: new MemoryDraftRepository(),
    egress: {
      online: () => Promise.resolve(false),
      resolve: () => Promise.reject(new Error("offline")),
      fetchPage: () => Promise.reject(new Error("offline")),
      fetchRobots: () => Promise.resolve(undefined),
    },
    now: () => NOW,
    newId: () => `id-${++n}`,
    actor: "ceo",
  };
  await seedInternalProfiles(pd);
  const deps: PremiumDeps = {
    profiles,
    premium,
    now: () => NOW,
    newId: () => `p-${++n}`,
    actor: "ceo",
  };
  return { deps, pd, profiles, premium };
}

describe("Premium Business Sites in the console", () => {
  it("builds both HLG sites, each in its own theme, privately", async () => {
    const { deps, premium } = await world();
    const a = await buildPremium(HLG_BT_ID, deps);
    expect(a.headline).toMatch(/^Premium site built: version 1, 6 pages/);
    expect(a.meaning).toContain("Atelier");
    expect(a.meaning).toContain("nothing was published");
    expect(a.href).toBe(`/profiles/${HLG_BT_ID}/premium`);
    const b = await buildPremium(HSCS_ID, deps);
    expect(b.meaning).toContain("Meridian");
    expect((await premium.getByProfile(HSCS_ID))!.theme).toBe("meridian");
    expect((await buildPremium(HSCS_ID, deps)).headline).toMatch(
      /^Premium site rebuilt: version 2/,
    );
    expect((await buildPremium("nope", deps)).headline).toBe("Profile not found.");
  });

  it("approves a design without publishing; approval needs a draft", async () => {
    const { deps, premium } = await world();
    expect((await approvePremium(HSCS_ID, deps)).headline).toBe("No premium site yet.");
    await buildPremium(HSCS_ID, deps);
    const r = await approvePremium(HSCS_ID, deps);
    expect(r.meaning).toBe(
      "Internal sign-off on the design only. Nothing was published, and no address was configured.",
    );
    expect((await premium.getByProfile(HSCS_ID))!.status).toBe("approved");
  });

  it("the theme is chosen in the profile editor; unknown themes are ignored", async () => {
    const { deps, pd, profiles } = await world();
    const fd = new FormData();
    fd.set("design.theme", "meridian");
    expect((await saveProfile(HLG_BT_ID, fd, pd)).headline).toBe("Saved.");
    expect((await profiles.get(HLG_BT_ID))!.design?.theme).toBe("meridian");
    const bad = new FormData();
    bad.set("design.theme", "<script>");
    expect((await saveProfile(HLG_BT_ID, bad, pd)).headline).toBe("Nothing changed.");
    await buildPremium(HLG_BT_ID, deps);
  });

  it("refuses a profile that fails the claims check, in plain English", async () => {
    const { deps, profiles } = await world();
    const p = (await profiles.get(HSCS_ID))!;
    p.lists.services.items.push({
      name: "Guaranteed savings",
      description: "Free for 30 days",
    });
    await profiles.save(p);
    const r = await buildPremium(HSCS_ID, deps);
    expect(r.ok).toBe(false);
    expect(r.meaning).toContain("a guarantee");
  });

  it("the review computes completeness, accessibility and performance from the built pages", async () => {
    const { deps, premium } = await world();
    await buildPremium(HSCS_ID, deps);
    const r = premiumReview((await premium.getByProfile(HSCS_ID))!, 85_000);
    expect(r.completeness).toHaveLength(6);
    expect(r.accessibility.every((c) => c.ok)).toBe(true);
    expect(r.performance.every((c) => c.ok)).toBe(true);
  });

  it("the preview policy forbids scripts, forms and other origins; only the draft's own files are served", async () => {
    expect(PREMIUM_PREVIEW_CSP).toContain("default-src 'none'");
    expect(PREMIUM_PREVIEW_CSP).toContain("form-action 'none'");
    expect(PREMIUM_PREVIEW_CSP).toContain("frame-ancestors 'self'");
    expect(PREMIUM_PREVIEW_CSP).not.toContain("script-src");
    const { deps, premium } = await world();
    await buildPremium(HLG_BT_ID, deps);
    const d = (await premium.getByProfile(HLG_BT_ID))!;
    expect(premiumAsset(d, "privacy.html")?.kind).toBe("page");
    expect(premiumAsset(d, "secret.json")).toBeUndefined();
  });
});

describe("HLG companies that share a phone number", () => {
  it("keep separate audits and drafts (the scanner would otherwise merge them by phone)", async () => {
    const { pd, profiles } = await world();
    const { assessProfile, buildProfileDraft } = await import("./profiles");
    await assessProfile(HLG_BT_ID, undefined, pd);
    await assessProfile(HSCS_ID, undefined, pd);
    const bt = (await profiles.get(HLG_BT_ID))!;
    const hs = (await profiles.get(HSCS_ID))!;
    expect(bt.fields.phone.value).toBe(hs.fields.phone.value);
    expect(bt.prospectId).toBeDefined();
    expect(hs.prospectId).toBeDefined();
    expect(hs.prospectId).not.toBe(bt.prospectId);
    const leads = await pd.leads.listProspects();
    expect(leads.map((l) => l.name).sort()).toEqual([
      "HLG Business Transformation",
      "Herman Supply Chain Solutions",
    ]);
    await buildProfileDraft(HLG_BT_ID, pd);
    await buildProfileDraft(HSCS_ID, pd);
    expect((await pd.drafts.getByProspect(bt.prospectId!))!.profileId).toBe(HLG_BT_ID);
    expect((await pd.drafts.getByProspect(hs.prospectId!))!.profileId).toBe(HSCS_ID);
    // Re-assessing updates the profile's own lead, not a new one.
    await assessProfile(HSCS_ID, undefined, pd);
    expect((await profiles.get(HSCS_ID))!.prospectId).toBe(hs.prospectId);
    expect(await pd.leads.listProspects()).toHaveLength(2);
  });
});

describe("file stores", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("keep premium drafts per profile, and upgrade profiles saved before Phase 3B", async () => {
    const { FilePremiumRepository, FileProfileRepository } =
      await import("./site-store");
    dir = await mkdtemp(path.join(tmpdir(), "premium-"));
    const { deps, profiles } = await world();
    const files = { ...deps, premium: new FilePremiumRepository(dir) };
    await buildPremium(HSCS_ID, files);
    await buildPremium(HSCS_ID, files);
    expect((await new FilePremiumRepository(dir).getByProfile(HSCS_ID))!.version).toBe(
      2,
    );
    // A Phase 3A profile file: no credibility, plannedDomain or pillars yet.
    const old = (await profiles.get(HLG_BT_ID))!;
    const raw = JSON.parse(JSON.stringify(old)) as Record<
      string,
      Record<string, unknown>
    >;
    delete raw["fields"]!["credibility"];
    delete raw["fields"]!["plannedDomain"];
    delete raw["lists"]!["pillars"];
    await writeFile(path.join(dir, "profiles.json"), JSON.stringify([raw]));
    const loaded = (await new FileProfileRepository(dir).get(HLG_BT_ID))!;
    expect(loaded.fields.credibility.status).toBe("required");
    expect(loaded.lists.pillars.items).toEqual([]);
    expect(
      JSON.parse(await readFile(path.join(dir, "premium.json"), "utf8")),
    ).toHaveLength(1);
  });
});
