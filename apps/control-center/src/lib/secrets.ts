import "server-only";
import { readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";

/**
 * Reads and writes apps/control-center/.env.local.
 *
 * The CEO pastes a token into the console; the console writes the file. He
 * never opens a text editor and never touches a terminal -- which is the whole
 * point of the operating contract.
 *
 * .env.local is gitignored (verified), so tokens never leave the machine.
 * Values are never returned to the browser -- only whether each one is present.
 */
const FILE = path.join(process.cwd(), ".env.local");

export async function readEnvFile(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(FILE, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (t === "" || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeEnvValues(values: Record<string, string>): Promise<void> {
  const current = await readEnvFile();
  const merged = { ...current, ...values };
  for (const [k, v] of Object.entries(merged)) {
    if (v === "") delete merged[k];
  }
  const body =
    "# Written by the Development Control Center. Never commit this file.\n" +
    "# It is gitignored. Tokens stay on this machine.\n" +
    Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n";
  await writeFile(FILE, body, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(FILE, 0o600);
  } catch {
    // Windows has no POSIX modes. Not fatal.
  }
}

/** Which connections exist. Never exposes the values themselves. */
export async function connectionStatus(): Promise<{
  github: boolean;
  supabase: boolean;
  supabaseRef: string | null;
}> {
  const e = await readEnvFile();
  return {
    github: Boolean(e["HLBOS_GITHUB_TOKEN"]),
    supabase: Boolean(e["SUPABASE_ACCESS_TOKEN"]),
    supabaseRef: e["HLBOS_SUPABASE_PROJECT_REF"] ?? null,
  };
}
