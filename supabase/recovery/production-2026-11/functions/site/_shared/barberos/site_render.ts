// The owned-website renderer: a shop's stored facts -> one HTML page.
//
// Pure. Content in, HTML out. No network, no clock, no database, no template
// engine — so the same function runs in the Control Center's preview, in a
// static export, and in any future server, and produces the same bytes.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
// A section appears only when there is real content for it. There is no
// placeholder copy, no "Coming soon", no sample menu, no stock hours. A
// generated page for a real business is exactly where invented content does
// damage: wrong opening hours send a customer to a locked door, and the SHOP
// takes the review for it, not us.
//
// So:
//   * a day with no stored row is NOT rendered as "Closed" — it is absent, and
//     the hours block says which days the shop has not given
//   * a service with no price renders "Price on request", never a number
//   * no phone means no call button, rather than a dead one
//   * an empty page renders as an empty page, and says so
//
// ESCAPING. Every value is shop-supplied text going into HTML. `esc()` is
// applied at every interpolation without exception; URLs additionally have to
// survive `safeUrl()`, which permits only http and https, so a
// `javascript:` booking link cannot become a script on the shop's own page.

export interface SiteHours {
  /** 0 = Sunday, matching PostgreSQL's extract(dow). */
  day: number;
  closed: boolean;
  /** "09:00:00" as stored. Absent when the day is closed. */
  opens: string | null;
  closes: string | null;
}

export interface SiteService {
  name: string;
  /** null means the shop did not give a price. Never rendered as a number. */
  price_cents: number | null;
  duration_minutes: number | null;
}

export interface SiteLink {
  kind: string;
  url: string;
}

export interface SiteContent {
  slug: string;
  status: string;
  shop_name: string | null;
  headline: string | null;
  about: string | null;
  phone: string | null;
  address_line1: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  map_url: string | null;
  booking_url: string | null;
  hours: SiteHours[];
  services: SiteService[];
  links: SiteLink[];
}

export const RENDERER_VERSION = "barberos-site-0.1.0";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const LINK_LABEL: Readonly<Record<string, string>> = {
  instagram: "Instagram",
  facebook: "Facebook",
  google_business: "Google",
  tiktok: "TikTok",
  yelp: "Yelp",
  x: "X",
};

/** HTML-escape. Applied at EVERY interpolation, without exception. */
export function esc(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A URL, or null.
 *
 * Only http and https survive. The database already constrains booking_url and
 * map_url, but this page also renders link URLs and runs in the console's
 * preview, so the check is repeated where the string actually becomes an
 * attribute. A `javascript:` URL on a shop's own page is a script on a domain
 * the shop is telling its customers to trust.
 */
export function safeUrl(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

/** A phone number reduced to what tel: accepts. Null when nothing is left. */
export function telHref(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const digits = v.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}

/** "09:00:00" -> "9:00 am". Returns null for anything it cannot read. */
export function formatTime(t: string | null): string | null {
  if (t === null) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (m === null) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (h < 0 || h > 23) return null;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

/** Cents -> "$35" or "$34.50". Null stays null; it is never turned into 0. */
export function formatPrice(cents: number | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null;
  const whole = Math.floor(cents / 100);
  const rem = cents % 100;
  return rem === 0 ? `$${whole}` : `$${whole}.${String(rem).padStart(2, "0")}`;
}

/** The address as one line, from whichever parts exist. Null when none do. */
export function addressLine(c: SiteContent): string | null {
  const cityBits = [c.locality, c.region].filter((x) => x && x.trim() !== "");
  const tail = [cityBits.join(", "), c.postal_code]
    .filter((x) => x && x.trim() !== "")
    .join(" ");
  const parts = [c.address_line1, tail].filter((x) => x && x.trim() !== "");
  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * What the page can and cannot say, before rendering it.
 *
 * The console shows this so a shop can see what is still missing without
 * having to read the page and guess why a section is not there.
 */
export interface SiteCompleteness {
  present: string[];
  missing: string[];
  /** Days 0-6 the shop has not stated at all. */
  unstatedDays: number[];
  /** True when the page has nothing a customer could act on. */
  empty: boolean;
}

export function completeness(c: SiteContent): SiteCompleteness {
  const present: string[] = [];
  const missing: string[] = [];
  const check = (ok: boolean, label: string) =>
    ok ? present.push(label) : missing.push(label);

  check(!!c.headline?.trim(), "a headline");
  check(!!c.about?.trim(), "an about section");
  check(addressLine(c) !== null, "an address");
  check(telHref(c.phone) !== null, "a tap-to-call number");
  check(safeUrl(c.booking_url) !== null, "a booking link");
  check(safeUrl(c.map_url) !== null, "a map link");
  check(c.hours.length > 0, "opening hours");
  check(c.services.length > 0, "a service list");
  check(
    c.services.some((s) => s.price_cents !== null),
    "prices",
  );
  check(c.links.length > 0, "a social link");

  const stated = new Set(c.hours.map((h) => h.day));
  const unstatedDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !stated.has(d));

  return {
    present,
    missing,
    unstatedDays,
    empty:
      telHref(c.phone) === null &&
      safeUrl(c.booking_url) === null &&
      c.hours.length === 0 &&
      c.services.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Sections
//
// Each returns "" when it has nothing real to show. The page is the
// concatenation of whatever is left, which is how "no invented content"
// becomes structural rather than a habit.
// ---------------------------------------------------------------------------

function hoursSection(c: SiteContent): string {
  if (c.hours.length === 0) return "";
  const rows = [...c.hours]
    .sort((a, b) => a.day - b.day)
    .map((h) => {
      const name = DAY_NAMES[h.day] ?? `Day ${h.day}`;
      if (h.closed) {
        return `<tr><th scope="row">${esc(name)}</th><td class="closed">Closed</td></tr>`;
      }
      const o = formatTime(h.opens);
      const cl = formatTime(h.closes);
      // The database forbids a half-open day, but a value it cannot parse must
      // not render as "9:00 – " with a dangling dash.
      if (o === null || cl === null) return "";
      return `<tr><th scope="row">${esc(name)}</th><td>${esc(o)} – ${esc(cl)}</td></tr>`;
    })
    .join("");
  if (rows === "") return "";

  // Days the shop has not stated are NOT shown as closed. Saying nothing is
  // the honest render of having said nothing.
  const stated = new Set(c.hours.map((h) => h.day));
  const unstated = [0, 1, 2, 3, 4, 5, 6].filter((d) => !stated.has(d));
  const note =
    unstated.length === 0
      ? ""
      : `<p class="note">Hours for ${unstated
          .map((d) => esc(DAY_NAMES[d] ?? String(d)))
          .join(", ")} are not listed. Please call.</p>`;

  return `<section id="hours"><h2>Hours</h2><table class="hours">${rows}</table>${note}</section>`;
}

function servicesSection(c: SiteContent): string {
  if (c.services.length === 0) return "";
  const rows = c.services
    .map((s) => {
      const price = formatPrice(s.price_cents);
      const dur =
        s.duration_minutes === null
          ? ""
          : `<span class="dur">${esc(String(s.duration_minutes))} min</span>`;
      // "Price on request" is a true statement. A number here would not be.
      const priceCell =
        price === null
          ? `<td class="price muted">Price on request</td>`
          : `<td class="price">${esc(price)}</td>`;
      return `<tr><th scope="row">${esc(s.name)}${dur}</th>${priceCell}</tr>`;
    })
    .join("");
  return `<section id="services"><h2>Services</h2><table class="services">${rows}</table></section>`;
}

function findUsSection(c: SiteContent): string {
  const addr = addressLine(c);
  const map = safeUrl(c.map_url);
  if (addr === null && map === null) return "";
  const line = addr === null ? "" : `<p class="addr">${esc(addr)}</p>`;
  const link =
    map === null
      ? ""
      : `<p><a class="map" href="${esc(map)}" rel="noopener noreferrer" target="_blank">Open in maps</a></p>`;
  return `<section id="find-us"><h2>Find us</h2>${line}${link}</section>`;
}

function aboutSection(c: SiteContent): string {
  const about = c.about?.trim();
  if (!about) return "";
  // Shop-written prose. Paragraph breaks are honoured; nothing else is, because
  // anything else would mean rendering shop input as markup.
  const paras = about
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join("");
  return `<section id="about"><h2>About</h2>${paras}</section>`;
}

function linksSection(c: SiteContent): string {
  const items = c.links
    .map((l) => {
      const url = safeUrl(l.url);
      if (url === null) return "";
      const label = LINK_LABEL[l.kind] ?? l.kind;
      return `<li><a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(label)}</a></li>`;
    })
    .filter((x) => x !== "")
    .join("");
  if (items === "") return "";
  return `<section id="elsewhere"><h2>Elsewhere</h2><ul class="links">${items}</ul></section>`;
}

function actions(c: SiteContent): string {
  const tel = telHref(c.phone);
  const book = safeUrl(c.booking_url);
  const parts: string[] = [];
  if (book !== null) {
    parts.push(
      `<a class="btn primary" href="${esc(book)}" rel="noopener noreferrer" target="_blank">Book now</a>`,
    );
  }
  if (tel !== null) {
    // The audit's `tap_to_call` finding, answered: a real tel: link, so a
    // phone visitor taps once instead of copying digits by hand.
    parts.push(`<a class="btn" href="tel:${esc(tel)}">Call ${esc(c.phone ?? "")}</a>`);
  }
  return parts.length === 0 ? "" : `<div class="actions">${parts.join("")}</div>`;
}

const CSS = `:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
color:#16181d;background:#fff}
.wrap{max-width:680px;margin:0 auto;padding:40px 20px 72px}
header{border-bottom:1px solid #e6e8eb;padding-bottom:22px;margin-bottom:8px}
h1{margin:0;font-size:30px;letter-spacing:-.4px}
.tagline{margin:8px 0 0;font-size:17px;color:#4a5058}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 0}
.btn{display:inline-block;padding:11px 18px;border-radius:8px;border:1px solid #c9ced6;
text-decoration:none;color:#16181d;font-size:15px}
.btn.primary{background:#16181d;border-color:#16181d;color:#fff}
section{margin:34px 0 0}
h2{font-size:13px;letter-spacing:.9px;text-transform:uppercase;color:#6b7280;margin:0 0 10px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-weight:500;padding:8px 0;border-bottom:1px solid #f0f1f3}
td{text-align:right;padding:8px 0;border-bottom:1px solid #f0f1f3}
.closed{color:#6b7280}
.muted{color:#6b7280}
.dur{color:#6b7280;font-weight:400;font-size:14px;margin-left:8px}
.price{font-variant-numeric:tabular-nums}
.addr{margin:0;font-size:16px}
.note{margin:10px 0 0;font-size:14px;color:#6b7280}
.links{list-style:none;padding:0;margin:0;display:flex;gap:14px;flex-wrap:wrap}
.links a{color:#16181d}
footer{margin:44px 0 0;padding-top:18px;border-top:1px solid #e6e8eb;font-size:13px;color:#6b7280}
.empty{margin:34px 0 0;padding:18px;border:1px dashed #c9ced6;border-radius:10px;color:#6b7280}
@media (prefers-color-scheme:dark){
body{background:#0f1115;color:#e8eaed}
header,footer{border-color:#252a31}
th,td{border-color:#1c2027}
.tagline,.closed,.muted,.dur,.note,h2,footer{color:#9aa3ae}
.btn{border-color:#333a44;color:#e8eaed}
.btn.primary{background:#e8eaed;border-color:#e8eaed;color:#0f1115}
.links a{color:#e8eaed}
.empty{border-color:#333a44}}`;

/**
 * The whole page.
 *
 * `shop_name` is the only thing treated as required, because a page has to say
 * whose it is. Everything else appears if it exists and is absent if it does
 * not — including, in the limit, a page with nothing on it, which renders as a
 * page that says it has nothing on it rather than as a page of filler.
 */
export function renderSite(c: SiteContent): string {
  const name = c.shop_name?.trim() || c.headline?.trim() || "This shop";
  const state = completeness(c);

  const body = [
    aboutSection(c),
    hoursSection(c),
    servicesSection(c),
    findUsSection(c),
    linksSection(c),
  ].join("");

  const emptyNotice = state.empty
    ? `<p class="empty">This page has not been filled in yet. There is nothing here a
customer could act on, which is why it has not been published.</p>`
    : "";

  // The description is built only from things that exist. No description at all
  // beats one that describes a page this is not.
  const descBits = [
    c.headline?.trim(),
    addressLine(c),
    c.services.length > 0
      ? `Services: ${c.services.map((s) => s.name).join(", ")}`
      : null,
  ].filter((x): x is string => !!x);
  const description =
    descBits.length === 0
      ? ""
      : `<meta name="description" content="${esc(descBits.join(" · ").slice(0, 300))}">`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}${c.locality ? ` — Barbershop in ${esc(c.locality)}` : ""}</title>
${description}
<meta name="generator" content="${esc(RENDERER_VERSION)}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${esc(name)}</h1>
${c.headline?.trim() ? `<p class="tagline">${esc(c.headline.trim())}</p>` : ""}
${actions(c)}
</header>
${body}
${emptyNotice}
<footer>${esc(name)}${addressLine(c) ? ` · ${esc(addressLine(c) ?? "")}` : ""}</footer>
</div>
</body>
</html>`;
}
