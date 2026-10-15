import { describe, expect, it } from "vitest";

import { MAX_IMPORT_ROWS, parseImport, splitDelimited } from "./import.ts";

describe("pasted-list import", () => {
  it("reads a CSV with a header row, including quoted commas", () => {
    const r = parseImport(
      [
        "Business Name,Website,Phone,Address,Rating,Reviews",
        'Smith Roofing,smithroofing.example,716-555-0101,"12 Main St, West Seneca",4.1,12',
        'Jones Plumbing,none,(716) 555-0102,"9 Union Rd, West Seneca",,',
      ].join("\n"),
    );
    expect(r.skipped).toEqual([]);
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({
      source: "import",
      name: "Smith Roofing",
      website: "smithroofing.example",
      phone: "716-555-0101",
      address: "12 Main St, West Seneca",
      importedRating: 4.1,
      importedReviewCount: 12,
    });
    expect(r.candidates[1]!.website).toBe("none");
    expect(r.candidates[1]!.importedRating).toBeUndefined();
  });

  it("reads pipe-separated lines without a header", () => {
    const r = parseImport(
      "Acme Paving | acmepaving.example | 716 555 0110 | 50 Center Rd, West Seneca",
    );
    expect(r.candidates[0]).toMatchObject({
      name: "Acme Paving",
      website: "acmepaving.example",
      phone: "716 555 0110",
      address: "50 Center Rd, West Seneca",
    });
  });

  it("reads free-text lines, picking out the website and phone", () => {
    const r = parseImport("Orchard Park Electric https://ope.example (716) 555-0120");
    expect(r.candidates[0]).toMatchObject({
      name: "Orchard Park Electric",
      website: "https://ope.example",
      phone: "(716) 555-0120",
    });
  });

  it("leaves an unknown website blank (not checked), distinct from 'none'", () => {
    const r = parseImport("Quiet Contractor | | 716-555-0130");
    expect(r.candidates[0]!.website).toBeUndefined();
  });

  it("ignores blank lines and # comments, reports unreadable lines", () => {
    const r = parseImport(
      "# my list\n\nname,website\n,acme.example\nGood Co,good.example",
    );
    expect(r.candidates.map((c) => c.name)).toEqual(["Good Co"]);
    expect(r.skipped).toEqual([
      { line: 4, text: ",acme.example", reason: "no business name" },
    ]);
  });

  it("rejects out-of-range ratings rather than storing them", () => {
    const r = parseImport("name,rating,reviews\nX,7,-3");
    expect(r.candidates[0]!.importedRating).toBeUndefined();
    expect(r.candidates[0]!.importedReviewCount).toBeUndefined();
  });

  it(`stops at ${MAX_IMPORT_ROWS} businesses and says so`, () => {
    const text = Array.from(
      { length: MAX_IMPORT_ROWS + 3 },
      (_, i) => `Biz ${i} | biz${i}.example`,
    ).join("\n");
    const r = parseImport(text);
    expect(r.candidates).toHaveLength(MAX_IMPORT_ROWS);
    expect(r.skipped).toHaveLength(3);
  });

  it("splits quoted CSV cells with doubled quotes", () => {
    expect(splitDelimited('a,"b ""q"", c",d', ",")).toEqual(["a", 'b "q", c', "d"]);
  });
});
