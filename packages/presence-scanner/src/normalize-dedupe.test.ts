import { describe, expect, it } from "vitest";

import { dedupeCandidates, identityKeys } from "./dedupe.ts";
import {
  classifyUrl,
  domainOf,
  normalizeAddress,
  normalizeName,
  normalizePhone,
  toUrl,
} from "./normalize.ts";
import { normalizePlace } from "./places.ts";
import type { Candidate } from "./types.ts";

describe("URL and domain normalization", () => {
  it("turns typed addresses into canonical URLs", () => {
    expect(toUrl("Acme.com")).toBe("https://acme.com");
    expect(toUrl("http://WWW.Acme.com/?utm_source=x&b=1")).toBe(
      "http://www.acme.com/?b=1",
    );
    expect(toUrl("none")).toBeUndefined();
    expect(toUrl("")).toBeUndefined();
    expect(toUrl("ftp://acme.com")).toBeUndefined();
    expect(toUrl("localhost")).toBeUndefined();
  });

  it("reduces a URL to its domain without www", () => {
    expect(domainOf("https://www.Acme.com/about")).toBe("acme.com");
    expect(domainOf(undefined)).toBeUndefined();
  });

  it("normalizes US phone numbers to 10 digits", () => {
    expect(normalizePhone("(716) 555-0101")).toBe("7165550101");
    expect(normalizePhone("+1 716.555.0101")).toBe("7165550101");
    expect(normalizePhone("12")).toBeUndefined();
  });

  it("normalizes names and street addresses", () => {
    expect(normalizeName("Smith Roofing, LLC")).toBe("smith roofing");
    expect(normalizeName("The Smith & Sons Co.")).toBe("smith sons");
    expect(normalizeAddress("12 Main Street, West Seneca, NY")).toBe("12 main st");
  });

  it("recognises social, link-in-bio and retired Google sites from the address alone", () => {
    expect(classifyUrl("https://www.facebook.com/smithroofing")).toEqual({
      kind: "social",
      platform: "Facebook",
    });
    expect(classifyUrl("https://m.facebook.com/x")).toEqual({
      kind: "social",
      platform: "Facebook",
    });
    expect(classifyUrl("https://instagram.com/x")).toEqual({
      kind: "social",
      platform: "Instagram",
    });
    expect(classifyUrl("https://linktr.ee/smith")).toEqual({ kind: "link_in_bio" });
    expect(classifyUrl("https://smith-roofing.business.site")).toEqual({
      kind: "retired_google_site",
    });
    expect(classifyUrl("https://notfacebook.com")).toEqual({ kind: "site" });
  });
});

const cand = (o: Partial<Candidate> & { name: string }): Candidate => ({
  source: "import",
  address: undefined,
  phone: undefined,
  email: undefined,
  website: undefined,
  place: undefined,
  importedRating: undefined,
  importedReviewCount: undefined,
  ...o,
});

describe("de-duplication", () => {
  it("merges on place ID first", () => {
    const place = normalizePlace({ id: "P1", displayName: { text: "Smith" } })!;
    const groups = dedupeCandidates([
      cand({ name: "Smith Roofing", source: "google_places", place }),
      cand({ name: "Smith Roofing LLC", source: "google_places", place }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("place:P1");
  });

  it("merges on website domain, ignoring www and scheme", () => {
    const groups = dedupeCandidates([
      cand({ name: "Smith Roofing", website: "http://www.smithroofing.example" }),
      cand({ name: "Smith Roof Co", website: "smithroofing.example/contact" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("domain:smithroofing.example");
  });

  it("merges on phone number", () => {
    const groups = dedupeCandidates([
      cand({ name: "A", phone: "(716) 555-0101" }),
      cand({ name: "B", phone: "716.555.0101" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("phone:7165550101");
  });

  it("merges on name plus street address", () => {
    const groups = dedupeCandidates([
      cand({ name: "Smith Roofing", address: "12 Main Street, West Seneca" }),
      cand({ name: "Smith Roofing LLC", address: "12 Main St., West Seneca, NY" }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("never merges different businesses that both use Facebook", () => {
    const groups = dedupeCandidates([
      cand({ name: "A", website: "https://facebook.com/a-roofing" }),
      cand({ name: "B", website: "https://facebook.com/b-paving" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("merges transitively and prefers the Google record", () => {
    const place = normalizePlace({
      id: "P9",
      displayName: { text: "Smith" },
      nationalPhoneNumber: "716-555-0101",
    })!;
    const groups = dedupeCandidates([
      cand({ name: "Smith (import)", website: "smith.example", importedRating: 4 }),
      cand({
        name: "Smith Roofing",
        source: "google_places",
        place,
        phone: "716-555-0101",
      }),
      cand({ name: "Smith again", website: "smith.example", phone: "716-555-0101" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.merged.source).toBe("google_places");
    expect(groups[0]!.merged.name).toBe("Smith Roofing");
    expect(groups[0]!.merged.website).toBe("smith.example");
    expect(groups[0]!.merged.importedRating).toBe(4);
    expect(groups[0]!.key).toBe("place:P9");
  });

  it("keeps different businesses apart", () => {
    expect(
      dedupeCandidates([
        cand({ name: "A", phone: "7165550101" }),
        cand({ name: "B", phone: "7165550102" }),
      ]),
    ).toHaveLength(2);
  });

  it("falls back to the name only when nothing else is known", () => {
    expect(identityKeys({ name: "Lone Co" })).toEqual(["name:lone"]);
    expect(identityKeys({ name: "Lone Co", phone: "7165550101" })).toEqual([
      "phone:7165550101",
    ]);
  });
});
