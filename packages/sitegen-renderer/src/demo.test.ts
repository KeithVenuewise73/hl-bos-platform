// Not a check: a way to LOOK at the output. Set SITEGEN_DEMO_DIR to a directory
// outside the repo and this writes the rendered sample site there (and the
// asset files it points at, as tiny generated placeholders). Skipped otherwise.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { renderSite } from "./index.ts";
import { ctx, typicalSpec } from "./fixtures.test-helpers.ts";

const dir = process.env["SITEGEN_DEMO_DIR"];

describe.skipIf(!dir)("demo output", () => {
  it("writes the sample barber site to SITEGEN_DEMO_DIR", () => {
    mkdirSync(dir!, { recursive: true });
    // Resolve the sample's asset URLs to local files so the page loads with no network.
    const svg = (fill: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${fill}"/></svg>`;
    writeFileSync(join(dir!, "hero.svg"), svg("#334155"));
    writeFileSync(join(dir!, "logo.svg"), svg("#c8a24a"));
    writeFileSync(join(dir!, "g1.svg"), svg("#64748b"));
    const local = {
      ...ctx,
      assets: {
        logoUrl: "/logo.svg",
        heroUrl: "/hero.svg",
        gallery: Object.fromEntries(
          Object.keys(ctx.assets!.gallery!).map((k) => [k, "/g1.svg"]),
        ),
      },
    };
    const out = renderSite(typicalSpec(), local);
    writeFileSync(join(dir!, "index.html"), out.html);
    // The same page with no images, to see the gradient hero.
    writeFileSync(
      join(dir!, "bare.html"),
      renderSite(typicalSpec(), { origin: ctx.origin }).html,
    );
  });
});
