// Prospect-demo mode must not change when new verticals, internal drafts or
// the vertical registry are added. These golden files were recorded from the
// Phase 2 builder BEFORE any Phase 3A change; every later build must reproduce
// them byte for byte. If one of these fails, a prospect demo changed: that is
// a product decision, not a test to update casually.

import { describe, expect, it } from "vitest";

import { buildDraft } from "./builder.ts";
import { checklistMarkdown, readme } from "./export.ts";
import {
  BARBER,
  googleLead,
  importedLead,
  NOW,
  PIZZERIA,
  ROOFER,
} from "./fixtures.test-helpers.ts";
import { renderSite } from "./render.ts";

const deps = {
  writer: null,
  now: () => NOW,
  newId: () => "draft-golden",
  actor: "operator",
  previous: undefined,
};

const CASES = [
  ["roofer", () => googleLead(ROOFER, "contractor")],
  ["barber", () => googleLead(BARBER, "salon_barber")],
  ["pizzeria", () => googleLead(PIZZERIA, "restaurant_bar")],
  [
    "imported-paving",
    () =>
      importedLead(
        "Seneca Paving | none | 716-555-0103 | 50 Center Rd, West Seneca, NY 14224",
        "contractor",
      ),
  ],
] as const;

describe("prospect-demo mode is unchanged (golden files from Phase 2)", () => {
  for (const [name, lead] of CASES) {
    it(`${name}: page, checklist and readme are byte-identical`, async () => {
      const d = await buildDraft(await lead(), deps);
      await expect(renderSite(d)).toMatchFileSnapshot(`./__golden__/${name}.html`);
      await expect(checklistMarkdown(d)).toMatchFileSnapshot(
        `./__golden__/${name}.checklist.md`,
      );
      await expect(readme(d)).toMatchFileSnapshot(`./__golden__/${name}.readme.txt`);
      await expect(JSON.stringify(d.copy, null, 1)).toMatchFileSnapshot(
        `./__golden__/${name}.copy.json`,
      );
    });
  }
});
