import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { classifyUrl, type PresenceRepository } from "@hl-bos/presence-scanner";
import {
  runVisualReview,
  withVisualReview,
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
  outDir: string;
}

export function visualDeps(repo: VisualDeps["repo"]): VisualDeps {
  return { repo, run: runVisualReview, outDir: VISUAL_DIR };
}

/** Run a visual review of a lead's website and keep its evidence with the lead. */
export async function visualReviewLead(
  id: string,
  deps: VisualDeps,
): Promise<PresenceResult> {
  const p = await deps.repo.getProspect(id);
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
  const kind = classifyUrl(site);
  if (kind.kind !== "site")
    return {
      ok: false,
      headline: "Not reviewed.",
      meaning:
        "The website address is a social or link-in-bio page, which the scanner does not open.",
    };
  const r = await deps.run(/^https?:\/\//i.test(site) ? site : `https://${site}`, {
    outDir: deps.outDir,
  });
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
