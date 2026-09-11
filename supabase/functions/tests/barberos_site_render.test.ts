// The owned-website renderer.
//
// What is under test is mostly what the page does NOT say. A generated page for
// a real business is where invented content does damage, so most of these
// assert an absence: no placeholder hours, no guessed price, no dead call
// button, no filler copy.

import {
  addressLine,
  completeness,
  esc,
  formatPrice,
  formatTime,
  renderSite,
  safeUrl,
  telHref,
  type SiteContent,
} from "../_shared/barberos/site_render.ts";
import { DEFAULT_THEME, THEMES, themeByKey } from "../_shared/barberos/site_themes.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

const EMPTY: SiteContent = {
  slug: "a-shop",
  status: "draft",
  shop_name: "A Shop",
  headline: null,
  about: null,
  phone: null,
  address_line1: null,
  locality: null,
  region: null,
  postal_code: null,
  map_url: null,
  booking_url: null,
  hours: [],
  services: [],
  links: [],
};

const FULL: SiteContent = {
  ...EMPTY,
  status: "published",
  shop_name: "Elmwood Barber Co.",
  headline: "Traditional cuts on Elmwood",
  about: "Cutting on Elmwood since 2012.\n\nWalk-ins welcome.",
  phone: "(716) 555-0100",
  address_line1: "742 Elmwood Ave",
  locality: "Buffalo",
  region: "NY",
  postal_code: "14222",
  map_url: "https://maps.example/elmwood",
  booking_url: "https://booksy.example/elmwood",
  hours: [
    { day: 1, closed: false, opens: "09:00:00", closes: "19:00:00" },
    { day: 0, closed: true, opens: null, closes: null },
  ],
  services: [
    { name: "Haircut", price_cents: 3500, duration_minutes: 30 },
    { name: "Hot towel shave", price_cents: null, duration_minutes: 45 },
  ],
  links: [{ kind: "instagram", url: "https://instagram.example/elmwood" }],
};

// ===========================================================================
// Nothing is invented
// ===========================================================================

Deno.test("an empty page renders no sections at all, and says it is empty", () => {
  const html = renderSite(EMPTY);
  for (const absent of ["Hours", "Services", "Find us", "About", "Elsewhere"]) {
    assert(!html.includes(`<h2>${absent}</h2>`), `no ${absent} section`);
  }
  assert(!html.includes("Book now"), "no booking button without a booking link");
  assert(!html.includes("tel:"), "no call button without a phone number");
  assert(html.includes("has not been filled in yet"), "it says so instead");
});

Deno.test("a day the shop has not stated is never rendered as Closed", () => {
  // The whole point. Rendering silence as "Closed" sends a customer away on a
  // day the shop is open; rendering it as open sends them to a locked door.
  const html = renderSite({
    ...EMPTY,
    hours: [{ day: 1, closed: false, opens: "09:00:00", closes: "19:00:00" }],
  });
  assert(html.includes("Monday"), "the stated day appears");
  for (const d of [
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]) {
    assert(!html.includes(`<th scope="row">${d}</th>`), `${d} has no row`);
  }
  assert(
    html.includes("are not listed. Please call."),
    "and the page says which days it cannot answer for",
  );
});

Deno.test("a stated closed day IS rendered as closed", () => {
  const html = renderSite({
    ...EMPTY,
    hours: [{ day: 0, closed: true, opens: null, closes: null }],
  });
  assert(html.includes("Sunday"), "the day appears");
  assert(html.includes(">Closed<"), "and says closed, because the shop said so");
});

Deno.test("a service with no price says so instead of showing a number", () => {
  const html = renderSite({
    ...EMPTY,
    services: [{ name: "Hot towel shave", price_cents: null, duration_minutes: null }],
  });
  assert(html.includes("Price on request"), "a true statement");
  assert(!html.includes("$0"), "never a free haircut");
  assert(!/\$\d/.test(html), "and no invented number anywhere");
});

Deno.test("a page with no content gets no meta description", () => {
  // A description assembled from nothing would describe a page this is not.
  assert(!renderSite(EMPTY).includes('name="description"'), "absent");
  assert(
    renderSite(FULL).includes('name="description"'),
    "present when there is content",
  );
});

// ===========================================================================
// The things the audit asked for
// ===========================================================================

Deno.test("the page answers the audit's failing findings when the data exists", () => {
  const html = renderSite(FULL);
  assert(html.includes('href="tel:7165550100"'), "tap_to_call: a real tel: link");
  assert(html.includes("https://booksy.example/elmwood"), "online_booking");
  assert(html.includes("9:00 am – 7:00 pm"), "published_hours");
  assert(html.includes("Haircut"), "services_listed");
  assert(html.includes("$35"), "pricing_published");
  assert(html.includes("742 Elmwood Ave, Buffalo, NY 14222"), "address_or_map");
  assert(html.includes("Open in maps"), "the map link");
  assert(html.includes("Instagram"), "social_linked");
  assert(html.includes('name="viewport"'), "mobile_viewport");
  assert(html.includes("<title>"), "page_title");
});

Deno.test(
  "the title carries the town, which is what local search is typed with",
  () => {
    assert(
      renderSite(FULL).includes(
        "<title>Elmwood Barber Co. — Barbershop in Buffalo</title>",
      ),
      "town in the title",
    );
    // ...and no invented town when there isn't one.
    assert(renderSite(EMPTY).includes("<title>A Shop</title>"), "no town, no claim");
  },
);

// ===========================================================================
// Escaping. Every value here is shop-supplied text going into HTML.
// ===========================================================================

Deno.test("shop text is escaped, so a shop cannot script its own page", () => {
  const html = renderSite({
    ...EMPTY,
    shop_name: "Bob's <script>alert(1)</script> Barbers",
    headline: 'A "great" cut & shave',
    services: [
      {
        name: "<img src=x onerror=alert(1)>",
        price_cents: 100,
        duration_minutes: null,
      },
    ],
  });
  assert(!html.includes("<script>alert"), "no live script tag");
  assert(!html.includes("<img src=x"), "no live img tag");
  assert(html.includes("&lt;script&gt;"), "escaped instead");
  assert(html.includes("&quot;great&quot;"), "quotes escaped");
  assert(html.includes("&amp;"), "ampersand escaped");
});

Deno.test("a javascript: URL never reaches the page", () => {
  // The database constrains booking_url and map_url, but link URLs and the
  // console preview both pass through here, so the check lives where the
  // string actually becomes an attribute.
  assertEquals(safeUrl("javascript:alert(1)"), null, "refused");
  assertEquals(safeUrl("data:text/html,<script>"), null, "refused");
  assertEquals(
    safeUrl("  https://ok.example/  "),
    "https://ok.example/",
    "trimmed and kept",
  );
  const html = renderSite({
    ...EMPTY,
    booking_url: "javascript:alert(1)",
    links: [{ kind: "instagram", url: "javascript:alert(1)" }],
  });
  assert(!html.includes("javascript:"), "nothing rendered");
  assert(!html.includes("Book now"), "and no button that would do nothing");
});

Deno.test("esc covers every character that could break out of an attribute", () => {
  assertEquals(esc(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;", "all five");
  assertEquals(esc(null), "", "null is empty, not 'null'");
});

// ===========================================================================
// Formatting helpers
// ===========================================================================

Deno.test("times render in 12-hour form, and unreadable ones render not at all", () => {
  assertEquals(formatTime("09:00:00"), "9:00 am", "morning");
  assertEquals(formatTime("19:30:00"), "7:30 pm", "evening");
  assertEquals(formatTime("00:15:00"), "12:15 am", "midnight hour");
  assertEquals(formatTime("12:00:00"), "12:00 pm", "noon");
  assertEquals(formatTime("nonsense"), null, "unparseable is null, not a guess");
  assertEquals(formatTime(null), null, "null stays null");
});

Deno.test(
  "a half-readable day is dropped rather than rendered with a dangling dash",
  () => {
    const html = renderSite({
      ...EMPTY,
      hours: [{ day: 2, closed: false, opens: "oops", closes: "19:00:00" }],
    });
    assert(!html.includes("Tuesday"), "the row is not rendered");
    assert(!html.includes("–"), "and no dangling dash anywhere");
  },
);

Deno.test("prices render whole when they are whole", () => {
  assertEquals(formatPrice(3500), "$35", "no trailing .00");
  assertEquals(formatPrice(3450), "$34.50", "cents kept");
  assertEquals(formatPrice(500), "$5", "small");
  assertEquals(formatPrice(null), null, "null is not zero");
});

Deno.test("a phone becomes a tel: href only when there is a number in it", () => {
  assertEquals(telHref("(716) 555-0100"), "7165550100", "punctuation stripped");
  assertEquals(telHref("+1 716 555 0100"), "+17165550100", "country code kept");
  assertEquals(telHref("call us!"), null, "no digits, no link");
  assertEquals(telHref("123"), null, "too short to be a phone number");
});

Deno.test("the address is built from whichever parts exist", () => {
  assertEquals(addressLine(FULL), "742 Elmwood Ave, Buffalo, NY 14222", "all parts");
  assertEquals(
    addressLine({ ...EMPTY, locality: "Buffalo" }),
    "Buffalo",
    "just the town",
  );
  assertEquals(addressLine(EMPTY), null, "nothing at all");
});

// ===========================================================================
// Completeness — what the console shows a shop about its own page
// ===========================================================================

Deno.test("completeness names what is missing rather than scoring it", () => {
  const empty = completeness(EMPTY);
  assertEquals(empty.present.length, 0, "nothing present");
  assert(empty.missing.includes("opening hours"), "hours named");
  assert(empty.missing.includes("a tap-to-call number"), "phone named");
  assertEquals(empty.empty, true, "and the page is empty");

  const full = completeness(FULL);
  assertEquals(full.empty, false, "a filled page is not empty");
  assert(full.present.includes("prices"), "prices counted as present");
  assertEquals(full.unstatedDays.length, 5, "five days still unstated");
});

Deno.test("a service list with no prices at all counts prices as missing", () => {
  const c = completeness({
    ...EMPTY,
    services: [{ name: "Haircut", price_cents: null, duration_minutes: null }],
  });
  assert(c.present.includes("a service list"), "the list is there");
  assert(c.missing.includes("prices"), "but the prices are not");
});

// ===========================================================================
// Themes
//
// The whole point of the split: a theme supplies CSS and cannot touch a word
// of content. These tests are what stops "make it look better" from quietly
// becoming "make it say more".
// ===========================================================================

Deno.test("every theme renders the SAME facts, and no theme invents one", () => {
  const bodies = THEMES.map((t) => {
    const html = renderSite({ ...FULL, theme: t.key });
    // The facts the shop actually gave, present in every look.
    for (const fact of [
      "Elmwood Barber Co.",
      "Traditional cuts on Elmwood",
      "742 Elmwood Ave, Buffalo, NY 14222",
      'href="tel:7165550100"',
      "9:00 am – 7:00 pm",
      "$35",
      "Price on request",
    ]) {
      assert(html.includes(fact), `${t.key} keeps: ${fact}`);
    }
    // And the absences stay absent.
    assert(!/\$0\b/.test(html), `${t.key} invents no free service`);
    for (const d of ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      assert(
        !html.includes(`<th scope="row">${d}</th>`),
        `${t.key} adds no unstated day`,
      );
    }
    return html.replace(/<style>[\s\S]*?<\/style>/, "");
  });

  // Strip the stylesheet and every theme must produce byte-identical markup
  // apart from the theme name on <body>. That is the guarantee stated in
  // site_themes.ts, checked rather than trusted.
  const normalised = bodies.map((b) => b.replace(/ data-theme="[a-z]+"/, ""));
  for (const b of normalised) {
    assertEquals(b, normalised[0]!, "identical markup under every theme");
  }
});

Deno.test("themes are actually different to look at", () => {
  // The counterpart to the test above: prove they are not all the same CSS
  // wearing different names, which would make the choice a lie.
  const css = THEMES.map((t) => t.css);
  assertEquals(new Set(css).size, THEMES.length, "no two themes share a stylesheet");
  for (const t of THEMES) {
    assert(t.name.trim() !== "", `${t.key} has a name to show a shop`);
    assert(t.suits.trim() !== "", `${t.key} says who it suits`);
  }
});

Deno.test("no theme reaches outside the page, because the policy forbids it", () => {
  // The page is served with default-src 'none'. A web font or a CDN icon set
  // would be silently blocked in a browser and look broken to the shop, so it
  // must not get into a stylesheet in the first place.
  for (const t of THEMES) {
    for (const forbidden of ["@import", "url(http", "//fonts.", "https://"]) {
      assert(!t.css.includes(forbidden), `${t.key} has no ${forbidden}`);
    }
  }
});

Deno.test(
  "an unknown or missing theme falls back rather than breaking the page",
  () => {
    // A configuration mistake must not take a shop's page down.
    assertEquals(themeByKey("no-such-theme").key, DEFAULT_THEME, "unknown falls back");
    assertEquals(themeByKey(null).key, DEFAULT_THEME, "null falls back");
    assertEquals(themeByKey("  FADE  ").key, "fade", "trimmed and case-insensitive");
    assert(
      renderSite({ ...FULL, theme: "nonsense" }).includes("Elmwood Barber Co."),
      "still renders",
    );
  },
);
