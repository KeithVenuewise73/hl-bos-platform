import "server-only";

import { existsSync } from "node:fs";
import { platform, release } from "node:os";
import { join } from "node:path";

import { repoStatus } from "./git";
import { detectGpu } from "./gpu";
import { readinessFrom } from "./sceneflow-report";
import { lastLaunchMessage, sceneflowStatus } from "./sceneflow-launch";
import { BUNDLED_PNPM } from "./pnpm";
import { formatReport } from "./report";
import { REPO_ROOT } from "./shell";

/**
 * Gathers everything needed to answer "what is going on on your machine?" and
 * hands back one block of text to paste.
 *
 * Everything here is read-only and already computed elsewhere; this only puts
 * it in one place so nobody has to be asked to read a screen and relay it.
 */
export async function diagnosticReport(): Promise<string> {
  const [repo, sceneflow, gpu] = await Promise.all([
    repoStatus(),
    sceneflowStatus(),
    detectGpu().then(readinessFrom),
  ]);

  return formatReport({
    whenGenerated: new Date().toISOString(),
    version: {
      short: repo.lastCommit?.short ?? "",
      when: repo.lastCommit?.when ?? "",
      branch: repo.branch,
      behind: repo.behindRemote,
      hasGit: repo.hasGit,
      dirtyFiles: repo.dirtyFiles,
    },
    machine: {
      platform: platform(),
      release: release(),
      node: process.version,
      bundledPnpm: existsSync(join(REPO_ROOT, ...BUNDLED_PNPM)),
    },
    sceneflow: {
      running: sceneflow.running,
      homeUrls: sceneflow.phoneUrls,
      awayUrls: sceneflow.awayUrls,
      // Whether, never what.
      codeSet: sceneflow.code !== "",
    },
    gpu: { verdict: gpu.verdict, headline: gpu.headline },
    lastLaunch: lastLaunchMessage(),
  });
}
