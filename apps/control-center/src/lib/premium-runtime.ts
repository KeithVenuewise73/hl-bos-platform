import "server-only";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { fontsDir, premiumTheme, readFontAsset } from "@hl-bos/site-builder";

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

/** The bundled fonts, found from where the console runs. */
export const FONTS_DIR = () => fontsDir(process.cwd());

export const readAsset = (file: string) => readFontAsset(FONTS_DIR(), file);

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
