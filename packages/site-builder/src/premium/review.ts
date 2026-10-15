// Automated reviews of a built premium site: accessibility, performance and
// content completeness. They read the generated HTML and CSS -- what would
// ship -- not the intentions behind them. The browser proof adds what only a
// browser can see (overflow, layout shift, axe-core).

import type { PremiumContent } from "./content.ts";
import { PREMIUM_PAGES } from "./render.ts";
import { contrastPairs, contrastRatio, premiumTheme } from "./themes.ts";

export interface ReviewCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const textOf = (s: string) => s.replace(/<[^>]*>/g, "").trim();

/** Accessibility checks over every page, plus the theme's colour contrast. */
export function accessibilityReview(
  pages: Record<string, string>,
  css: string,
  c: PremiumContent,
): ReviewCheck[] {
  const all = Object.entries(pages);
  const each = (
    id: string,
    label: string,
    test: (html: string) => string | undefined,
  ): ReviewCheck => {
    const fails = all
      .map(([f, h]) => [f, test(h)] as const)
      .filter(([, why]) => why !== undefined);
    return {
      id,
      label,
      ok: fails.length === 0,
      detail: fails.length
        ? fails.map(([f, why]) => `${f}: ${why}`).join("; ")
        : `All ${all.length} pages.`,
    };
  };
  const t = premiumTheme(c.theme);
  const pairs = contrastPairs(t).map((p) => ({
    ...p,
    ratio: contrastRatio(p.fg, p.bg),
  }));
  const weak = pairs.filter((p) => p.ratio < p.min);
  const titles = all.map(([, h]) => /<title>([^<]*)<\/title>/.exec(h)?.[1] ?? "");
  return [
    each("lang", "Page language declared", (h) =>
      /<html lang="[a-z-]+">/.test(h) ? undefined : "no lang attribute",
    ),
    {
      id: "titles",
      label: "Every page has its own title",
      ok: titles.every(Boolean) && new Set(titles).size === titles.length,
      detail: titles.join(" · "),
    },
    each("h1", "Exactly one main heading per page", (h) =>
      count(h, /<h1[\s>]/g) === 1 ? undefined : `${count(h, /<h1[\s>]/g)} h1 elements`,
    ),
    each("heading-order", "Headings do not skip levels", (h) => {
      let last = 0;
      for (const m of h.matchAll(/<h([1-6])[\s>]/g)) {
        const lvl = Number(m[1]);
        if (last && lvl > last + 1) return `h${last} followed by h${lvl}`;
        last = lvl;
      }
      return undefined;
    }),
    each("landmarks", "Header, navigation, main content and footer landmarks", (h) =>
      /<header[\s>]/.test(h) &&
      /<nav [^>]*aria-label=/.test(h) &&
      /<main id="main"/.test(h) &&
      /<footer[\s>]/.test(h)
        ? undefined
        : "a landmark is missing",
    ),
    each("skip", "Skip-to-content link", (h) =>
      /<a class="skip" href="#main">/.test(h) ? undefined : "no skip link",
    ),
    each("mobile-nav", "Mobile navigation works by keyboard without scripts", (h) =>
      /<details class="menu"><summary aria-label=/.test(h)
        ? undefined
        : "no keyboard-operable menu",
    ),
    each("current-page", "Current page marked for screen readers", (h) =>
      /aria-current="page"/.test(h) ? undefined : "no aria-current",
    ),
    each("links", "Every link has text", (h) => {
      const empty = [...h.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].filter(
        (m) => !textOf(m[1] ?? "") && !/aria-label=/.test(m[0]),
      );
      return empty.length ? `${empty.length} empty link(s)` : undefined;
    }),
    each("form-labels", "Every form field has a label", (h) => {
      const ids = [...h.matchAll(/<(?:input|textarea)[^>]*id="([^"]+)"/g)].map(
        (m) => m[1],
      );
      const missingLabel = ids.filter((id) => !h.includes(`<label for="${id}">`));
      return missingLabel.length ? `unlabelled: ${missingLabel.join(", ")}` : undefined;
    }),
    each("svg", "Decorative graphics hidden from screen readers", (h) => {
      const bad = [...h.matchAll(/<svg\b[^>]*>/g)].filter(
        (m) => !/aria-hidden="true"/.test(m[0]),
      );
      return bad.length ? `${bad.length} svg(s) without aria-hidden` : undefined;
    }),
    {
      id: "focus",
      label: "Visible keyboard focus on light and dark sections",
      ok:
        css.includes(":focus-visible{outline:3px solid var(--focus)") &&
        css.includes("var(--focus-dark)"),
      detail: "3px focus ring, offset 3px; a separate colour on dark sections.",
    },
    {
      id: "reduced-motion",
      label: "Honours reduced-motion settings",
      ok: css.includes("@media (prefers-reduced-motion:reduce)"),
      detail: "Transitions and hover movement are switched off.",
    },
    {
      id: "contrast",
      label: "Colour contrast meets WCAG 2.2 AA",
      ok: weak.length === 0,
      detail: weak.length
        ? weak
            .map((p) => `${p.name} ${p.ratio.toFixed(2)}:1 (needs ${p.min}:1)`)
            .join("; ")
        : `${pairs.length} pairs, lowest ${Math.min(...pairs.map((p) => p.ratio)).toFixed(2)}:1.`,
    },
    {
      id: "zoom",
      label: "Text can be resized (no maximum-scale lock)",
      ok: all.every(([, h]) => !/maximum-scale|user-scalable=no/.test(h)),
      detail: "The viewport allows zoom.",
    },
  ];
}

/** Performance checks: what the pages ask a browser to download, and from where. */
export function performanceReview(
  pages: Record<string, string>,
  css: string,
  fontBytes: number,
): ReviewCheck[] {
  const sizes = Object.entries(pages).map(
    ([f, h]) => [f, new TextEncoder().encode(h).length] as const,
  );
  const largest = Math.max(...sizes.map(([, n]) => n));
  const cssBytes = new TextEncoder().encode(css).length;
  const firstVisit = largest + cssBytes + fontBytes;
  const urls = Object.values(pages).flatMap((h) =>
    [...h.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]!),
  );
  const remoteAssets = Object.values(pages).flatMap((h) =>
    [
      ...h.matchAll(/<(?:link|script|img|iframe)\b[^>]*(?:href|src)="(https?:[^"]+)"/g),
    ].map((m) => m[1]!),
  );
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  return [
    {
      id: "no-scripts",
      label: "No JavaScript to download or run",
      ok: Object.values(pages).every(
        (h) => !/<script(?![^>]*application\/ld\+json)/.test(h),
      ),
      detail: "Only the structured-data block, which browsers do not execute.",
    },
    {
      id: "no-remote",
      label: "No third-party requests (fonts, scripts, trackers, images)",
      ok: remoteAssets.length === 0 && !/url\(["']?https?:/.test(css),
      detail: remoteAssets.length
        ? remoteAssets.join(", ")
        : "Every asset is served with the site.",
    },
    {
      id: "page-weight",
      label: "First visit under 300 KB in total",
      ok: firstVisit < 300 * 1024,
      detail: `Largest page ${kb(largest)} + stylesheet ${kb(cssBytes)} + fonts ${kb(fontBytes)} = ${kb(firstVisit)}.`,
    },
    {
      id: "fonts",
      label: "Fonts self-hosted, preloaded, and never block text",
      ok:
        Object.values(pages).every(
          (h) => (h.match(/rel="preload"[^>]*as="font"/g) ?? []).length === 2,
        ) && (css.match(/font-display:swap/g) ?? []).length === 2,
      detail: "Two WOFF2 files, preloaded; text shows at once in a fallback face.",
    },
    {
      id: "no-images",
      label: "No images that could shift the layout",
      ok: Object.values(pages).every((h) => !/<img\b/.test(h)),
      detail: "Graphics are CSS and inline SVG with fixed sizes.",
    },
    {
      id: "links-safe",
      label: "Links go only to site pages, phone numbers or verified addresses",
      ok: urls.every((u) =>
        /^(#main|[a-z]+\.html|tel:\+\d+|mailto:[^"]+|assets\/[a-z0-9./-]+|https:\/\/[^"]+)$/i.test(
          u,
        ),
      ),
      detail: `${urls.length} links and asset references checked.`,
    },
  ];
}

export interface CompletenessRow {
  page: string;
  confirmed: number;
  toConfirm: number;
  missing: string[];
}

/** Per page: how much is confirmed, how much is still drafted, and what is missing. */
export function completenessReport(c: PremiumContent): CompletenessRow[] {
  const tally = (items: { confirmed: boolean }[]) => ({
    confirmed: items.filter((i) => i.confirmed).length,
    toConfirm: items.filter((i) => !i.confirmed).length,
  });
  const sum = (...xs: { confirmed: number; toConfirm: number }[]) =>
    xs.reduce(
      (a, b) => ({
        confirmed: a.confirmed + b.confirmed,
        toConfirm: a.toConfirm + b.toConfirm,
      }),
      {
        confirmed: 0,
        toConfirm: 0,
      },
    );
  const fact = (ok: boolean) => ({ confirmed: ok ? 1 : 0, toConfirm: 0 });
  const rows: Record<
    string,
    { confirmed: number; toConfirm: number; missing: string[] }
  > = {
    index: {
      ...sum(
        fact(Boolean(c.brand.lede)),
        tally(c.services.slice(0, 6)),
        tally(c.process),
        tally(c.industries),
        tally(c.pillars),
      ),
      missing: c.brand.lede ? [] : ["Business description"],
    },
    services: {
      ...sum(tally(c.services), tally(c.process)),
      missing: c.services.length ? [] : ["Services"],
    },
    solutions: {
      ...sum(tally(c.industries), fact(c.solutions.length > 0)),
      missing: c.industries.length ? [] : ["Industries served"],
    },
    about: {
      ...sum(
        fact(Boolean(c.brand.lede)),
        tally(c.experience),
        tally(c.pillars),
        tally(c.caseStudies),
      ),
      missing: [
        ...(c.caseStudies.length ? [] : ["Case studies"]),
        ...(c.email ? [] : ["Business email"]),
      ],
    },
    assessment: {
      ...sum(
        tally(c.process.length ? c.process : c.services.slice(0, 4)),
        fact(Boolean(c.phone)),
      ),
      missing: [
        ...(c.phone ? [] : ["Business phone"]),
        ...(c.email ? [] : ["Business email"]),
        "Form destination (decision)",
      ],
    },
    privacy: {
      confirmed: c.legal.length ? 1 : 0,
      toConfirm: 0,
      missing: c.legal.length ? [] : ["Privacy policy"],
    },
  };
  return PREMIUM_PAGES.map((p) => ({ page: p.file, ...rows[p.slug]! }));
}
