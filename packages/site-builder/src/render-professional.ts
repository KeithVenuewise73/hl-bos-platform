// The professional-services page: the shared HLG design with the sections a
// consulting or advisory firm needs. Used for prospect demos of professional
// firms and for HLG's own internal drafts.
//
// Same safety properties as the local-business page (render.ts): everything
// escaped, no script but the JSON-LD block, noindex, inert form, sample items
// marked. In addition:
//   * internal drafts say "Internal draft — not published" and never "Demo
//     prepared by HLG";
//   * a section with no verified content shows an internal "information
//     required" notice instead of a claim -- experience and case studies are
//     NEVER filled with sample text;
//   * a planned product is labelled "Planned", never shown as available.

import { FONTS_HREF, siteCss } from "./design.ts";
import { esc, initials, jsonLd, sampleTag } from "./html.ts";
import type { Offering, SiteDraft, ToolItem } from "./types.ts";
import { verticalDef } from "./verticals.ts";

const TOOL_STATUS: Record<ToolItem["status"], string> = {
  live: "Available",
  in_development: "In development",
  planned: "Planned",
  in_use: "In use",
};

export const PRO_CSS = `.notice{border:1.5px dashed #d9b75c;background:#fffaf0;color:#5a4300;border-radius:var(--radius-sm);padding:.9rem 1.1rem;font-size:.92rem}
.notice strong{color:#3d2d00}
.steps{counter-reset:step;display:grid;gap:1.2rem;grid-template-columns:repeat(4,1fr)}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1.4rem;position:relative}
.step::before{counter-increment:step;content:counter(step,decimal-leading-zero);font-family:'Fraunces',serif;font-weight:600;font-size:1.5rem;color:var(--accent);display:block;margin-bottom:.4rem}
.step h3{font-size:1.12rem}.step p{color:var(--muted);font-size:.95rem;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:.7rem;list-style:none;padding:0;margin:0}
.chips li{background:var(--accent-soft);color:var(--accent-dark);border-radius:999px;padding:.5rem 1rem;font-weight:600;font-size:.92rem}
.chips li span{font-weight:400;color:var(--ink-soft)}
.tool-status{display:inline-block;margin-top:.7rem;padding:.12rem .55rem;border-radius:5px;font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:var(--paper-2);border:1px solid var(--line);color:var(--muted)}
.tool-status.live,.tool-status.in_use{background:var(--accent-soft);color:var(--accent-dark);border-color:transparent}
.verified{display:inline-block;margin-left:.5rem;font-size:.7rem;color:var(--accent-dark);font-family:'Inter',sans-serif;font-weight:600}
.legal{display:flex;gap:1.2rem;flex-wrap:wrap;margin-top:.8rem}
.brand-mark.has-mark{font-size:1rem}
@media(max-width:980px){.steps{grid-template-columns:repeat(2,1fr)}}
@media(max-width:620px){.steps{grid-template-columns:1fr}.hero .wrap{padding-left:20px;padding-right:20px}.wrap{padding:0 18px}}`;

function cards(items: Offering[], internal: boolean): string {
  return items
    .map(
      (o) =>
        `<article class="card"><div class="ico">${esc(initials(o.name))}</div><h3>${esc(o.name)}${sampleTag(o.sample)}${internal && o.verified ? '<span class="verified">Verified</span>' : ""}</h3>${o.description && o.description !== o.name ? `<p>${esc(o.description)}</p>` : ""}</article>`,
    )
    .join("");
}

const gridClass = (n: number) => (n % 3 === 0 || n > 4 ? "g-3" : "g-2");

function notice(what: string): string {
  return `<p class="notice" role="note"><strong>Information required:</strong> ${esc(what)}</p>`;
}

export function renderProfessional(draft: SiteDraft): string {
  const f = draft.facts;
  const c = draft.copy;
  const pro = c.pro;
  if (!pro) throw new Error("A professional-services draft needs its sections.");
  const internal = draft.mode === "internal_draft";
  const def = verticalDef(draft.vertical);
  const tel = f.phoneLink ? `tel:${f.phoneLink}` : undefined;
  const prepared = draft.updatedAt.slice(0, 10);
  const anySample =
    c.aboutSample ||
    [...c.offerings, ...pro.challenges, ...pro.process, ...pro.industries].some(
      (o) => o.sample,
    );
  const mark = draft.brand?.mark ?? initials(f.businessName);

  const banner = internal
    ? `<div class="demo-banner" role="note"><strong>Internal draft — not published.</strong> ${esc(f.businessName)} website draft, version ${esc(draft.version)}, prepared ${esc(prepared)} for internal review. Not for public use until approved.${draft.infoRequired?.length ? ` ${esc(draft.infoRequired.length)} item(s) marked <strong>Information required</strong> must be supplied first.` : ""}</div>`
    : `<div class="demo-banner" role="note"><strong>Demo website</strong> prepared by Herman Legacy Group for ${esc(f.businessName)} on ${esc(prepared)}. It is not ${esc(f.businessName)}&rsquo;s official website.${anySample ? " Items marked <strong>Sample</strong> are placeholders to be replaced with the business&rsquo;s own." : ""}</div>`;

  const primary = `<a class="btn btn-light" href="#contact">${esc(pro.primaryCta)}</a>`;
  const secondary = tel
    ? `<a class="btn btn-outline-light" href="${esc(tel)}">Call ${esc(f.phone)}</a>`
    : pro.secondaryCta
      ? `<a class="btn btn-outline-light" href="#services">${esc(pro.secondaryCta)}</a>`
      : "";

  const challenges = pro.challenges.length
    ? `<section class="section" id="challenges"><div class="wrap"><div class="section-head"><p class="eyebrow">Challenges</p><h2>${esc(pro.challengesHeading)}</h2></div><div class="grid ${gridClass(pro.challenges.length)}">${cards(pro.challenges, internal)}</div></div></section>`
    : "";

  const services = `<section class="section section-tint" id="services"><div class="wrap"><div class="section-head"><p class="eyebrow">${esc(c.offeringsHeading)}</p><h2>${esc(c.offeringsHeading)}</h2><p class="lede">${esc(c.offeringsIntro)}</p></div><div class="grid ${gridClass(c.offerings.length)}">${cards(c.offerings, internal)}</div></div></section>`;

  const process = pro.process.length
    ? `<section class="section" id="process"><div class="wrap"><div class="section-head"><p class="eyebrow">Process</p><h2>${esc(pro.processHeading)}</h2></div><div class="steps">${pro.process.map((s) => `<div class="step"><h3>${esc(s.name)}${sampleTag(s.sample)}</h3><p>${esc(s.description)}</p></div>`).join("")}</div></div></section>`
    : "";

  const industries = `<section class="section section-tint" id="industries"><div class="wrap"><div class="section-head"><p class="eyebrow">Industries</p><h2>${esc(pro.industriesHeading)}</h2></div>${
    pro.industries.length
      ? `<ul class="chips">${pro.industries.map((i) => `<li>${esc(i.name)}${sampleTag(i.sample)}</li>`).join("")}</ul>`
      : notice("the industries or customer types served.")
  }</div></section>`;

  const experience = `<section class="section" id="experience"><div class="wrap"><div class="section-head"><p class="eyebrow">Experience</p><h2>${esc(pro.experienceHeading)}</h2></div>${
    pro.experience.length
      ? `<div class="grid ${gridClass(pro.experience.length)}">${cards(pro.experience, internal)}</div>`
      : internal
        ? notice(
            "approved experience and qualifications. Nothing is shown until it is verified.",
          )
        : notice(
            `${f.businessName}'s own experience and qualifications, supplied and approved by the owner.`,
          )
  }</div></section>`;

  const proof = `<section class="section section-tint" id="proof"><div class="wrap"><div class="section-head"><p class="eyebrow">Proof</p><h2>${esc(pro.proofHeading)}</h2></div>${
    pro.proof.length
      ? `<div class="grid ${gridClass(pro.proof.length)}">${cards(pro.proof, internal)}</div>`
      : notice(
          "verified case studies or examples of work, with the client's permission. No results, statistics or testimonials are shown until they are checked.",
        )
  }</div></section>`;

  const tools = pro.tools.length
    ? `<section class="section" id="tools"><div class="wrap"><div class="section-head"><p class="eyebrow">Tools</p><h2>${esc(pro.toolsHeading)}</h2></div><div class="grid ${gridClass(pro.tools.length)}">${pro.tools.map((t) => `<article class="card"><div class="ico">${esc(initials(t.name))}</div><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><span class="tool-status ${esc(t.status)}">${esc(TOOL_STATUS[t.status])}</span></article>`).join("")}</div></div></section>`
    : "";

  const reach = [
    f.phone && tel
      ? `<li><div class="k">Call</div><div class="v"><a href="${esc(tel)}">${esc(f.phone)}</a></div></li>`
      : "",
    f.email
      ? `<li><div class="k">Email</div><div class="v"><a href="mailto:${esc(f.email)}">${esc(f.email)}</a></div></li>`
      : "",
    f.address
      ? `<li><div class="k">Address</div><div class="v">${esc(f.address)}</div></li>`
      : "",
    f.city
      ? `<li><div class="k">Serving</div><div class="v">${esc(f.city)}</div></li>`
      : "",
  ].join("");

  const about = `<section class="section" id="about"><div class="wrap split">
<div><p class="eyebrow">About</p><h2>${esc(c.aboutHeading)}${sampleTag(c.aboutSample)}</h2><p class="lede">${esc(c.aboutBody)}</p></div>
<aside class="panel"><h3>Reach ${esc(f.businessName)}</h3><ul class="info-list">${reach || "<li>Contact details to be added.</li>"}</ul></aside>
</div></section>`;

  const formNote = internal
    ? "This form is switched off. It goes live only after a destination for messages and a privacy policy are approved."
    : "This form is switched off in the demo and goes live at launch.";

  const contact = `<section class="section section-tint" id="contact"><div class="wrap">
<div class="section-head"><p class="eyebrow">Contact</p><h2>${esc(c.ctaHeading)}</h2><p class="lede">${esc(c.ctaBody)}</p></div>
${internal && !f.phone && !f.email ? notice("a business phone number or email address. There is no way to contact the business until one is verified.") : ""}
<div class="form-wrap"><form aria-label="Contact form (switched off)">
<div class="form-grid">
<div class="field"><label for="n">Name</label><input id="n" disabled></div>
<div class="field"><label for="o">Organization</label><input id="o" disabled></div>
<div class="field full"><label for="m">What would you like to talk about?</label><textarea id="m" rows="4" disabled></textarea></div>
</div>
<p class="form-note">${esc(formNote)}${tel ? ` For now, <a href="${esc(tel)}">call ${esc(f.phone)}</a>.` : ""}</p>
</form></div>
<div class="cta-band" style="margin-top:2.4rem"><h2>${esc(pro.primaryCta)}</h2><div class="btn-row">${primary}${secondary}</div></div>
</div></section>`;

  const legal = (draft.legalLinks ?? [])
    .map((l) => `<a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a>`)
    .join("");
  const footer = internal
    ? `<footer class="site-footer"><div class="wrap">
<div><strong style="color:#fff">${esc(f.businessName)}</strong>${f.city ? ` · ${esc(f.city)}` : ""}${f.phone ? ` · ${esc(f.phone)}` : ""}</div>
${legal ? `<div class="legal">${legal}</div>` : `<div class="legal">${notice("privacy policy and terms links. Required before the contact form is switched on.")}</div>`}
<div class="foot-note">Internal draft, version ${esc(draft.version)}, ${esc(prepared)}. Not published.</div>
</div></footer>`
    : `<footer class="site-footer"><div class="wrap">
<div><strong style="color:#fff">${esc(f.businessName)}</strong>${f.address ? ` · ${esc(f.address)}` : ""}${f.phone ? ` · ${esc(f.phone)}` : ""}</div>
<div class="foot-note">Demo prepared by Herman Legacy Group on ${esc(prepared)} for review by ${esc(f.businessName)}. Not affiliated with or endorsed by ${esc(f.businessName)} until approved by its owner.</div>
</div></footer>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(c.seoTitle)}</title>
<meta name="description" content="${esc(c.metaDescription)}">
<meta property="og:title" content="${esc(c.seoTitle)}">
<meta property="og:description" content="${esc(c.metaDescription)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS_HREF}" rel="stylesheet">
<script type="application/ld+json">${jsonLd(draft)}</script>
<style>${siteCss(draft.vertical, draft.brand)}
${PRO_CSS}</style>
</head>
<body>
${banner}
<header class="site-header"><div class="wrap nav">
<a class="brand" href="#top"><span class="brand-mark${draft.brand?.mark ? " has-mark" : ""}">${esc(mark)}</span><span class="brand-name">${esc(f.businessName)}</span></a>
<ul class="nav-links"><li><a href="#services">Services</a></li><li><a href="#process">How we work</a></li><li><a href="#about">About</a></li><li><a href="#contact">Contact</a></li></ul>
</div></header>
<main id="top">
<section class="hero"><div class="wrap">
<p class="eyebrow">${esc(c.heroEyebrow)}</p>
<h1>${esc(c.heroHeadline)}</h1>
<p>${esc(c.heroSubhead)}</p>
<div class="btn-row">${primary}${secondary}</div>
</div></section>
${def.sections
  .map(
    (s) =>
      ({
        challenges,
        offerings: services,
        process,
        industries,
        experience,
        proof,
        tools,
        about,
        contact,
      })[s as string] ?? "",
  )
  .join("\n")}
</main>
${footer}
</body>
</html>
`;
}
