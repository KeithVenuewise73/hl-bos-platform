// Premium Business Site: components and pages. Every component takes content
// from PremiumContent (a verified Business Profile) and the theme; none names
// a business. Output is plain, self-contained HTML per page:
//   * no scripts at all (the mobile menu is a <details> disclosure, which works
//     with a keyboard and a screen reader and needs no JavaScript);
//   * every value escaped; links are relative pages, tel:, or verified https;
//   * an internal-draft banner and noindex on every page;
//   * the contact form is disabled; it has no action and no submit button;
//   * items not yet confirmed carry a visible "To confirm" marker, and missing
//     facts show "Information required" -- never invented content.

import { esc } from "../html.ts";
import { TOOL_STATUS } from "../render-professional.ts";
import type { ToolItem } from "../types.ts";
import type { PremiumContent, PremiumItem } from "./content.ts";
import { premiumTheme, type PremiumTheme } from "./themes.ts";

export interface PremiumPageDef {
  slug: string;
  file: string;
  /** Navigation label; undefined = not in the main navigation. */
  nav: (c: PremiumContent) => string | undefined;
  title: (c: PremiumContent) => string;
}

export const PREMIUM_PAGES: PremiumPageDef[] = [
  {
    slug: "index",
    file: "index.html",
    nav: () => undefined,
    title: (c) => `${c.brand.name} | ${c.brand.descriptor}`,
  },
  {
    slug: "services",
    file: "services.html",
    nav: () => "Services",
    title: (c) => `Services | ${c.brand.name}`,
  },
  {
    slug: "solutions",
    file: "solutions.html",
    nav: (c) => (c.solutions.length ? "Industries & solutions" : "Industries"),
    title: (c) =>
      `${c.solutions.length ? "Industries & solutions" : "Industries"} | ${c.brand.name}`,
  },
  {
    slug: "about",
    file: "about.html",
    nav: () => "About",
    title: (c) => `About | ${c.brand.name}`,
  },
  {
    slug: "assessment",
    file: "assessment.html",
    nav: () => "Assessment",
    title: (c) => `${c.primaryCta} | ${c.brand.name}`,
  },
  {
    slug: "privacy",
    file: "privacy.html",
    nav: () => undefined,
    title: (c) => `Privacy | ${c.brand.name}`,
  },
];

export const STATUS_ORDER: ToolItem["status"][] = [
  "live",
  "in_use",
  "pilot",
  "in_development",
  "planned",
  "concept",
];

const STATUS_MEANING: Partial<Record<ToolItem["status"], string>> = {
  live: "customers can use it today",
  pilot: "in use in a pilot; not yet offered to customers",
  in_development: "built and being tested; not yet offered",
  planned: "committed; not built yet",
  concept: "an idea being explored",
};

// --- small parts -------------------------------------------------------------

const ICONS = [
  '<path d="M4 12h16M12 4v16" /><circle cx="12" cy="12" r="8" />',
  '<path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" />',
  '<circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h4a4 4 0 004-4V8" />',
  '<rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 13v7M13 16.5h7" />',
  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />',
  '<path d="M12 3l2.6 5.6L20 9.5l-4 4 1 5.5-5-2.7L7 19l1-5.5-4-4 5.4-.9z" />',
];
const icon = (i: number) =>
  `<span class="icon" aria-hidden="true"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[i % ICONS.length]}</svg></span>`;
const PHONE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /></svg>';
const ARROW_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>';

/** The internal "to confirm" marker for drafted, unconfirmed content. */
const tbc = (i: PremiumItem) =>
  i.confirmed
    ? ""
    : '<span class="tbc" title="Drafted, not yet confirmed: verify in the Business Profile before launch">To confirm</span>';

/** An internal notice where a fact is missing. Never replaced by invented content. */
export const missing = (what: string) =>
  `<p class="missing" role="note"><strong>Information required:</strong> <span>${esc(what)}</span></p>`;

const sectionHead = (eyebrow: string, title: string, lede?: string, stacked = false) =>
  `<div class="section-head${stacked || !lede ? " stacked" : ""}"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>${lede ? `<p class="lede">${esc(lede)}</p>` : ""}</div>`;

function callButton(c: PremiumContent, cls: string): string {
  return c.phone
    ? `<a class="btn ${cls}" href="tel:${esc(c.phone.link)}">${PHONE_SVG}<span>${esc(c.secondaryCta)}</span><span class="sr-only"> at ${esc(c.phone.display)}</span></a>`
    : "";
}

function primaryButton(c: PremiumContent, cls = "btn-primary"): string {
  return `<a class="btn ${cls}" href="assessment.html"><span>${esc(c.primaryCta)}</span>${ARROW_SVG}</a>`;
}

// --- page chrome ---------------------------------------------------------------

function draftBanner(c: PremiumContent, version: number, prepared: string): string {
  return `<div class="draft" role="note"><div class="wrap"><span><strong>Internal draft — not published.</strong> Premium site draft, version ${esc(version)}, prepared ${esc(prepared)}.</span>${c.plannedDomain ? `<span>Planned address: ${esc(c.plannedDomain)} (not configured).</span>` : ""}${c.missing.length ? `<span>${esc(c.missing.length)} item(s) need information before launch.</span>` : ""}</div></div>`;
}

function header(c: PremiumContent, slug: string): string {
  const links = PREMIUM_PAGES.filter((p) => p.nav(c)).map(
    (p) =>
      `<a href="${p.file}"${p.slug === slug ? ' aria-current="page"' : ""}>${esc(p.nav(c))}</a>`,
  );
  return `<header class="site-header"><div class="wrap bar">
<a class="brand" href="index.html"${slug === "index" ? ' aria-current="page"' : ""}><span class="mark" aria-hidden="true">${esc(c.brand.mark)}</span><span class="brand-name">${esc(c.brand.name)}${c.brand.name.toLowerCase().includes(c.brand.descriptor.toLowerCase()) ? "" : `<small>${esc(c.brand.descriptor)}</small>`}</span></a>
<nav class="nav" aria-label="Main">${links.join("")}</nav>
<a class="btn btn-primary header-cta" href="assessment.html">${esc(shortCta(c))}</a>
<details class="menu"><summary aria-label="Open the menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>Menu</summary>
<nav class="menu-panel" aria-label="Mobile"><a href="index.html"${slug === "index" ? ' aria-current="page"' : ""}>Home</a>${links.join("")}<a class="btn btn-primary" href="assessment.html">${esc(c.primaryCta)}</a>${callButton(c, "btn-line")}</nav>
</details>
</div></header>`;
}

/** "Request a Business Transformation Assessment" is long for a header button. */
function shortCta(c: PremiumContent): string {
  if (c.primaryCta.length <= 24) return c.primaryCta;
  return /assessment/i.test(c.primaryCta) ? "Request an assessment" : "Get in touch";
}

function footer(c: PremiumContent, year: string, slug: string): string {
  const cur = (s: string) => (s === slug ? ' aria-current="page"' : "");
  const pages = PREMIUM_PAGES.filter((p) => p.nav(c));
  return `<footer class="footer on-dark"><div class="wrap">
<div class="foot-grid">
<div><a class="brand" href="index.html"><span class="mark" aria-hidden="true">${esc(c.brand.mark)}</span><span class="brand-name">${esc(c.brand.name)}</span></a>${c.brand.lede ? `<p style="margin-top:1.1rem;max-width:42ch">${esc(c.brand.lede)}</p>` : ""}</div>
<div><h2>Pages</h2><ul><li><a href="index.html">Home</a></li>${pages.map((p) => `<li><a href="${p.file}"${cur(p.slug)}>${esc(p.nav(c))}</a></li>`).join("")}</ul></div>
<div><h2>Contact</h2><ul>${c.phone ? `<li><a href="tel:${esc(c.phone.link)}">${esc(c.phone.display)}</a></li>` : ""}${c.email ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : "<li>Email: information required</li>"}${c.serviceArea ? `<li>${esc(c.serviceArea)}</li>` : ""}</ul></div>
<div><h2>Legal</h2><ul>${c.legal.map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join("") || `<li><a href="privacy.html"${cur("privacy")}>Privacy (readiness)</a></li>`}</ul></div>
</div>
<div class="foot-base"><span>&copy; ${esc(year)} ${esc(c.brand.name)}</span><span>Internal draft. Not published.</span></div>
</div></footer>`;
}

function page(
  c: PremiumContent,
  t: PremiumTheme,
  slug: string,
  main: string,
  meta: { version: number; prepared: string },
): string {
  const def = PREMIUM_PAGES.find((p) => p.slug === slug)!;
  const ld =
    slug === "index"
      ? `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ProfessionalService",
          name: c.brand.name,
          ...(c.phone ? { telephone: c.phone.display } : {}),
          ...(c.serviceArea ? { areaServed: c.serviceArea } : {}),
        })
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026")}</script>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(def.title(c))}</title>
${c.brand.lede ? `<meta name="description" content="${esc(c.brand.lede)}">` : ""}
<meta name="theme-color" content="${t.colors.dark}">
<link rel="preload" href="assets/fonts/${t.display.file}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/${t.body.file}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/site.css">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${draftBanner(c, meta.version, meta.prepared)}
${header(c, slug)}
<main id="main" tabindex="-1">
${main}
</main>
${footer(c, meta.prepared.slice(0, 4), slug)}
</body>
</html>
`;
}

// --- sections ----------------------------------------------------------------

function hero(c: PremiumContent, t: PremiumTheme): string {
  const composition =
    t.hero === "route" && c.experience.length >= 3
      ? `<div class="route" aria-label="Operating experience across the chain"><h2>Operating experience</h2><ol>${c.experience.map((e) => `<li>${esc(e.name)}</li>`).join("")}</ol><p>${esc(c.experience[0]!.name)} to ${esc(c.experience.at(-1)!.name.toLowerCase())}: the complete chain.</p></div>`
      : c.services.length >= 3
        ? `<div class="stack"><div class="stack-card"><h2>${esc(c.primaryCta.replace(/^Request an? /i, "The "))}</h2><ol>${c.services
            .slice(0, 4)
            .map(
              (s) =>
                `<li><div>${esc(s.name)}${tbc(s)}${s.description ? `<span>${esc(s.description)}</span>` : ""}</div></li>`,
            )
            .join("")}</ol></div></div>`
        : "";
  return `<section class="hero on-dark" aria-labelledby="hero-title"><div class="wrap hero-grid">
<div>
<p class="eyebrow">${esc(c.brand.descriptor)}</p>
<h1 id="hero-title">${esc(c.brand.headline)}</h1>
${c.brand.lede ? `<p class="lede">${esc(c.brand.lede)}</p>` : missing("an approved description of the business.")}
${c.brand.credibility ? `<p class="credential"><i aria-hidden="true"></i>${esc(c.brand.credibility)}</p>` : ""}
<div class="actions">${primaryButton(c)}${callButton(c, "btn-ghost")}</div>
${c.phone || c.serviceArea ? `<p class="hero-meta">${c.phone ? `<span>Call <a href="tel:${esc(c.phone.link)}">${esc(c.phone.display)}</a></span>` : ""}${c.serviceArea ? `<span>Serving ${esc(c.serviceArea)}</span>` : ""}</p>` : ""}
</div>
${composition}
</div></section>`;
}

function pageHead(
  c: PremiumContent,
  title: string,
  lede: string | undefined,
  crumb: string,
): string {
  return `<section class="page-head on-dark" aria-labelledby="page-title"><div class="wrap">
<p class="crumbs"><a href="index.html">Home</a> <span aria-hidden="true">/</span> ${esc(crumb)}</p>
<p class="eyebrow">${esc(c.brand.name)}</p>
<h1 id="page-title">${esc(title)}</h1>
${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
</div></section>`;
}

function serviceCards(items: PremiumItem[], numbered = true): string {
  return items
    .map(
      (s, i) =>
        `<article class="card">${numbered ? `<span class="num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>` : icon(i)}<h3>${esc(s.name)}${tbc(s)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}</article>`,
    )
    .join("");
}

const cols = (n: number) =>
  n % 3 === 0 || n >= 5 ? "cols-3" : n === 4 ? "cols-2" : "cols-2";

function servicesSection(
  c: PremiumContent,
  limit: number | undefined,
  band = false,
): string {
  if (!c.services.length)
    return `<section class="section"><div class="wrap">${sectionHead("Services", "Services")}${missing("the verified list of services.")}</div></section>`;
  const shown = limit ? c.services.slice(0, limit) : c.services;
  return `<section class="section${band ? " band" : ""}" aria-labelledby="services-title"><div class="wrap">
${sectionHead("Services", limit ? "What we do" : "Every service, in detail", limit ? `${c.brand.name} works across ${c.services.length} connected services.` : undefined).replace("<h2>", '<h2 id="services-title">')}
<div class="grid ${cols(shown.length)}">${serviceCards(shown)}</div>
${limit && c.services.length > limit ? `<p class="more"><a class="btn btn-line" href="services.html"><span>All ${esc(c.services.length)} services</span>${ARROW_SVG}</a></p>` : ""}
</div></section>`;
}

function processSection(c: PremiumContent, band = false): string {
  if (!c.process.length) return "";
  return `<section class="section${band ? " band" : ""}" aria-labelledby="process-title"><div class="wrap">
${sectionHead("How we work", "How an engagement works").replace("<h2>", '<h2 id="process-title">')}
<ol class="timeline" style="--steps:${Math.min(c.process.length, 5)}">${c.process
    .map(
      (s, i) =>
        `<li><span class="step" aria-hidden="true">${i + 1}</span><h3>${esc(s.name)}${tbc(s)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}</li>`,
    )
    .join("")}</ol>
</div></section>`;
}

function industriesSection(
  c: PremiumContent,
  band = false,
  heading = "Who we work with",
): string {
  if (!c.industries.length)
    return `<section class="section${band ? " band" : ""}"><div class="wrap">${sectionHead("Industries", heading)}${missing("the industries or customer types served.")}</div></section>`;
  return `<section class="section${band ? " band" : ""}" aria-labelledby="industries-title"><div class="wrap">
${sectionHead("Industries", heading).replace("<h2>", '<h2 id="industries-title">')}
<div class="grid ${cols(c.industries.length)}">${serviceCards(c.industries, false)}</div>
</div></section>`;
}

function pillarsSection(c: PremiumContent, band = false): string {
  if (!c.pillars.length) return "";
  return `<section class="section${band ? " band" : ""}" aria-labelledby="pillars-title"><div class="wrap">
${sectionHead("Why us", `Why ${c.brand.name}`).replace("<h2>", '<h2 id="pillars-title">')}
<div class="pillars">${c.pillars.map((p) => `<div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p></div>`).join("")}</div>
</div></section>`;
}

function solutionsSection(c: PremiumContent, band = false, limit?: number): string {
  if (!c.solutions.length) return "";
  const sorted = [...c.solutions].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const used = STATUS_ORDER.filter((s) => sorted.some((x) => x.status === s));
  return `<section class="section${band ? " band" : ""}" aria-labelledby="solutions-title"><div class="wrap">
${sectionHead("Solutions", "Products and tools", "Each one is labelled with where it really stands.").replace("<h2>", '<h2 id="solutions-title">')}
<ul class="legend">${used.map((s) => `<li><strong>${esc(TOOL_STATUS[s])}</strong> — ${esc(STATUS_MEANING[s] ?? "")}</li>`).join("")}</ul>
<div class="grid ${cols(shown.length)}">${shown
    .map(
      (s, i) =>
        `<article class="card">${icon(i + 2)}<h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="card-foot"><span class="status status-${esc(s.status)}">${esc(TOOL_STATUS[s.status])}</span></div></article>`,
    )
    .join("")}</div>
${limit && sorted.length > limit ? `<p class="more"><a class="btn btn-line" href="solutions.html"><span>All products and tools</span>${ARROW_SVG}</a></p>` : ""}
</div></section>`;
}

function experienceSection(c: PremiumContent, band = false): string {
  if (!c.experience.length) return "";
  return `<section class="section${band ? " band" : ""}" aria-labelledby="experience-title"><div class="wrap">
${sectionHead("Experience", c.brand.credibility ?? "Experience", undefined).replace("<h2>", '<h2 id="experience-title">')}
<ul class="chain">${c.experience.map((e) => `<li>${esc(e.name)}</li>`).join("")}</ul>
</div></section>`;
}

function proofSection(c: PremiumContent, band = false): string {
  return `<section class="section${band ? " band" : ""}" aria-labelledby="proof-title"><div class="wrap">
${sectionHead("Proof", "Case studies").replace("<h2>", '<h2 id="proof-title">')}
${
  c.caseStudies.length
    ? `<div class="grid ${cols(c.caseStudies.length)}">${serviceCards(c.caseStudies, false)}</div>`
    : missing(
        "verified case studies, with each client's written permission. No results, statistics or testimonials are shown until they are checked.",
      )
}
</div></section>`;
}

function ctaBand(c: PremiumContent): string {
  return `<section class="cta on-dark" aria-labelledby="cta-title"><div class="wrap">
<div><h2 id="cta-title">${esc(c.primaryCta)}</h2><p>${c.phone ? `Start with a conversation: call ${esc(c.phone.display)}, or request an assessment.` : "Start with a conversation."}</p></div>
<div class="actions" style="margin-top:0">${primaryButton(c)}${callButton(c, "btn-ghost")}</div>
</div></section>`;
}

function contactPanel(c: PremiumContent): string {
  return `<aside class="panel on-dark" aria-labelledby="contact-title"><h2 id="contact-title" style="font-size:1.5rem">Talk to ${esc(c.brand.name)}</h2>
<dl>
<div><dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone.link)}">${esc(c.phone.display)}</a>` : "Information required"}</dd></div>
<div><dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "Information required"}</dd></div>
${c.serviceArea ? `<div><dt>Serving</dt><dd>${esc(c.serviceArea)}</dd></div>` : ""}
</dl>
${callButton(c, "btn-primary")}
</aside>`;
}

function disabledForm(c: PremiumContent): string {
  return `<form class="form" aria-labelledby="form-title" aria-describedby="form-note">
<h2 id="form-title" style="font-size:1.5rem;margin-bottom:1.2rem">${esc(c.primaryCta)}</h2>
<fieldset disabled style="border:0;margin:0;padding:0;min-width:0">
<legend class="sr-only">Assessment request (switched off in this draft)</legend>
<div class="form-grid">
<div class="field"><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name"></div>
<div class="field"><label for="f-org">Business name</label><input id="f-org" name="organization" autocomplete="organization"></div>
<div class="field"><label for="f-phone">Phone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
<div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email"></div>
<div class="field full"><label for="f-msg">What should the assessment focus on?</label><textarea id="f-msg" name="message" rows="4"></textarea></div>
</div>
</fieldset>
<p class="form-note" id="form-note">This form is switched off. It goes live only after a destination for messages and a privacy policy are approved.${c.phone ? ` For now, call <a href="tel:${esc(c.phone.link)}">${esc(c.phone.display)}</a>.` : ""}</p>
</form>`;
}

// --- pages -------------------------------------------------------------------

function homeMain(c: PremiumContent, t: PremiumTheme): string {
  return [
    hero(c, t),
    servicesSection(c, 6),
    processSection(c, true),
    industriesSection(c),
    pillarsSection(c, true),
    solutionsSection(c, true, 3),
    t.hero === "route" ? "" : experienceSection(c, true),
    ctaBand(c),
  ].join("\n");
}

function servicesMain(c: PremiumContent): string {
  return [
    pageHead(c, "Services", c.brand.lede, "Services"),
    servicesSection(c, undefined),
    processSection(c, true),
    ctaBand(c),
  ].join("\n");
}

function solutionsMain(c: PremiumContent): string {
  const title = c.solutions.length ? "Industries & solutions" : "Industries";
  return [
    pageHead(c, title, c.brand.lede, title),
    industriesSection(c, false, "Industries we serve"),
    solutionsSection(c, true),
    ctaBand(c),
  ].join("\n");
}

function aboutMain(c: PremiumContent): string {
  return [
    pageHead(c, `About ${c.brand.name}`, c.brand.credibility, "About"),
    `<section class="section" aria-labelledby="about-title"><div class="wrap split">
<div class="prose"><p class="eyebrow">Who we are</p><h2 id="about-title" style="margin-bottom:1.4rem">${esc(c.brand.descriptor)}</h2>${c.brand.lede ? `<p class="lede">${esc(c.brand.lede)}</p>` : missing("an approved description of the business.")}</div>
${contactPanel(c)}
</div></section>`,
    experienceSection(c, true),
    pillarsSection(c),
    proofSection(c, true),
    ctaBand(c),
  ].join("\n");
}

function assessmentMain(c: PremiumContent): string {
  const steps = c.process.length ? c.process : c.services.slice(0, 4);
  return [
    pageHead(c, c.primaryCta, c.brand.lede, "Assessment"),
    `<section class="section" aria-labelledby="what-title"><div class="wrap">
${sectionHead("The assessment", c.process.length ? "What happens" : "What the assessment looks at").replace("<h2>", '<h2 id="what-title">')}
<ol class="timeline" style="--steps:${Math.min(steps.length, 5)}">${steps
      .map(
        (s, i) =>
          `<li><span class="step" aria-hidden="true">${i + 1}</span><h3>${esc(s.name)}${tbc(s)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}</li>`,
      )
      .join("")}</ol>
</div></section>`,
    `<section class="section band" aria-label="Request and contact"><div class="wrap split">
${disabledForm(c)}
${contactPanel(c)}
</div></section>`,
  ].join("\n");
}

const PRIVACY_TOPICS = [
  "Who is responsible for the site and how to contact them.",
  "What the contact form collects (name, business, phone, email, message) and why.",
  "Where messages go and who can read them.",
  "How long information is kept, and how it is deleted.",
  "Whether anything is shared with other companies (for example, an email or CRM provider).",
  "Any analytics or cookies (this draft uses none).",
  "How someone can ask to see, correct or delete their information.",
];

function privacyMain(c: PremiumContent): string {
  return [
    pageHead(c, "Privacy", undefined, "Privacy"),
    `<section class="section" aria-labelledby="privacy-title"><div class="wrap" style="max-width:860px">
<h2 id="privacy-title" style="margin-bottom:1.4rem">Legal readiness</h2>
${c.legal.length ? `<p class="lede">The approved policy: ${c.legal.map((l) => `<a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a>`).join(" · ")}</p>` : missing("a privacy policy. It must be prepared and approved before the contact form is switched on or the site is published.")}
<p class="lede" style="margin-top:2rem;color:var(--ink)">What the policy needs to cover for this site:</p>
<ul class="readiness">${PRIVACY_TOPICS.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
</div></section>`,
  ].join("\n");
}

const MAINS: Record<string, (c: PremiumContent, t: PremiumTheme) => string> = {
  index: homeMain,
  services: servicesMain,
  solutions: solutionsMain,
  about: aboutMain,
  assessment: assessmentMain,
  privacy: privacyMain,
};

/** One page of the site. */
export function renderPremiumPage(
  c: PremiumContent,
  slug: string,
  meta: { version: number; prepared: string },
): string {
  const t = premiumTheme(c.theme);
  const main = MAINS[slug];
  if (!main) throw new Error(`No premium page "${slug}".`);
  return page(c, t, slug, main(c, t), meta);
}

/** Every page, keyed by file name. */
export function renderPremiumSite(
  c: PremiumContent,
  meta: { version: number; prepared: string },
): Record<string, string> {
  return Object.fromEntries(
    PREMIUM_PAGES.map((p) => [p.file, renderPremiumPage(c, p.slug, meta)]),
  );
}
