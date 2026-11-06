import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { classifyUrl, type PresenceRepository } from "@hl-bos/presence-scanner";
import {
  runVisualReview,
  startGuidedSession,
  withVisualReview,
  type GuidedOptions,
  type GuidedSession,
  type VisualReview,
  type VisualReviewOptions,
} from "@hl-bos/visual-review";

import type { PresenceResult } from "./presence";
import { cmd } from "./shell";

/**
 * The visual review, from the console: a real browser on this computer looks
 * at a lead's website, read-only, and the evidence (screenshots and what was
 * seen) is kept here, in apps/control-center/.data/visual-reviews (gitignored).
 * Nothing is sent anywhere, no form is submitted, and a block is recorded as a
 * block -- see packages/visual-review/src/browser.ts for how that is enforced.
 */
export const VISUAL_DIR = path.join(process.cwd(), ".data", "visual-reviews");

const ID = /^vr-[a-z0-9-]{4,60}$/;
const FILE = /^p\d{2}-(desktop|mobile|blocked)\.png$/;

export interface VisualDeps {
  repo: Pick<PresenceRepository, "getProspect" | "saveProspects">;
  run: (url: string, opts: VisualReviewOptions) => Promise<VisualReview>;
  /** Opens a VISIBLE browser window for the person ("view it yourself"). */
  guided: (url: string, opts: GuidedOptions) => Promise<GuidedSession>;
  outDir: string;
}

export function visualDeps(repo: VisualDeps["repo"]): VisualDeps {
  return { repo, run: runVisualReview, guided: startGuidedSession, outDir: VISUAL_DIR };
}

/** The lead's own website address, or the plain-English reason there is none to open. */
function siteOf(
  p: Awaited<ReturnType<VisualDeps["repo"]["getProspect"]>>,
): string | PresenceResult {
  if (!p)
    return {
      ok: false,
      headline: "Lead not found.",
      meaning: "Reload the Lead Board.",
    };
  const site = p.corrections.website ?? p.website;
  if (!site || site === "none")
    return {
      ok: false,
      headline: "No website to review.",
      meaning: "This business has no website address on record.",
    };
  if (classifyUrl(site).kind !== "site")
    return {
      ok: false,
      headline: "Not reviewed.",
      meaning:
        "The website address is a social or link-in-bio page, which the scanner does not open.",
    };
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

// --- "View it yourself": one window per lead, kept while it is open --------

interface Running {
  session: GuidedSession;
  startedAt: string;
}
const running = new Map<string, Running>();
/** What the last finished session for a lead established (until the page shows it). */
const finished = new Map<string, PresenceResult>();

const HEADLINE: Record<VisualReview["coverage"], string> = {
  complete: "Saved: every page you opened was recorded.",
  partial: "Saved: some pages you opened could not be viewed.",
  blocked: "Saved: the website could not be viewed (access was refused).",
  failed: "Nothing was recorded.",
  not_available: "No browser window could be opened on this computer.",
};

/**
 * Open the lead's website in a visible browser window on this computer. The
 * person browses; each page they land on is recorded. Returns at once; the
 * review is saved to the lead when the window is closed (or Done is pressed).
 */
export async function startGuidedReview(
  id: string,
  deps: VisualDeps,
): Promise<PresenceResult> {
  if (running.has(id))
    return {
      ok: true,
      headline: "The browser window is already open.",
      meaning: "Browse there, then close it (or press Done) to save.",
    };
  const p = await deps.repo.getProspect(id);
  const site = siteOf(p);
  if (typeof site !== "string") return site;
  finished.delete(id);
  const session = await deps.guided(site, { outDir: deps.outDir });
  if (!session.page) {
    // Nothing was launched (address refused or not found, or no browser): say so now.
    const r = await session.done;
    const fresh = await deps.repo.getProspect(id);
    if (fresh) await deps.repo.saveProspects([withVisualReview(fresh, r)]);
    return {
      ok: false,
      headline: "No window was opened.",
      meaning: r.coverageReason.replace(/\s*No window was opened\.$/, ""),
    };
  }
  running.set(id, { session, startedAt: new Date().toISOString() });
  void session.done.then(async (r) => {
    running.delete(id);
    const fresh = await deps.repo.getProspect(id);
    if (fresh) await deps.repo.saveProspects([withVisualReview(fresh, r)]);
    finished.set(id, {
      ok: r.coverage === "complete" || r.coverage === "partial",
      headline: HEADLINE[r.coverage],
      meaning: r.coverageReason,
    });
  });
  return {
    ok: true,
    headline: "A browser window has opened on your screen.",
    meaning:
      "Click through the website as you normally would: menus, programs, booking or registration pages. Each page you land on is recorded. Please just look; don't fill in forms or make bookings. Close the window (or press Done) when you have seen enough.",
  };
}

export type GuidedStatus =
  | { state: "running"; pages: number; startedAt: string }
  | { state: "finished"; result: PresenceResult }
  | { state: "idle" };

export function guidedStatus(id: string): GuidedStatus {
  const r = running.get(id);
  if (r)
    return { state: "running", pages: r.session.captured(), startedAt: r.startedAt };
  const f = finished.get(id);
  return f ? { state: "finished", result: f } : { state: "idle" };
}

/** The console's Done button: close the window and save. */
export async function stopGuidedReview(id: string): Promise<PresenceResult> {
  const r = running.get(id);
  if (!r)
    return {
      ok: false,
      headline: "No browser window is open for this lead.",
      meaning: "",
    };
  await r.session.stop();
  await r.session.done;
  // done's handler saves and records the result; wait for it to land.
  for (let i = 0; i < 50 && !finished.has(id); i++)
    await new Promise((ok) => setTimeout(ok, 100));
  return finished.get(id) ?? { ok: true, headline: "Saved.", meaning: "" };
}

/** Run a visual review of a lead's website and keep its evidence with the lead. */
export async function visualReviewLead(
  id: string,
  deps: VisualDeps,
): Promise<PresenceResult> {
  const p = await deps.repo.getProspect(id);
  const site = siteOf(p);
  if (typeof site !== "string") return site;
  if (!p)
    return {
      ok: false,
      headline: "Lead not found.",
      meaning: "Reload the Lead Board.",
    };
  const r = await deps.run(site, { outDir: deps.outDir });
  await deps.repo.saveProspects([withVisualReview(p, r)]);
  const viewed = r.pages.filter((x) => x.access === "ok").length;
  const headline: Record<VisualReview["coverage"], string> = {
    complete: `Website reviewed in a browser: ${viewed} page(s) viewed.`,
    partial: `Website partly reviewed: ${viewed} page(s) viewed, some could not be.`,
    blocked: "The website could not be viewed: access was refused.",
    failed: "The visual review did not finish.",
    not_available: "No browser is installed on this computer yet.",
  };
  return {
    ok: r.coverage === "complete" || r.coverage === "partial",
    headline: headline[r.coverage],
    meaning: r.coverageReason,
  };
}

/** A saved review, by id (validated; never a path from a request). */
export async function loadVisualReview(
  reviewId: string,
  dir = VISUAL_DIR,
): Promise<VisualReview | undefined> {
  if (!ID.test(reviewId)) return undefined;
  try {
    return JSON.parse(
      await readFile(path.join(dir, reviewId, "review.json"), "utf8"),
    ) as VisualReview;
  } catch {
    return undefined;
  }
}

/** A screenshot's bytes, or undefined. Only names this package writes are accepted. */
export async function visualScreenshot(
  reviewId: string,
  file: string,
  dir = VISUAL_DIR,
): Promise<Buffer | undefined> {
  if (!ID.test(reviewId) || !FILE.test(file)) return undefined;
  try {
    return await readFile(path.join(dir, reviewId, file));
  } catch {
    return undefined;
  }
}

// --- The browser itself --------------------------------------------------

// The console's own dependency, resolved from its own folder (apps/control-center).
const req = createRequire(path.join(process.cwd(), "package.json"));

/** Is Chromium installed for the pinned Playwright? */
export async function browserInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/**
 * One click: download the Chromium build the pinned Playwright expects (about
 * 150 MB, from Playwright's own download servers, once). The arguments are
 * constants; nothing typed by anyone reaches the command.
 */
export async function installBrowser(): Promise<PresenceResult> {
  let cli: string;
  try {
    cli = path.join(path.dirname(req.resolve("playwright/package.json")), "cli.js");
  } catch {
    return {
      ok: false,
      headline: "The browser library is missing.",
      meaning: "Update the console (it reinstalls its libraries), then try again.",
    };
  }
  const r = await cmd("node", [cli, "install", "chromium"], { timeoutMs: 20 * 60_000 });
  if (!r.ok)
    return {
      ok: false,
      headline: "The browser could not be installed.",
      meaning: `The download did not finish. ${r.output.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}`,
    };
  return (await browserInstalled())
    ? {
        ok: true,
        headline: "Browser installed.",
        meaning: "Visual reviews can now run on this computer.",
      }
    : {
        ok: false,
        headline: "The install finished, but the browser is still not found.",
        meaning: r.output.slice(-300),
      };
}
