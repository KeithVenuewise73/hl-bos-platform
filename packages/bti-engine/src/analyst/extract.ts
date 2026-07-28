// Website evidence extractor — a faithful Node/browser mirror of the CP5 edge
// scanner (`supabase/functions/_shared/discovery/extract.ts`). Pure, regex-based
// (no DOM), so it runs anywhere. It reads REAL signals from a page's HTML; it
// invents nothing. This is the observable evidence the analyst reasons over.

export interface SiteEvidence {
  url: string;
  https: boolean;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  hasViewport: boolean;
  lang: string | null;
  h1Count: number;
  headingCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  socialLinks: string[];
  hasTel: boolean;
  hasMailto: boolean;
  hasAddressSignal: boolean;
  forms: number;
  analyticsTags: string[];
  openGraphCount: number;
  structuredDataTypes: string[];
  canonical: boolean;
  robotsMeta: string | null;
  wordCount: number;
}

const SOCIAL = [
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "x.com",
  "youtube",
  "tiktok",
];
const ANALYTICS: [string, RegExp][] = [
  [
    "Google Analytics",
    /gtag\(|googletagmanager|google-analytics|ga\.js|analytics\.js/i,
  ],
  ["Meta Pixel", /fbq\(|connect\.facebook\.net\/[^"']*fbevents/i],
  ["Hotjar", /hotjar/i],
  ["Segment", /cdn\.segment\.com/i],
];

function attr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m && m[1] !== undefined ? m[1].trim() : null;
}
function count(html: string, re: RegExp): number {
  const m = html.match(re);
  return m ? m.length : 0;
}

export function analyzeHtml(html: string, url: string): SiteEvidence {
  const https = url.trim().toLowerCase().startsWith("https://");

  const title = attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    attr(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const robotsMeta = attr(
    html,
    /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i,
  );
  const lang = attr(html, /<html[^>]+lang=["']([^"']*)["']/i);
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);

  const h1Count = count(html, /<h1[\s>]/gi);
  const headingCount = count(html, /<h[1-6][\s>]/gi);
  const imageCount = count(html, /<img[\s>]/gi);
  const imgTags = html.match(/<img[^>]*>/gi) ?? [];
  const imagesMissingAlt = imgTags.filter((t) => !/\balt\s*=/i.test(t)).length;

  const links = html.match(/<a[^>]+href=["']([^"']+)["']/gi) ?? [];
  let internalLinks = 0;
  let externalLinks = 0;
  const social = new Set<string>();
  for (const l of links) {
    const href = (l.match(/href=["']([^"']+)["']/i)?.[1] ?? "").toLowerCase();
    if (href.startsWith("http")) {
      externalLinks++;
      for (const s of SOCIAL)
        if (href.includes(s)) social.add(s === "x.com" ? "twitter" : s);
    } else if (
      href &&
      !href.startsWith("#") &&
      !href.startsWith("mailto") &&
      !href.startsWith("tel")
    ) {
      internalLinks++;
    }
  }

  const hasTel = /href=["']tel:/i.test(html);
  const hasMailto = /href=["']mailto:/i.test(html);
  const hasAddressSignal =
    /<address[\s>]/i.test(html) ||
    /\b\d{1,5}\s+[A-Za-z0-9.\s]+\b(street|st\.|avenue|ave\.|road|rd\.|blvd|suite|ste)\b/i.test(
      html,
    );
  const forms = count(html, /<form[\s>]/gi);

  const analyticsTags = ANALYTICS.filter(([, re]) => re.test(html)).map(([n]) => n);
  const openGraphCount = count(html, /<meta[^>]+property=["']og:/gi);
  const structuredDataTypes: string[] = [];
  for (const m of html.matchAll(/"@type"\s*:\s*"([^"]+)"/gi))
    if (m[1]) structuredDataTypes.push(m[1]);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = text ? text.split(" ").length : 0;

  return {
    url,
    https,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    hasViewport,
    lang,
    h1Count,
    headingCount,
    imageCount,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    socialLinks: [...social],
    hasTel,
    hasMailto,
    hasAddressSignal,
    forms,
    analyticsTags,
    openGraphCount,
    structuredDataTypes: [...new Set(structuredDataTypes)],
    canonical,
    robotsMeta,
    wordCount,
  };
}
