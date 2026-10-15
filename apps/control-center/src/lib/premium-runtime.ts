import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { FONT_FILES, premiumTheme } from "@hl-bos/site-builder";

import type { PremiumDeps } from "./premium";
import { FilePremiumRepository, FileProfileRepository } from "./site-store";

/** The real wiring: the file stores on this computer. Nothing can publish. */
export function premiumDeps(): PremiumDeps {
  return {
    profiles: new FileProfileRepository(),
    premium: new FilePremiumRepository(),
    now: () => new Date(),
    newId: () => randomUUID(),
    actor: "Control Center operator",
  };
}

/**
 * The bundled fonts (packages/site-builder/assets/fonts), from where the
 * console runs (apps/control-center). The ignore hint keeps the bundler from
 * tracing the whole repository through this one path.
 */
export const FONTS_DIR = () =>
  path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "..",
    "..",
    "packages",
    "site-builder",
    "assets",
    "fonts",
  );

/** Read one bundled font or licence file; nothing else can be read. */
export async function readAsset(file: string): Promise<Uint8Array> {
  if (!FONT_FILES.some((f) => f.file === file || f.licence === file))
    throw new Error(`Not a bundled font asset: ${file}`);
  return new Uint8Array(await readFile(path.join(FONTS_DIR(), file)));
}

/** Bytes of the two fonts a theme's pages load (for the performance review). */
export async function themeFontBytes(theme: string): Promise<number> {
  const t = premiumTheme(theme);
  const sizes = await Promise.all(
    [t.display.file, t.body.file].map((f) =>
      stat(path.join(FONTS_DIR(), f)).then((s) => s.size),
    ),
  );
  return sizes.reduce((a, b) => a + b, 0);
}
