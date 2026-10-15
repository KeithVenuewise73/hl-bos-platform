// Reading the bundled fonts from disk (Node only). Kept out of the package's
// main entry so bundlers never trace file-system access through it; the
// console has its own reader (premium-runtime.ts), and tests use this one.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { FONT_FILES, PremiumDraftError } from "./draft.ts";

/**
 * The bundled fonts folder, found by walking up from a starting directory
 * (the console runs from apps/control-center; tests from the package).
 */
export function fontsDir(fromDir: string): string {
  let dir = path.resolve(fromDir);
  for (;;) {
    for (const candidate of [
      path.join(dir, "assets", "fonts"),
      path.join(dir, "packages", "site-builder", "assets", "fonts"),
    ])
      if (existsSync(path.join(candidate, FONT_FILES[0].file))) return candidate;
    const up = path.dirname(dir);
    if (up === dir)
      throw new PremiumDraftError(`The bundled fonts were not found above ${fromDir}.`);
    dir = up;
  }
}

/** Read one bundled asset (font or licence) by file name. */
export async function readFontAsset(dir: string, file: string): Promise<Uint8Array> {
  if (!FONT_FILES.some((f) => f.file === file || f.licence === file))
    throw new PremiumDraftError(`Not a bundled font asset: ${file}`);
  return new Uint8Array(await readFile(path.join(dir, file)));
}
