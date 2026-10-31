import "server-only";

/**
 * Server-side plumbing for the HLG Career Platform screens: reading the
 * signed-in subscriber's records, the plan and usage gate, and the one HTTP
 * client allowed to talk to job boards.
 */

import {
  ADAPTERS,
  PLANS,
  checkAllowance,
  usageEvent,
  type MeteredAction,
  type Plan,
  type RawForm,
} from "@hl-bos/ats-resume";

import { currentProfile, loadWorkspace } from "./store.ts";
import type { Workspace } from "./store/workspace.ts";

/** Every account is on the pilot plan until billing is connected and prices approved. */
export function currentPlan(): Plan {
  return PLANS.pilot;
}

export class LimitReached extends Error {}

/**
 * The server-side usage gate. Called INSIDE the workspace mutation, so the
 * check and the usage record are written together: a failed generation
 * records nothing, and a successful one cannot skip being counted.
 */
export function meter(
  workspace: Workspace,
  profileId: string,
  action: MeteredAction,
  engine = "rules-engine",
): void {
  const allowance = checkAllowance(currentPlan(), workspace.usageEvents, action);
  if (!allowance.allowed) throw new LimitReached(allowance.message);
  workspace.usageEvents.push(usageEvent(profileId, action, engine));
}

/** FormData -> plain record; repeated keys (checkbox groups) become arrays. */
export function formToRaw(form: FormData): RawForm {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = values.length === 1 ? (values[0] ?? "") : values;
  }
  return out;
}

export async function careerContext() {
  const workspace = await loadWorkspace();
  const profile = await currentProfile();
  const pid = profile?.id;
  const mine = <T extends { profileId: string }>(rows: readonly T[]): T[] =>
    rows.filter((r) => r.profileId === pid);
  return {
    workspace,
    profile,
    search: mine(workspace.searchProfiles)[0],
    facts: mine(workspace.facts),
    resumes: mine(workspace.resumes),
    interpretations: mine(workspace.interpretations),
    baseResumes: mine(workspace.baseResumes).sort(
      (a, b) => b.versionNumber - a.versionNumber,
    ),
    boards: mine(workspace.employerBoards),
    opportunities: mine(workspace.opportunities).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    submissions: mine(workspace.submissions),
    practice: mine(workspace.practiceSessions),
    linkedin: mine(workspace.linkedinItems),
    usage: mine(workspace.usageEvents),
  };
}

// ---------------------------------------------------------------------------
// Job-board HTTP client
// ---------------------------------------------------------------------------

/** The only hosts discovery may contact. Board tokens are validated separately. */
const ALLOWED_HOSTS = new Set([
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.ashbyhq.com",
  "api.smartrecruiters.com",
]);
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/**
 * Fetch JSON from a supported job board: fixed hosts, HTTPS only, no
 * redirects followed, a timeout and a size cap. Errors are plain English,
 * because they are shown to the subscriber as the source's status.
 */
export async function boardFetchJson(url: string): Promise<unknown> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error("That address is not a supported job board.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "HLG-Career-Platform/0.1" },
    });
    if (res.status === 404)
      throw new Error("The job board was not found. Check the board name.");
    if (!res.ok) throw new Error(`The job board did not answer (HTTP ${res.status}).`);
    const body = await res.text();
    if (body.length > MAX_BYTES)
      throw new Error("The job board returned more data than allowed.");
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("The job board did not answer within 15 seconds.", {
        cause: error,
      });
    if (error instanceof SyntaxError)
      throw new Error("The job board returned something that is not a job list.", {
        cause: error,
      });
    if (error instanceof Error && error.message.startsWith("The job board"))
      throw error;
    throw new Error("The job board could not be reached.", { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export const SUPPORTED_BOARD_SOURCES = Object.keys(
  ADAPTERS,
) as (keyof typeof ADAPTERS)[];
