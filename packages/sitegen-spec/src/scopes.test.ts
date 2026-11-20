import { describe, expect, it } from "vitest";
import { sgSpec } from "./fixtures.test-helpers.ts";
import { changedScopes, jsonEqual } from "./scopes.ts";

// These cases are the ones in supabase/tests/60_sitegen.sql, section 3 and 4
// (the "edit scopes" block): same base, same edits. The SQL says which of them
// a free-plan client may save; here we pin which scope each one lands in.
const base = sgSpec("#112233");

describe("changedScopes pins the same cases as supabase/tests/60_sitegen.sql", () => {
  const cases: [string, unknown, ReturnType<typeof changedScopes>][] = [
    ["no change", sgSpec("#112233"), []],
    ["t_can_change_theme", sgSpec("#445566"), ["theme"]],
    ["t_can_change_business_info", sgSpec("#112233", "+17165550199"), ["profile"]],
    [
      "t_cannot_change_page_content_without_the_entitlement",
      sgSpec("#112233", "+17165550100", 1, {
        pages: [{ slug: "p1", title: "Changed", sections: [] }],
      }),
      ["content"],
    ],
    [
      "t_cannot_change_hero_text_without_the_entitlement",
      sgSpec("#112233", "+17165550100", 1, {
        hero: {
          headline: "New headline",
          subheadline: "",
          choice: { kind: "default" },
        },
      }),
      ["content"],
    ],
    [
      "t_cannot_change_seo_without_the_entitlement",
      sgSpec("#112233", "+17165550100", 1, {
        seo: { title: "Changed", description: "x" },
      }),
      ["content"],
    ],
    [
      "t_cannot_smuggle_a_new_top_level_field",
      sgSpec("#112233", "+17165550100", 1, { extra: "added" }),
      ["content"],
    ],
    [
      "t_cannot_add_pages_on_the_free_plan (3 pages)",
      sgSpec("#112233", "+17165550100", 3),
      ["content"],
    ],
    [
      "hero choice changes (library key)",
      sgSpec("#112233", "+17165550100", 1, {
        hero: {
          headline: "Fresh cuts",
          subheadline: "",
          choice: { kind: "library", key: "made_up" },
        },
      }),
      ["heroChoice"],
    ],
    [
      "claims added (staff case in the SQL test)",
      sgSpec("#112233", "+17165550100", 1, {
        claims: [
          {
            kind: "yearsInBusiness",
            value: "25 years",
            source: { type: "intake", field: "yearsInBusiness" },
          },
        ],
      }),
      ["content"],
    ],
    [
      "t_staff_may_edit_content (4 pages + seo, staff case)",
      sgSpec("#112233", "+17165550100", 4, {
        seo: { title: "Staff edit", description: "d" },
      }),
      ["content"],
    ],
  ];
  for (const [name, next, expected] of cases)
    it(name, () => expect(changedScopes(base, next)).toEqual(expected));

  it("several scopes at once, in a fixed order", () => {
    const next = sgSpec("#445566", "+17165550199", 1, {
      hero: { headline: "X", subheadline: "", choice: { kind: "library", key: "k" } },
    });
    expect(changedScopes(base, next)).toEqual([
      "theme",
      "profile",
      "heroChoice",
      "content",
    ]);
  });
});

describe("changedScopes edge cases follow jsonb semantics", () => {
  it("object key order does not matter", () => {
    const a = { specVersion: 1, theme: { a: 1, b: 2 } };
    const b = { theme: { b: 2, a: 1 }, specVersion: 1 };
    expect(changedScopes(a, b)).toEqual([]);
  });
  it("array order matters", () => {
    expect(changedScopes({ pages: [1, 2] }, { pages: [2, 1] })).toEqual(["content"]);
  });
  it("a removed top-level key is a content change", () => {
    expect(changedScopes({ seo: {}, claims: [] }, { seo: {} })).toEqual(["content"]);
  });
  it("a missing key is not the same as an explicit null", () => {
    expect(jsonEqual(undefined, null)).toBe(false);
    expect(changedScopes({}, { theme: null })).toEqual(["theme"]);
  });
  it("hero.choice changes without touching hero text are not content", () => {
    const a = { hero: { headline: "H", choice: { kind: "default" } } };
    const b = { hero: { headline: "H", choice: { kind: "asset", assetId: "x" } } };
    expect(changedScopes(a, b)).toEqual(["heroChoice"]);
  });
  it("numbers compare by value", () => {
    expect(jsonEqual(1, 1.0)).toBe(true);
    expect(jsonEqual(1, "1")).toBe(false);
  });
});
