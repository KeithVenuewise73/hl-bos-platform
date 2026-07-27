// Deterministic website-evidence extraction (Website Assessment Collector).
//
// Pure function over HTML + response headers → structured findings. No AI here:
// these are deterministic facts. Regex-based (no DOM dependency, so it runs in
// any runtime with zero deps). AI interpretation is layered on separately and
// must reference these facts.

export interface WebsiteFindings {
  https: boolean;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  hasViewport: boolean;
  h1: string[];
  headingCounts: Record<string, number>;
  imageCount: number;
  imagesMissingAlt: number;
  links: { internal: number; external: number };
  socialLinks: Record<string, string>;
  contactSignals: { tel: boolean; mailto: boolean };
  forms: number;
  analyticsTags: string[];
  openGraph: string[];
  structuredDataTypes: string[];
  securityHeaders: string[];
  mixedContent: boolean;
}

const SOCIAL = [
  ["facebook", /facebook\.com/i],
  ["instagram", /instagram\.com/i],
  ["linkedin", /linkedin\.com/i],
  ["youtube", /youtube\.com|youtu\.be/i],
  ["tiktok", /tiktok\.com/i],
  ["yelp", /yelp\.com/i],
  ["x", /twitter\.com|x\.com/i],
  ["google_business", /g\.page|business\.google|maps\.google/i],
] as const;

const SEC_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}
function all(re: RegExp, s: string): string[] {
  return [...s.matchAll(re)].map((m) => m[0]);
}

export function extractFindings(
  html: string,
  headers: Record<string, string>,
  finalUrl: string,
): WebsiteFindings {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  let originHost = "";
  try {
    originHost = new URL(finalUrl).host;
  } catch {
    /* ignore */
  }

  const metaTags = all(/<meta\b[^>]*>/gi, html);
  const meta = (name: string) =>
    metaTags
      .map((t) =>
        new RegExp(`name\\s*=\\s*["']${name}["']`, "i").test(t)
          ? attr(t, "content")
          : null,
      )
      .find((v) => v != null) ?? null;
  const ogTags = metaTags.filter((t) => /property\s*=\s*["']og:/i.test(t));

  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonM = html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i);
  const htmlTagM = html.match(/<html\b[^>]*>/i);
  const imgs = all(/<img\b[^>]*>/gi, html);
  const anchors = all(/<a\b[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi, html);

  const links = { internal: 0, external: 0 };
  const socialLinks: Record<string, string> = {};
  let tel = false;
  let mailto = false;
  for (const a of anchors) {
    const href = attr(a, "href") ?? "";
    if (href.startsWith("tel:")) {
      tel = true;
      continue;
    }
    if (href.startsWith("mailto:")) {
      mailto = true;
      continue;
    }
    for (const [name, re] of SOCIAL)
      if (re.test(href) && !socialLinks[name]) socialLinks[name] = href;
    try {
      const u = new URL(href, finalUrl);
      if (u.host === originHost) links.internal++;
      else if (u.protocol === "http:" || u.protocol === "https:") links.external++;
    } catch {
      /* relative/junk -> count internal */ links.internal++;
    }
  }

  const analytics: string[] = [];
  if (/www\.googletagmanager\.com\/gtag|gtag\(/i.test(html))
    analytics.push("google_analytics");
  if (/GTM-[A-Z0-9]+/.test(html)) analytics.push("google_tag_manager");
  if (/connect\.facebook\.net|fbq\(/i.test(html)) analytics.push("meta_pixel");

  const ldTypes: string[] = [];
  for (const block of all(
    /<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
    html,
  )) {
    const body = block.replace(/<[^>]*>/g, "");
    for (const m of body.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) ldTypes.push(m[1]);
  }

  const https = finalUrl.startsWith("https:");
  const mixed = https && /(?:src|href)\s*=\s*["']http:\/\//i.test(html);

  return {
    https,
    title: titleM ? titleM[1].trim() : null,
    metaDescription: meta("description"),
    canonical: canonM ? attr(canonM[0], "href") : null,
    robotsMeta: meta("robots"),
    lang: htmlTagM ? attr(htmlTagM[0], "lang") : null,
    hasViewport: metaTags.some((t) => /name\s*=\s*["']viewport["']/i.test(t)),
    h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
      m[1].replace(/<[^>]*>/g, "").trim(),
    ),
    headingCounts: Object.fromEntries(
      ["h1", "h2", "h3", "h4", "h5", "h6"].map((t) => [
        t,
        all(new RegExp(`<${t}\\b`, "gi"), html).length,
      ]),
    ),
    imageCount: imgs.length,
    imagesMissingAlt: imgs.filter(
      (t) => attr(t, "alt") === null || attr(t, "alt") === "",
    ).length,
    links,
    socialLinks,
    contactSignals: { tel, mailto },
    forms: all(/<form\b/gi, html).length,
    analyticsTags: analytics,
    openGraph: ogTags.map((t) => attr(t, "property") ?? "").filter(Boolean),
    structuredDataTypes: [...new Set(ldTypes)],
    securityHeaders: SEC_HEADERS.filter((k) => k in h),
    mixedContent: mixed,
  };
}
