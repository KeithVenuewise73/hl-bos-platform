/**
 * The writer boundary.
 *
 * Anything that can turn a GenerationRequest into a HypePackage implements
 * this — the built-in template writer, Claude, or whichever vendor comes next.
 * Adding a vendor is one new file in this directory; nothing in the app
 * changes, because the app only ever calls `generatePackage()`.
 *
 * A writer's output is a PROPOSAL. `generatePackage()` normalises it, runs the
 * fabrication guard and the content screen over it, and falls back to the
 * template writer if it fails either. A writer cannot get an unchecked word
 * into a saved package.
 */

import type { GenerationRequest, HypePackage } from "../types.ts";

export interface HypeWriter {
  /** Recorded with every package and shown in the UI. */
  readonly id: string;
  /** Plain English, for the settings panel. */
  readonly label: string;
  /** False means generatePackage() goes straight to the template writer. */
  readonly available: boolean;
  /** `baseline` is the template writer's draft, offered as a reference. */
  write(request: GenerationRequest, baseline: HypePackage): Promise<HypePackage>;
}
