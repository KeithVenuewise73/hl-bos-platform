// Is this response the business's page, or something standing in front of it?
//
// A security service (Cloudflare, Imperva, Sucuri, Akamai, a CAPTCHA) can answer
// with HTTP 200 and a page of its own. Read naively, that page is "the website",
// and every check on it reports the business as missing a phone number, a
// booking link and a menu -- claims about a site nobody actually saw. The same
// goes for a page whose content is drawn entirely by JavaScript: the raw HTML is
// an empty shell, and "not found" would be a statement about the shell.
//
// Both detectors are deterministic and read only what was fetched. They never
// try to get past anything: a block is recorded as a block.

export type AccessBlockKind = "security_block" | "challenge" | "captcha";

export interface AccessBlock {
  kind: AccessBlockKind;
  /** Who is blocking, when it says so: "Cloudflare", "Imperva", ... */
  provider: string | undefined;
  /** The marker that proved it, quoted. */
  evidence: string;
}

interface Marker {
  provider: string | undefined;
  kind: AccessBlockKind;
  test: RegExp;
  label: string;
}

/** Page markers. Matched against the title and the first part of the visible text. */
const PAGE_MARKERS: Marker[] = [
  {
    provider: "Cloudflare",
    kind: "security_block",
    test: /attention required!?\s*\|\s*cloudflare/i,
    label: 'title "Attention Required! | Cloudflare"',
  },
  {
    provider: "Cloudflare",
    kind: "security_block",
    test: /sorry,? you have been blocked/i,
    label: '"Sorry, you have been blocked"',
  },
  {
    provider: "Cloudflare",
    kind: "challenge",
    test: /just a moment\.\.\./i,
    label: '"Just a moment..." interstitial',
  },
  {
    provider: "Cloudflare",
    kind: "challenge",
    test: /checking (if the site connection is secure|your browser before accessing)/i,
    label: "browser check interstitial",
  },
  {
    provider: "Cloudflare",
    kind: "challenge",
    test: /enable javascript and cookies to continue/i,
    label: '"Enable JavaScript and cookies to continue"',
  },
  {
    provider: "Imperva",
    kind: "security_block",
    test: /request unsuccessful\.?\s*incapsula/i,
    label: '"Request unsuccessful. Incapsula"',
  },
  {
    provider: "Sucuri",
    kind: "security_block",
    test: /access denied\s*-\s*sucuri website firewall/i,
    label: '"Access Denied - Sucuri Website Firewall"',
  },
  {
    provider: "Akamai",
    kind: "security_block",
    test: /access denied[\s\S]{0,200}reference\s*#\d+\.[0-9a-f]+/i,
    label: '"Access Denied ... Reference #"',
  },
  {
    provider: undefined,
    kind: "captcha",
    test: /verify (that )?you are (a )?human|are you a robot\??|complete the security check/i,
    label: "human-verification prompt",
  },
];

/** CAPTCHA widgets, by the script or frame they load. */
const CAPTCHA_SOURCES: { provider: string; test: RegExp }[] = [
  { provider: "Google reCAPTCHA", test: /google\.com\/recaptcha|recaptcha\.net/i },
  { provider: "hCaptcha", test: /hcaptcha\.com/i },
  { provider: "Cloudflare Turnstile", test: /challenges\.cloudflare\.com/i },
];

export interface ResponseView {
  status: number;
  headers: Record<string, string>;
  title: string;
  /** Visible text (or tag-stripped HTML); only the start is examined. */
  text: string;
  /** Frame / script source addresses on the page. */
  sources?: readonly string[];
  /** Number of form fields on the page other than the CAPTCHA itself. */
  otherFields?: number;
}

const header = (h: Record<string, string>, k: string) =>
  Object.entries(h).find(([n]) => n.toLowerCase() === k)?.[1];

/** A security block, challenge or CAPTCHA standing in for the page -- or undefined. */
export function detectAccessBlock(r: ResponseView): AccessBlock | undefined {
  const mitigated = header(r.headers, "cf-mitigated");
  if (mitigated)
    return {
      kind: "challenge",
      provider: "Cloudflare",
      evidence: `response header cf-mitigated: ${mitigated}`,
    };
  const head = `${r.title}\n${r.text.slice(0, 4000)}`;
  for (const m of PAGE_MARKERS)
    if (m.test.test(head))
      return {
        kind: m.kind,
        provider: m.provider,
        evidence: `${m.label} (HTTP ${r.status})`,
      };
  // A CAPTCHA widget on a page that offers almost nothing else is a gate, not a
  // contact form that happens to be protected by one.
  const tiny = r.text.replace(/\s+/g, " ").trim().length < 400;
  for (const c of CAPTCHA_SOURCES)
    if (
      (r.sources ?? []).some((s) => c.test.test(s)) &&
      tiny &&
      (r.otherFields ?? 0) <= 1
    )
      return {
        kind: "captcha",
        provider: c.provider,
        evidence: `${c.provider} widget on a page with almost no other content (HTTP ${r.status})`,
      };
  return undefined;
}

/** Visible text of an HTML document, roughly: scripts, styles and tags removed. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The raw HTML carries almost no readable content but does load scripts: the
 * page is drawn by JavaScript, so a plain fetch cannot see what a visitor sees.
 */
export function looksScriptRendered(html: string): {
  scriptRendered: boolean;
  evidence: string;
} {
  const text = visibleText(html);
  const scripts = (html.match(/<script\b/gi) ?? []).length;
  const links = (html.match(/<a\b[^>]*href=/gi) ?? []).length;
  const scriptRendered = text.length < 250 && scripts > 0 && links < 3;
  return {
    scriptRendered,
    evidence: `${text.length} characters of readable text, ${links} link(s) and ${scripts} script(s) in the raw HTML`,
  };
}
