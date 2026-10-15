// Real Presence Scanner leads for tests, built by the real scan pipeline with
// an offline Google Places response and an offline website.

import {
  createGooglePlacesClient,
  runMarketScan,
  type FetchLike,
  type Prospect,
  type Vertical,
  type WebEgress,
} from "@hl-bos/presence-scanner";

export const NOW = new Date("2026-10-14T15:00:00Z");

const PAGE = `<!doctype html><html><head><title>Home</title></head><body><h1>Shop</h1>
<a href="https://www.vagaro.com/x">Book</a><footer>© 2019</footer></body></html>`;

const egress: WebEgress = {
  online: () => Promise.resolve(true),
  resolve: (h) =>
    h.endsWith(".example")
      ? Promise.resolve(["93.184.216.34"])
      : Promise.reject(new Error(`getaddrinfo ENOTFOUND ${h}`)),
  fetchPage: (u) =>
    Promise.resolve({
      status: 200,
      finalUrl: u,
      redirectChain: [],
      headers: { "content-type": "text/html" },
      body: PAGE,
      bytes: PAGE.length,
      contentType: "text/html",
    }),
  fetchRobots: () => Promise.resolve(undefined),
};

export async function googleLead(
  place: Record<string, unknown>,
  vertical: Vertical,
): Promise<Prospect> {
  const fetchImpl: FetchLike = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ places: [place] }),
    });
  let n = 0;
  const { prospects } = await runMarketScan(
    {
      market: "West Seneca",
      zip: "14224",
      radiusMiles: 10,
      vertical,
      maxResults: 5,
      searchTerms: undefined,
      source: "google_places",
      importText: undefined,
    },
    {
      places: createGooglePlacesClient({ apiKey: "k", fetchImpl }),
      egress,
      now: () => NOW,
      newId: () => `lead-${++n}`,
      existing: [],
      actor: "test",
    },
  );
  return prospects[0]!;
}

export async function importedLead(
  line: string,
  vertical: Vertical,
): Promise<Prospect> {
  let n = 0;
  const { prospects } = await runMarketScan(
    {
      market: "West Seneca",
      zip: "14224",
      radiusMiles: 10,
      vertical,
      maxResults: 5,
      searchTerms: undefined,
      source: "import",
      importText: line,
    },
    {
      places: null,
      egress,
      now: () => NOW,
      newId: () => `lead-${++n}`,
      existing: [],
      actor: "test",
    },
  );
  return prospects[0]!;
}

export const ROOFER = {
  id: "P-roof",
  displayName: { text: "Seneca Roofing & Gutters" },
  primaryType: "roofing_contractor",
  primaryTypeDisplayName: { text: "Roofing contractor" },
  formattedAddress: "12 Main St, West Seneca, NY 14224, USA",
  nationalPhoneNumber: "(716) 555-0101",
  googleMapsUri: "https://maps.google.com/?cid=123",
  rating: 4.4,
  userRatingCount: 17,
  businessStatus: "OPERATIONAL",
  location: { latitude: 42.84, longitude: -78.75 },
};

export const BARBER = {
  id: "P-barber",
  displayName: { text: "Union Road Barbers" },
  primaryType: "barber_shop",
  primaryTypeDisplayName: { text: "Barber shop" },
  formattedAddress: "900 Union Rd, West Seneca, NY 14224, USA",
  nationalPhoneNumber: "(716) 555-0150",
  websiteUri: "https://unionbarbers.example/",
  businessStatus: "OPERATIONAL",
  regularOpeningHours: { openNow: true },
  photos: [{}],
};

export const PIZZERIA = {
  id: "P-pizza",
  displayName: { text: "Orchard Park Pizza" },
  primaryType: "pizza_restaurant",
  primaryTypeDisplayName: { text: "Pizza restaurant" },
  formattedAddress: "5 Quaker St, Orchard Park, NY 14127, USA",
  nationalPhoneNumber: "(716) 555-0170",
  rating: 3.6,
  userRatingCount: 240,
  businessStatus: "OPERATIONAL",
};
