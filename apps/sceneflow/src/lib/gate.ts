import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { cookies } from "next/headers";

import { ACCESS_COOKIE, decideAccess, type AccessState } from "@/lib/access";
import { REPO_ROOT } from "@/lib/shell";

/**
 * The door, wired up.
 *
 * The code lives in a file rather than an environment variable so the launcher
 * can write it and the operator can read it without a terminal, and so this app
 * needs no configuration layer to be usable. `.sceneflow/` is gitignored, which
 * is what keeps the code out of the repository — not a promise not to commit it.
 *
 * No file means no code means unguarded, which is correct for the default
 * `next start`: that binds to localhost, so the operating system is the door.
 * The network launcher writes a code before it binds to anything wider.
 */

const CODE_FILE = join(REPO_ROOT, ".sceneflow", "access-code.txt");

export async function configuredCode(): Promise<string> {
  try {
    return (await readFile(CODE_FILE, "utf-8")).trim();
  } catch {
    return "";
  }
}

export async function accessState(): Promise<AccessState> {
  const store = await cookies();
  return decideAccess({
    configuredCode: await configuredCode(),
    cookieToken: store.get(ACCESS_COOKIE)?.value ?? "",
  });
}

/**
 * Guard for anything that is not a page: the photo route and every server
 * action. The layout hides the UI behind the unlock form, but hiding a page is
 * not a control — a request straight to the route or the action does not render
 * a layout. This is the control.
 */
export async function allowed(): Promise<boolean> {
  return (await accessState()).state !== "locked";
}
