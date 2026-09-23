import { describe, expect, it } from "vitest";
import { gazetteerSize, normalizeCity, resolvePlace } from "./places";
import { greatCircleMiles } from "./geo";

const ok = (q: string) => {
  const r = resolvePlace(q);
  if (!r.ok) throw new Error(`${q}: ${r.error}`);
  return r;
};

describe("national place resolution", () => {
  it("covers the whole country, not one region", () => {
    const { zips, cities } = gazetteerSize();
    expect(zips).toBeGreaterThan(40_000);
    expect(cities).toBeGreaterThan(15_000);
    // One city in each corner plus the middle, and the two non-contiguous states.
    for (const q of [
      "Seattle, WA",
      "Miami, FL",
      "Bangor, ME",
      "San Diego, CA",
      "Wichita, KS",
      "Anchorage, AK",
      "Honolulu, HI",
    ]) {
      expect(ok(q).matchedBy).toBe("city");
    }
  });

  it("puts cities where they are (within a few miles of known centres)", () => {
    const known: [string, number, number][] = [
      ["Buffalo, NY", 42.8864, -78.8784],
      ["Dallas, TX", 32.7767, -96.797],
      ["Chicago, IL", 41.8781, -87.6298],
      ["Los Angeles, CA", 34.0522, -118.2437],
      ["Atlanta, GA", 33.749, -84.388],
    ];
    for (const [q, lat, lon] of known) {
      const p = ok(q).place;
      expect(greatCircleMiles(p, { name: "", lat, lon }), q).toBeLessThan(10);
    }
  });

  it("accepts the ways people write a location", () => {
    expect(ok("Buffalo NY").place.name).toBe("Buffalo, NY");
    expect(ok("buffalo, new york").place.name).toBe("Buffalo, NY");
    expect(ok("St. Louis, MO").place.name).toBe("Saint Louis, MO");
    expect(ok("Ft Worth, TX").place.name).toBe("Fort Worth, TX");
    expect(ok("14510").place.name).toBe("Mount Morris, NY 14510");
    expect(ok("14510-1234").matchedBy).toBe("zip");
    expect(ok("Dallas, TX 75201")).toMatchObject({
      matchedBy: "zip",
      place: { name: "Dallas, TX 75201" },
    });
    expect(ok("40.44, -79.99")).toMatchObject({
      matchedBy: "coordinates",
      place: { lat: 40.44, lon: -79.99 },
    });
  });

  it("groups ZIP and city results into one lane-history region", () => {
    expect(ok("75201").place.region).toBe("Dallas, TX");
    expect(ok("Dallas, TX").place.region).toBe("Dallas, TX");
  });

  it("refuses rather than guesses", () => {
    for (const q of [
      "",
      "Springfield",
      "Atlantis, NY",
      "00000",
      "95.0, 10.0",
      "Dallas, ZZ",
    ]) {
      const r = resolvePlace(q);
      expect(r.ok, q).toBe(false);
    }
    const r = resolvePlace("Springfield");
    if (!r.ok) expect(r.error).toMatch(/needs a state/);
  });

  it("drops military mail codes, which carry no real location", () => {
    expect(resolvePlace("34001").ok).toBe(false);
  });

  it("normalises abbreviations both ways", () => {
    expect(normalizeCity("St. Paul")).toBe(normalizeCity("Saint Paul"));
    expect(normalizeCity("Mt. Vernon")).toBe("mount vernon");
  });
});
