// Conversion detectors: can a customer call, book, order, see a menu, see
// prices or get directions from this homepage?
//
// These sit beside the existing scanner's extractFindings (title, meta, tel:,
// mailto:, forms, social links, analytics, structured data) and only add what
// it does not cover. Every detection is evidence-based: it records the exact
// link or snippet it saw. Not seeing something on the homepage is reported as
// "not found on the homepage", never as "the business does not have it".

import type { ConversionKey } from "./verticals.ts";

export type VendorCategory =
  "booking" | "ordering" | "reservations" | "registration" | "quote";

export interface VendorSpec {
  id: string;
  name: string;
  category: VendorCategory;
  /** Matched against link and embed addresses only, never page prose. */
  pattern: RegExp;
}

/** Conservative: a vendor counts only when its own domain is linked or embedded. */
export const VENDORS: VendorSpec[] = [
  // Booking / appointments
  { id: "vagaro", name: "Vagaro", category: "booking", pattern: /(^|\.)vagaro\.com\b/ },
  { id: "booksy", name: "Booksy", category: "booking", pattern: /(^|\.)booksy\.com\b/ },
  {
    id: "mindbody",
    name: "Mindbody",
    category: "booking",
    pattern: /(^|\.)(mindbodyonline\.com|mindbody\.io|healcode\.com)\b/,
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "booking",
    pattern: /(^|\.)calendly\.com\b/,
  },
  {
    id: "acuity",
    name: "Acuity Scheduling",
    category: "booking",
    pattern: /(^|\.)(acuityscheduling\.com|as\.me)\b/,
  },
  {
    id: "square_appointments",
    name: "Square Appointments",
    category: "booking",
    pattern: /(squareup\.com\/appointments|square\.site\/book|book\.squareup\.com)/,
  },
  {
    id: "schedulicity",
    name: "Schedulicity",
    category: "booking",
    pattern: /(^|\.)schedulicity\.com\b/,
  },
  {
    id: "styleseat",
    name: "StyleSeat",
    category: "booking",
    pattern: /(^|\.)styleseat\.com\b/,
  },
  {
    id: "glossgenius",
    name: "GlossGenius",
    category: "booking",
    pattern: /(^|\.)glossgenius\.com\b/,
  },
  { id: "fresha", name: "Fresha", category: "booking", pattern: /(^|\.)fresha\.com\b/ },
  {
    id: "setmore",
    name: "Setmore",
    category: "booking",
    pattern: /(^|\.)setmore\.com\b/,
  },
  {
    id: "boulevard",
    name: "Boulevard",
    category: "booking",
    pattern: /(^|\.)(joinblvd\.com|blvd\.co)\b/,
  },
  // Online ordering
  {
    id: "toast",
    name: "Toast",
    category: "ordering",
    pattern: /(^|\.)toasttab\.com\b/,
  },
  {
    id: "square_online",
    name: "Square Online ordering",
    category: "ordering",
    pattern: /(square\.site\/(?!book)|squareup\.com\/(store|order))/,
  },
  {
    id: "clover",
    name: "Clover online ordering",
    category: "ordering",
    pattern: /clover\.com\/(online-ordering|order)/,
  },
  {
    id: "doordash",
    name: "DoorDash",
    category: "ordering",
    pattern: /(^|\.)doordash\.com\b/,
  },
  {
    id: "ubereats",
    name: "Uber Eats",
    category: "ordering",
    pattern: /(^|\.)ubereats\.com\b/,
  },
  {
    id: "grubhub",
    name: "Grubhub",
    category: "ordering",
    pattern: /(^|\.)grubhub\.com\b/,
  },
  {
    id: "chownow",
    name: "ChowNow",
    category: "ordering",
    pattern: /(^|\.)chownow\.com\b/,
  },
  {
    id: "slice",
    name: "Slice",
    category: "ordering",
    pattern: /(^|\.)slicelife\.com\b/,
  },
  // Reservations
  {
    id: "opentable",
    name: "OpenTable",
    category: "reservations",
    pattern: /(^|\.)opentable\.com\b/,
  },
  { id: "resy", name: "Resy", category: "reservations", pattern: /(^|\.)resy\.com\b/ },
  {
    id: "tock",
    name: "Tock",
    category: "reservations",
    pattern: /(^|\.)exploretock\.com\b/,
  },
  // Youth sports registration
  {
    id: "leagueapps",
    name: "LeagueApps",
    category: "registration",
    pattern: /(^|\.)leagueapps\.com\b/,
  },
  {
    id: "sportsengine",
    name: "SportsEngine",
    category: "registration",
    pattern: /(^|\.)(sportsengine\.com|sportngin\.com)\b/,
  },
  {
    id: "teamsnap",
    name: "TeamSnap",
    category: "registration",
    pattern: /(^|\.)teamsnap\.com\b/,
  },
  {
    id: "gotsport",
    name: "GotSport",
    category: "registration",
    pattern: /(^|\.)gotsport\.com\b/,
  },
  {
    id: "playmetrics",
    name: "PlayMetrics",
    category: "registration",
    pattern: /(^|\.)playmetrics\.com\b/,
  },
  {
    id: "demosphere",
    name: "Demosphere",
    category: "registration",
    pattern: /(^|\.)demosphere(-secure)?\.com\b/,
  },
  {
    id: "jerseywatch",
    name: "Jersey Watch",
    category: "registration",
    pattern: /(^|\.)jerseywatch\.com\b/,
  },
  // Contractor quote / booking tools
  {
    id: "housecallpro",
    name: "Housecall Pro",
    category: "quote",
    pattern: /(^|\.)housecallpro\.com\b/,
  },
  {
    id: "jobber",
    name: "Jobber",
    category: "quote",
    pattern: /(^|\.)getjobber\.com\b/,
  },
  {
    id: "servicetitan",
    name: "ServiceTitan",
    category: "quote",
    pattern: /(^|\.)servicetitan\.com\b/,
  },
];

export interface Detection {
  found: boolean;
  /** The link, embed or snippet that proves it (truncated), when found. */
  evidence: string | undefined;
}

export interface ConversionDetections {
  vendors: { id: string; name: string; category: VendorCategory; evidence: string }[];
  /** Per capability. call/email/form come from extractFindings and are filled in by website.ts. */
  capabilities: Partial<Record<ConversionKey, Detection>>;
  /**
   * Observations recorded only for verticals that ask for them. None is ever
   * scored: testimonials, statistics and placeholder-looking contact details
   * can be SEEN on a page, but whether they are true cannot.
   */
  observations: {
    serviceArea: Detection;
    testimonials: Detection;
    /** Statistic-style claims ("$2.4M+ saved", "98% retention", "200+ clients"). */
    claims: Detection;
    /** Phone numbers in the fictional 555 exchange (e.g. 716-555-0142). */
    placeholderPhones: Detection;
    /** A privacy-policy link (only meaningful when the page collects data). */
    privacy: Detection;
  };
  copyrightYear: number | undefined;
}

interface Link {
  href: string;
  text: string;
  /** A navigation or button label (<= 5 words), not a sentence or a brand line. */
  short: boolean;
}

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

function links(html: string): Link[] {
  const out: Link[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1] ?? "").match(/href\s*=\s*["']([^"']*)["']/i)?.[1];
    if (href) {
      const text = stripTags(m[2] ?? "").toLowerCase();
      out.push({
        href: href.trim(),
        text,
        short: text.split(" ").length <= 5 && text.length <= 40,
      });
    }
  }
  return out;
}

function embeds(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /<(?:iframe|script|form|img)\b[^>]*(?:src|action)\s*=\s*["']([^"']+)["']/gi,
  ))
    if (m[1]) out.push(m[1].trim());
  return out;
}

const hostAndPath = (u: string) => {
  try {
    const x = new URL(u, "https://placeholder.invalid/");
    return (x.hostname + x.pathname + x.search).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};

/** Visible heading texts (h1-h4), lower-cased. */
function headings(html: string): string[] {
  return [...html.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) =>
    stripTags(m[2] ?? "").toLowerCase(),
  );
}

/** A short link whose text matches, a link address that matches, or a heading. */
function linkOrHeading(
  ls: Link[],
  hs: string[],
  text: RegExp,
  href: RegExp | undefined,
  what: string,
): Detection {
  const link = firstLink(
    ls,
    (l) => (text.test(l.text) && l.short) || (href !== undefined && href.test(l.href)),
  );
  if (link.found) return link;
  const h = hs.find((x) => text.test(x) && x.split(" ").length <= 8);
  return h
    ? { found: true, evidence: clip(`a “${h}” ${what} heading on the homepage`) }
    : link;
}

function firstLink(ls: Link[], test: (l: Link) => boolean): Detection {
  const l = ls.find(test);
  return l
    ? { found: true, evidence: clip(`link "${l.text || l.href}" → ${l.href}`) }
    : { found: false, evidence: undefined };
}

/** Detect conversion capabilities and vendors on one homepage. */
export function detectConversion(html: string, now: Date): ConversionDetections {
  const ls = links(html);
  const addresses = [...ls.map((l) => l.href), ...embeds(html)];
  const text = stripTags(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "));

  const vendors: ConversionDetections["vendors"] = [];
  for (const v of VENDORS) {
    const hit = addresses.find((a) => v.pattern.test(hostAndPath(a)));
    if (hit)
      vendors.push({
        id: v.id,
        name: v.name,
        category: v.category,
        evidence: clip(hit),
      });
  }
  const vendorDetection = (cats: VendorCategory[]): Detection | undefined => {
    const v = vendors.find((x) => cats.includes(x.category));
    return v ? { found: true, evidence: `${v.name}: ${v.evidence}` } : undefined;
  };

  const booking =
    vendorDetection(["booking", "reservations"]) ??
    firstLink(
      ls,
      (l) =>
        /\b(book (now|online|an appointment|a table|your)|schedule (now|online|an appointment)|make an appointment|request an appointment|reserve( a table| now)?|reservations?)\b/.test(
          l.text,
        ) && l.short,
    );

  const ordering =
    vendorDetection(["ordering"]) ??
    firstLink(
      ls,
      (l) =>
        /\b(order (online|now|here|pickup|delivery|food)|online ordering|start (an|your) order)\b/.test(
          l.text,
        ) && l.short,
    );

  const menuLink = firstLink(
    ls,
    (l) =>
      (/^(our |view |see |food |drink |dinner |lunch |full |the )?menus?( ?[&+]? ?(drinks?|prices?))?$/.test(
        l.text,
      ) &&
        l.short) ||
      /\/menus?(\.pdf|\/|$|\?|#|-)/i.test(l.href) ||
      /menu[^/]*\.pdf$/i.test(l.href),
  );
  const menu = menuLink.found
    ? menuLink
    : /<h[1-3][^>]*>\s*(our )?menu\s*<\/h[1-3]>/i.test(html)
      ? { found: true, evidence: "a “Menu” heading on the homepage" }
      : menuLink;

  const priceMentions = text.match(/\$\s?\d{1,4}(?:\.\d{2})?\b/g) ?? [];
  const pricingLink = firstLink(
    ls,
    (l) =>
      (/\b(pricing|prices|price list|rates|fees|tuition|packages)\b/.test(l.text) &&
        l.short) ||
      /\/(pricing|prices|rates|fees|tuition)\b/i.test(l.href),
  );
  const pricing = pricingLink.found
    ? pricingLink
    : priceMentions.length >= 3
      ? {
          found: true,
          evidence: `${priceMentions.length} prices shown, e.g. ${priceMentions.slice(0, 3).join(", ")}`,
        }
      : pricingLink;

  const servicesLink = firstLink(
    ls,
    (l) =>
      (/\b(services|what we do|our work|programs|classes|lessons|treatments)\b/.test(
        l.text,
      ) &&
        l.short) ||
      /\/(services|programs|classes)\b/i.test(l.href),
  );
  const services = servicesLink.found
    ? servicesLink
    : /<h[1-3][^>]*>[^<]*\b(our services|services|what we do|programs)\b[^<]*<\/h[1-3]>/i.test(
          html,
        )
      ? { found: true, evidence: "a services/programs heading on the homepage" }
      : servicesLink;

  const mapAddress = addresses.find((a) =>
    /(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|bing\.com\/maps|mapquest\.com)/i.test(
      a,
    ),
  );
  const directions = mapAddress
    ? { found: true, evidence: clip(`map or directions link: ${mapAddress}`) }
    : firstLink(
        ls,
        (l) =>
          /\b(directions|get directions|find us|location|map)\b/.test(l.text) &&
          l.short,
      );

  const registration =
    vendorDetection(["registration"]) ??
    firstLink(
      ls,
      (l) =>
        /\b(register|registration|sign ?up|join (the|our) (team|league|club)|tryouts?)\b/.test(
          l.text,
        ) && l.short,
    );

  const quote =
    vendorDetection(["quote"]) ??
    firstLink(
      ls,
      (l) =>
        /\b(free (estimate|quote)|get a quote|request (a )?(quote|estimate)|estimate)\b/.test(
          l.text,
        ) && l.short,
    );

  // Professional-services signals. Each records exactly what was seen.
  const hs = headings(html);
  const consultation =
    vendorDetection(["booking"]) ??
    firstLink(
      ls,
      (l) =>
        /\b(consultations?|consult|assessments?|discovery call|strategy (call|session)|(book|schedule|request) (a |an |your )?(call|meeting)|get a proposal|request (a )?proposal|talk to (us|an? (expert|advisor|consultant)))\b/.test(
          l.text,
        ) && l.short,
    );
  const industries = linkOrHeading(
    ls,
    hs,
    /\b(industries( we serve)?|who we serve|sectors( we serve)?|clients we serve|markets we serve)\b/,
    /\/(industries|sectors|who-we-serve)\b/i,
    "industries",
  );
  const about = linkOrHeading(
    ls,
    hs,
    /^(about( us)?|our story|who we are|our team|meet the team|leadership|our leadership|about [a-z0-9 &'.-]{2,40})$/,
    /\/(about|our-story|team|leadership)(\.html?)?(\/|$|[?#])/i,
    "about",
  );
  const process = linkOrHeading(
    ls,
    hs,
    /\b(how we work|our process|our approach|how it works|our methodology|methodology|engagement process|a proven methodology)\b/,
    /\/(process|approach|how-we-work|how-it-works|methodology)\b/i,
    "process",
  );
  const proof = linkOrHeading(
    ls,
    hs,
    /\b(case stud(y|ies)|portfolio|our work|client results|success stories|results|projects)\b/,
    /\/(case-stud(y|ies)|portfolio|our-work|results|projects)\b/i,
    "proof",
  );
  const serviceAreaText = text.match(
    /\b(?:[Ss]ervice [Aa]reas?|[Aa]reas [Ww]e [Ss]erve|[Ss]erving (?:the )?[A-Z][A-Za-z.&–' -]{2,60}|[Nn]ationwide|[Aa]ll 48 (?:[Cc]ontinental )?[Ss]tates)/,
  );
  const serviceArea: Detection = serviceAreaText
    ? { found: true, evidence: clip(`“${serviceAreaText[0].trim()}” on the homepage`) }
    : { found: false, evidence: undefined };
  const testimonialHeading = hs.find((h) =>
    /\b(testimonials?|what (our )?clients say|what our customers say|client reviews|kind words)\b/.test(
      h,
    ),
  );
  const quotes = (html.match(/<blockquote\b/gi) ?? []).length;
  const testimonials: Detection = testimonialHeading
    ? {
        found: true,
        evidence: clip(`a “${testimonialHeading}” section on the homepage`),
      }
    : quotes > 0
      ? { found: true, evidence: `${quotes} quotation block(s) on the homepage` }
      : { found: false, evidence: undefined };
  const claimMatches = [
    ...text.matchAll(
      /(\$\s?\d[\d.,]*\s?(?:[KMB]\b|million|billion)\+?|\b\d{1,3}(?:\.\d+)?%|\b\d{2,}\+\s?(?:[a-z]+\s){0,2}(?:clients|customers|engagements|projects|years|businesses|companies|locations|vehicles)|\b\d{1,3}\s?(?:years?|yrs)\b(?: of)?(?:\s[a-z]+){0,2}\s(?:experience|leadership|in business))/gi,
    ),
  ].map((m) => m[0].trim());
  const claims: Detection = claimMatches.length
    ? {
        found: true,
        evidence: clip(
          `${claimMatches.length} statistic-style claim(s), e.g. ${[...new Set(claimMatches)].slice(0, 4).join("; ")}`,
          200,
        ),
      }
    : { found: false, evidence: undefined };
  const phones = [
    ...new Set(
      [
        ...ls.filter((l) => /^tel:/i.test(l.href)).map((l) => l.href.slice(4)),
        ...(text.match(/\(?\b\d{3}\)?[-. ]?555[-. ]?\d{4}\b/g) ?? []),
      ].filter((p) => /(^|\D)555\D?\d{4}$/.test(p.replace(/\s/g, ""))),
    ),
  ];
  const placeholderPhones: Detection = phones.length
    ? {
        found: true,
        evidence: clip(
          `phone number(s) in the 555 exchange, which is reserved for fiction and examples: ${phones.slice(0, 3).join(", ")}`,
          200,
        ),
      }
    : { found: false, evidence: undefined };
  const privacy = firstLink(
    ls,
    (l) =>
      (/\bprivacy\b/.test(l.text) && l.short) || /\/privacy(-policy)?\b/i.test(l.href),
  );

  // Copyright year. A year written by script (getFullYear) is current by
  // construction, so it cannot be judged from the static HTML.
  let copyrightYear: number | undefined;
  const thisYear = now.getUTCFullYear();
  for (const m of text.matchAll(
    /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–—]\s*)?((?:19|20)\d{2})/gi,
  )) {
    const y = Number(m[1]);
    if (y <= thisYear && (copyrightYear === undefined || y > copyrightYear))
      copyrightYear = y;
  }

  return {
    vendors,
    capabilities: {
      booking,
      ordering,
      menu,
      pricing,
      services,
      directions,
      registration,
      // A quote tool or quote link also counts as a form for contractors;
      // website.ts merges it with the <form> count.
      form: quote,
      consultation,
      industries,
      about,
      process,
      proof,
    },
    observations: { serviceArea, testimonials, claims, placeholderPhones, privacy },
    copyrightYear,
  };
}
